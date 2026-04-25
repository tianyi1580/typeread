use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookRecord {
    pub id: i64,
    pub title: String,
    pub author: Option<String>,
    pub path: String,
    pub format: String,
    pub cover_path: Option<String>,
    pub current_index: i64,
    pub current_chapter: i64,
    pub total_chars: i64,
    pub pinned: bool,
    pub average_wpm: f64,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookChunk {
    pub id: String,
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookChapter {
    pub id: String,
    pub title: String,
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub chunks: Vec<BookChunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBook {
    #[serde(flatten)]
    pub record: BookRecord,
    pub chapters: Vec<BookChapter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingSessionInput {
    pub book_id: Option<i64>,
    pub source: String,
    pub source_label: String,
    pub start_time: String,
    pub end_time: String,
    pub words_typed: i64,
    pub chars_typed: i64,
    pub errors: i64,
    pub wpm: f64,
    pub accuracy: f64,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyMetric {
    pub day: String,
    pub wpm: f64,
    pub accuracy: f64,
    pub sessions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPoint {
    pub id: i64,
    pub book_id: Option<i64>,
    pub title: String,
    pub source: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_seconds: i64,
    pub words_typed: i64,
    pub chars_typed: i64,
    pub wpm: f64,
    pub accuracy: f64,
    pub xp_gained: i64,
    pub rhythm_score: f64,
    pub focus_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfusionPair {
    pub expected: String,
    pub typed: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionStat {
    pub combo: String,
    pub samples: i64,
    pub average_ms: f64,
    pub deviation_ms: f64,
    pub error_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransitionGroups {
    pub fastest: Vec<TransitionStat>,
    pub slowest: Vec<TransitionStat>,
    pub error_prone: Vec<TransitionStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WpmSample {
    pub at: i64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepAnalytics {
    pub macro_wpm: Vec<WpmSample>,
    pub macro_accuracy: Vec<WpmSample>,
    pub recent_wpm: Vec<WpmSample>,
    pub confusion_pairs: Vec<ConfusionPair>,
    pub transitions: TransitionGroups,
    pub rhythm_score: f64,
    pub cadence_cv: f64,
    pub focus_score: f64,
    pub active_typing_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockState {
    pub dracula_theme: bool,
    pub nord_theme: bool,
    pub smooth_caret: bool,
    pub premium_typography: bool,
    pub ghost_pacer: bool,
    pub custom_error_colors: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileProgress {
    pub total_xp: i64,
    pub level: i64,
    pub title: String,
    pub current_level_xp: i64,
    pub next_level_xp: i64,
    pub progress_to_next_level: f64,
    pub streak_days: i64,
    pub rested_words_available: i64,
    pub unlocks: UnlockState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementAward {
    pub key: String,
    pub earned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSummary {
    pub total_words_typed: i64,
    pub total_chars_typed: i64,
    pub total_time_seconds: i64,
    pub average_wpm: f64,
    pub average_accuracy: f64,
    pub sessions: i64,
    pub history: Vec<DailyMetric>,
    pub session_points: Vec<SessionPoint>,
    pub profile: ProfileProgress,
    pub achievements: Vec<AchievementAward>,
    pub latest_deep_analytics: Option<DeepAnalytics>,
    pub aggregate_confusions: Vec<ConfusionPair>,
    pub aggregate_transitions: TransitionGroups,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub font: String,
    pub reader_mode: String,
    pub interaction_mode: String,
    pub base_font_size: i64,
    pub line_height: f64,
    pub enter_to_skip: bool,
    pub ignore_quotation_marks: bool,
    pub ignored_characters: String,
    pub focus_mode: bool,
    pub keyboard_layout: String,
    pub custom_keyboard_layout: String,
    pub smooth_caret: bool,
    pub type_test_duration: i64,
    pub versus_bot_cpm: i64,
    pub error_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardLayoutDefinition {
    pub id: String,
    pub name: String,
    pub rows: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokeEvent {
    pub at: i64,
    pub r#type: String,
    pub char: Option<String>,
    pub expected: Option<String>,
    pub is_correct: Option<bool>,
    pub layout: Option<String>,
    pub cursor_index: Option<i64>,
    pub skipped_word: Option<bool>,
    pub correct_chars: Option<i64>,
    pub typed_chars: Option<i64>,
    pub errors: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContext {
    pub book_id: Option<i64>,
    pub source: String,
    pub source_label: String,
    pub keyboard_layout: KeyboardLayoutDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKeystrokeBatchInput {
    pub session_key: String,
    pub context: SessionContext,
    pub events: Vec<KeystrokeEvent>,
    pub finalize_session: Option<TypingSessionInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryResponse {
    pub session_id: i64,
    pub xp_gained: i64,
    pub rested_bonus_xp: i64,
    pub accuracy_multiplier: f64,
    pub cadence_multiplier: f64,
    pub endurance_multiplier: f64,
    pub level_before: i64,
    pub level_after: i64,
    pub unlocked_rewards: Vec<String>,
    pub newly_earned_achievements: Vec<AchievementAward>,
    pub profile: ProfileProgress,
    pub deep_analytics: DeepAnalytics,
    pub session_point: SessionPoint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKeystrokeBatchResult {
    pub buffered_events: usize,
    pub saved_session: Option<SessionSummaryResponse>,
}

#[derive(Debug, Clone)]
pub struct ParsedImport {
    pub title: String,
    pub author: Option<String>,
    pub format: String,
    pub cover_path: Option<String>,
    pub total_chars: i64,
    pub chapters: Vec<BookChapter>,
}
