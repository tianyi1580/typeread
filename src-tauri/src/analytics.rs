use std::cmp::Ordering;
use std::collections::{HashMap, VecDeque};

use crate::models::{
    ConfusionPair, DeepAnalytics, KeystrokeEvent, SessionContext, TransitionGroups, TransitionStat,
    TypingSessionInput, WpmSample,
};

#[derive(Clone)]
pub struct LiveSessionAnalytics {
    #[allow(dead_code)]
    context: SessionContext,
    typing_timestamps: Vec<i64>,
    correct_char_samples: Vec<(i64, String)>,
    confusions: HashMap<(String, String), i64>,
    transitions: HashMap<String, TransitionAccumulator>,
    last_correct_char: Option<(String, i64)>,
    total_events: usize,
    total_keystrokes: i64,
    correct_keystrokes: i64,
}

#[derive(Clone)]
pub struct FinalizedAnalytics {
    pub deep_analytics: DeepAnalytics,
    pub transition_stats: Vec<TransitionStat>,
    pub endurance_segments: i64,
}

#[derive(Clone, Default)]
struct TransitionAccumulator {
    count: i64,
    mean: f64,
    m2: f64,
    error_count: i64,
}

impl TransitionAccumulator {
    fn record_sample(&mut self, delta_ms: f64) {
        self.count += 1;
        let delta = delta_ms - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = delta_ms - self.mean;
        self.m2 += delta * delta2;
    }

    fn record_error(&mut self) {
        self.error_count += 1;
    }

    fn to_stat(&self, combo: String) -> TransitionStat {
        let variance = if self.count > 1 {
            self.m2 / (self.count as f64 - 1.0)
        } else {
            0.0
        };

        TransitionStat {
            combo,
            samples: self.count,
            average_ms: self.mean,
            deviation_ms: variance.max(0.0).sqrt(),
            error_rate: if self.count <= 0 {
                0.0
            } else {
                self.error_count as f64 / self.count as f64
            },
        }
    }
}

impl LiveSessionAnalytics {
    pub fn new(context: SessionContext) -> Self {
        Self {
            context,
            typing_timestamps: Vec::new(),
            correct_char_samples: Vec::new(),
            confusions: HashMap::new(),
            transitions: HashMap::new(),
            last_correct_char: None,
            total_events: 0,
            total_keystrokes: 0,
            correct_keystrokes: 0,
        }
    }

    pub fn push_events(&mut self, events: &[KeystrokeEvent]) -> usize {
        for event in events {
            self.apply_event(event);
        }
        self.total_events
    }

    pub fn finalize(self, session: &TypingSessionInput) -> FinalizedAnalytics {
        let duration_ms = (session.duration_seconds.max(1) * 1000) as i64;
        let end_time_ms = self
            .typing_timestamps
            .last()
            .copied()
            .unwrap_or_else(|| self.typing_timestamps.first().copied().unwrap_or(0) + duration_ms);

        let intervals = build_intervals(&self.typing_timestamps);
        let (filtered_intervals, inactive_ms) = filter_inactive_intervals(&intervals);
        let active_typing_seconds = ((duration_ms - inactive_ms).max(0) as f64 / 1000.0).round() as i64;
        let cadence_cv = coefficient_of_variation(&filtered_intervals);
        let rhythm_score = rhythm_score_from_cv(cadence_cv);
        let _accuracy = if self.total_keystrokes == 0 {
            100.0
        } else {
            (self.correct_keystrokes as f64 * 100.0 / self.total_keystrokes as f64).clamp(0.0, 100.0)
        };
        let focus_score = if duration_ms <= 0 {
            0.0
        } else {
            (active_typing_seconds as f64 * 100.0 / session.duration_seconds.max(1) as f64).clamp(0.0, 100.0)
        };
        let endurance_segments = continuous_endurance_segments(&intervals);
        let wpm_points = rolling_wpm_points(&self.correct_char_samples, 60_000);
        let transition_stats = self
            .transitions
            .iter()
            .map(|(combo, stats)| stats.to_stat(combo.clone()))
            .collect::<Vec<_>>();

        FinalizedAnalytics {
            deep_analytics: DeepAnalytics {
                macro_wpm: downsample_wpm_points(&wpm_points, 500),
                recent_wpm: wpm_points
                    .iter()
                    .filter(|point| point.at >= end_time_ms - 30_000)
                    .cloned()
                    .collect(),
                confusion_pairs: summarize_confusions(&self.confusions),
                transitions: group_transition_stats(&transition_stats),
                rhythm_score,
                cadence_cv,
                focus_score,
                active_typing_seconds,
            },
            transition_stats,
            endurance_segments,
        }
    }

    fn apply_event(&mut self, event: &KeystrokeEvent) {
        self.total_events += 1;
        self.typing_timestamps.push(event.at);

        let expected = normalized_single_char(event.expected.as_deref());
        let typed = normalized_single_char(event.char.as_deref());
        let is_typed_event = matches!(event.r#type.as_str(), "char" | "space");

        if is_typed_event {
            self.total_keystrokes += 1;
            if event.is_correct.unwrap_or(false) {
                self.correct_keystrokes += 1;
            }
        }

        if !is_typed_event {
            if matches!(event.r#type.as_str(), "enter" | "meta") {
                self.last_correct_char = None;
            }
            return;
        }

        let Some(expected_char) = expected else {
            return;
        };

        let is_correct = event.is_correct.unwrap_or_else(|| typed.as_deref() == Some(expected_char.as_str()));
        if is_correct {
            self.correct_char_samples.push((event.at, expected_char.clone()));
            if let Some((previous_char, previous_at)) = &self.last_correct_char {
                if is_transition_candidate(previous_char, &expected_char) {
                    let delta_ms = (event.at - *previous_at) as f64;
                    if delta_ms.is_sign_positive() && delta_ms <= 5_000.0 {
                        self.transitions
                            .entry(format!("{previous_char}{expected_char}"))
                            .or_default()
                            .record_sample(delta_ms);
                    }
                }
            }
            self.last_correct_char = Some((expected_char, event.at));
            return;
        }

        if let Some(typed_char) = typed {
            if is_transition_candidate(&expected_char, &typed_char) && typed_char != expected_char {
                *self.confusions.entry((expected_char.clone(), typed_char)).or_default() += 1;
            }
        }

        if let Some((previous_char, _)) = &self.last_correct_char {
            if is_transition_candidate(previous_char, &expected_char) {
                self.transitions
                    .entry(format!("{previous_char}{expected_char}"))
                    .or_default()
                    .record_error();
            }
        }

        self.last_correct_char = None;
    }
}

pub fn group_transition_stats(stats: &[TransitionStat]) -> TransitionGroups {
    let mut ranked = stats.to_vec();
    ranked.sort_by(|left, right| left.combo.cmp(&right.combo));

    let mut fastest = ranked
        .iter()
        .filter(|item| item.samples >= 3)
        .cloned()
        .collect::<Vec<_>>();
    fastest.sort_by(|left, right| {
        left.average_ms
            .partial_cmp(&right.average_ms)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.samples.cmp(&left.samples))
    });
    fastest.truncate(12);

    let mut slowest = ranked
        .iter()
        .filter(|item| item.samples >= 3)
        .cloned()
        .collect::<Vec<_>>();
    slowest.sort_by(|left, right| {
        right
            .average_ms
            .partial_cmp(&left.average_ms)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.samples.cmp(&left.samples))
    });
    slowest.truncate(12);

    let mut error_prone = ranked
        .iter()
        .filter(|item| item.samples >= 2)
        .cloned()
        .collect::<Vec<_>>();
    error_prone.sort_by(|left, right| {
        right
            .error_rate
            .partial_cmp(&left.error_rate)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.samples.cmp(&left.samples))
    });
    error_prone.truncate(12);

    TransitionGroups {
        fastest,
        slowest,
        error_prone,
    }
}

fn summarize_confusions(confusions: &HashMap<(String, String), i64>) -> Vec<ConfusionPair> {
    let mut pairs = confusions
        .iter()
        .map(|((expected, typed), count)| ConfusionPair {
            expected: expected.clone(),
            typed: typed.clone(),
            count: *count,
        })
        .collect::<Vec<_>>();
    pairs.sort_by(|left, right| right.count.cmp(&left.count).then_with(|| left.expected.cmp(&right.expected)));
    pairs.truncate(96);
    pairs
}

fn build_intervals(timestamps: &[i64]) -> Vec<f64> {
    timestamps
        .windows(2)
        .filter_map(|pair| {
            let delta = pair[1] - pair[0];
            if delta > 0 {
                Some(delta as f64)
            } else {
                None
            }
        })
        .collect()
}

fn filter_inactive_intervals(intervals: &[f64]) -> (Vec<f64>, i64) {
    if intervals.is_empty() {
        return (Vec::new(), 0);
    }

    let median_value = median(intervals);
    let deviations = intervals
        .iter()
        .map(|value| (value - median_value).abs())
        .collect::<Vec<_>>();
    let mad = median(&deviations);
    let cutoff = (median_value + mad.max(60.0) * 6.0).max(1_500.0);

    let mut kept = Vec::with_capacity(intervals.len());
    let mut inactive_ms = 0_i64;
    for interval in intervals {
        if *interval > cutoff {
            inactive_ms += *interval as i64;
        } else {
            kept.push(*interval);
        }
    }

    (kept, inactive_ms)
}

fn continuous_endurance_segments(intervals: &[f64]) -> i64 {
    let mut current_chain_ms = 0.0_f64;
    let mut segments = 0_i64;

    for interval in intervals {
        if *interval > 60_000.0 {
            segments += (current_chain_ms / 900_000.0_f64).floor() as i64;
            current_chain_ms = 0.0_f64;
            continue;
        }

        current_chain_ms += *interval;
    }

    segments + (current_chain_ms / 900_000.0_f64).floor() as i64
}

fn coefficient_of_variation(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }

    let mean = values.iter().sum::<f64>() / values.len() as f64;
    if mean <= f64::EPSILON {
        return 0.0;
    }

    let variance = values
        .iter()
        .map(|value| {
            let delta = value - mean;
            delta * delta
        })
        .sum::<f64>()
        / (values.len() as f64 - 1.0);

    variance.max(0.0).sqrt() / mean
}

fn rhythm_score_from_cv(cv: f64) -> f64 {
    (100.0 / (1.0 + cv)).clamp(0.0, 100.0)
}

fn rolling_wpm_points(correct_samples: &[(i64, String)], window_ms: i64) -> Vec<WpmSample> {
    let mut queue = VecDeque::<i64>::new();
    let mut points = Vec::with_capacity(correct_samples.len());

    for (timestamp, _) in correct_samples {
        queue.push_back(*timestamp);
        while let Some(front) = queue.front() {
            if *timestamp - *front > window_ms {
                queue.pop_front();
            } else {
                break;
            }
        }

        let span_ms = queue
            .front()
            .map(|front| (*timestamp - *front).max(1_000))
            .unwrap_or(1_000) as f64;
        let minutes = span_ms / 60_000.0;
        let wpm = queue.len() as f64 / 5.0 / minutes;
        points.push(WpmSample {
            at: *timestamp,
            value: wpm,
        });
    }

    points
}

fn downsample_wpm_points(points: &[WpmSample], max_points: usize) -> Vec<WpmSample> {
    if points.len() <= max_points {
        return points.to_vec();
    }

    let reduced = rdp(points, 0.8);
    if reduced.len() <= max_points {
        return reduced;
    }

    let step = (reduced.len() as f64 / max_points as f64).ceil() as usize;
    reduced.into_iter().step_by(step.max(1)).take(max_points).collect()
}

fn rdp(points: &[WpmSample], epsilon: f64) -> Vec<WpmSample> {
    if points.len() < 3 {
        return points.to_vec();
    }

    let (index, distance) = points[1..points.len() - 1]
        .iter()
        .enumerate()
        .map(|(index, point)| {
            (
                index + 1,
                perpendicular_distance(point, &points[0], &points[points.len() - 1]),
            )
        })
        .max_by(|left, right| left.1.partial_cmp(&right.1).unwrap_or(Ordering::Equal))
        .unwrap_or((0, 0.0));

    if distance <= epsilon {
        return vec![points[0].clone(), points[points.len() - 1].clone()];
    }

    let mut left = rdp(&points[..=index], epsilon);
    let right = rdp(&points[index..], epsilon);
    left.pop();
    left.into_iter().chain(right).collect()
}

fn perpendicular_distance(point: &WpmSample, line_start: &WpmSample, line_end: &WpmSample) -> f64 {
    let x0 = point.at as f64;
    let y0 = point.value;
    let x1 = line_start.at as f64;
    let y1 = line_start.value;
    let x2 = line_end.at as f64;
    let y2 = line_end.value;

    let numerator = ((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1).abs();
    let denominator = ((y2 - y1).powi(2) + (x2 - x1).powi(2)).sqrt();
    if denominator <= f64::EPSILON {
        0.0
    } else {
        numerator / denominator
    }
}

fn median(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    let middle = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    } else {
        sorted[middle]
    }
}

fn normalized_single_char(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }

    let mut chars = raw.chars();
    let first = chars.next()?;
    if chars.next().is_some() {
        return None;
    }

    Some(first.to_ascii_lowercase().to_string())
}

fn is_transition_candidate(left: &str, right: &str) -> bool {
    let is_simple = |value: &str| {
        value.chars().count() == 1
            && value
                .chars()
                .next()
                .map(|ch| !ch.is_control())
                .unwrap_or(false)
    };

    is_simple(left) && is_simple(right)
}
