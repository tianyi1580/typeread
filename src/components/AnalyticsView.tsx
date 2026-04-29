import { useMemo, useState } from "react";
import { resolveKeyboardLayout } from "../lib/keyboard-layouts";
import { formatDuration } from "../lib/utils";
import type { AnalyticsSummary, AppSettings, ConfusionPair, KeyAccuracy, KeyboardLayoutDefinition, TransitionStat, WpmSample } from "../types";
import { Card } from "./ui/card";
import { InfoTooltip, InfoIcon } from "./ui/InfoTooltip";

const SECTION_DESCRIPTIONS = {
  profile: "Your current rank, level, and XP progress.",
  graph: "Your speed and accuracy over time. Use this to track your growth curve.",
  quality: "Measures your focus and rhythm consistency during sessions.",
  heatmap: "Highlights keys where your fingers drift most frequently.",
  lifetime: "Aggregate statistics across your entire typing history.",
  transitions: "A breakdown of your fastest and most error-prone character pairs.",
  recent: "A log of your latest typing sessions and performance.",
  vectors: "Visual representation of finger drift—red dots show where you actually landed.",
  misses: "Your most frequent character substitutions.",
  fastest: "Your most fluid character transitions.",
  slowest: "Transitions where your muscle memory hesitates most.",
  drills: "Character pairings that would benefit from focused practice.",
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
  "Total XP": "Experience earned through sessions and challenges.",
  "Streak": "Consecutive days with at least one session.",
  "Rested Buffer": "Bonus XP applied to your next words. Refreshes while you're away.",
  "Sessions": "Total typing sessions completed.",
  "Rhythm Score": "A measure of how steady your typing cadence is.",
  "Focus Score": "Your ability to maintain speed without sudden pauses.",
  "Consistency": "Lower values indicate a more stable typing rhythm.",
  "Active Typing": "Actual time spent with fingers on keys.",
  "Average WPM": "Mean Words Per Minute across all sessions.",
  "Average Accuracy": "Lifetime percentage of correct first-attempt characters.",
  "Words Typed": "Total words processed.",
  "Time Typed": "Total time spent in active sessions.",
};

const SOURCE_LABELS: Record<string, string> = {
  book: "Library",
  "type-test": "Type Test",
  versus: "Versus Race",
  reader: "Library",
  read: "Library",
};

const FALLBACK_KEYBOARD_LAYOUT: KeyboardLayoutDefinition = {
  id: "qwerty-us",
  name: "QWERTY (US)",
  rows: ["1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"],
};

export function AnalyticsView({
  analytics,
  settings,
}: {
  analytics: AnalyticsSummary | null;
  settings: AppSettings | null;
}) {
  const [activeTab, setActiveTab] = useState<"session" | "lifetime" | "heatmap" | "recent">("session");
  const [sessionMetric, setSessionMetric] = useState<"wpm" | "accuracy">("wpm");
  const [lifetimeMetric, setLifetimeMetric] = useState<"wpm" | "accuracy" | "words">("wpm");
  const [timeRange, setTimeRange] = useState<"7" | "30" | "90" | "365" | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<"drift" | "accuracy">("accuracy");


  const layout = useMemo(
    () => (settings ? resolveKeyboardLayout(settings) : FALLBACK_KEYBOARD_LAYOUT),
    [settings],
  );

  const filteredSessionPoints = useMemo(() => {
    if (!analytics) return [];
    return analytics.sessionPoints
      .filter(
        (s) => (s.source as string) !== "reader" && (s.source as string) !== "read" && s.wordsTyped >= 5
      )
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [analytics]);

  // Prepare graph points based on active toggles
  const sessionPoints = useMemo(() => {
    if (!analytics) return [];
    if (sessionMetric === "wpm") {
      return analytics.latestDeepAnalytics?.macroWpm ?? [];
    }
    return analytics.latestDeepAnalytics?.macroAccuracy ?? [];
  }, [analytics, sessionMetric]);

  const lifetimePoints = useMemo(() => {
    if (!analytics) return [];
    const now = new Date();
    const filtered = analytics.history.filter((d) => {
      if (timeRange === "all") return true;
      const date = new Date(d.day);
      const diffDays = (now.getTime() - date.getTime()) / (1000 * 3600 * 24);
      return diffDays <= Number(timeRange);
    });

    if (filtered.length === 0) return [];

    // Keep the timeline stable even if the backend row order changes in the future.
    filtered.sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

    const firstDate = new Date(filtered[0].day).getTime();

    return filtered.map((d) => ({
      at: (new Date(d.day).getTime() - firstDate) / (1000 * 3600 * 24),
      value: lifetimeMetric === "wpm" ? d.wpm : lifetimeMetric === "accuracy" ? d.accuracy : d.wordsTyped,
    }));
  }, [analytics, lifetimeMetric, timeRange]);

  if (!analytics || filteredSessionPoints.length === 0) {
    return (
      <Card className="p-10">
        <p className="text-sm text-[var(--text-muted)]">No typing sessions have been recorded yet.</p>
      </Card>
    );
  }

  const latestSession = filteredSessionPoints[0];
  const activeKey = selectedKey ?? analytics.aggregateConfusions[0]?.expected ?? null;
  const selectedDrifts = activeKey
    ? analytics.aggregateConfusions.filter((pair) => pair.expected === activeKey).sort((left, right) => right.count - left.count).slice(0, 8)
    : [];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Profile Section */}
      <Card className="relative overflow-hidden border-none bg-gradient-to-br from-[rgba(138,173,244,0.15)] to-transparent p-8 shadow-2xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--accent)] opacity-5 blur-[100px]" />
        
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Profile</p>
              <InfoTooltip content={SECTION_DESCRIPTIONS.profile} trigger="click">
                <InfoIcon className="h-3.5 w-3.5" />
              </InfoTooltip>
            </div>
            <h1 className="mt-4 text-5xl font-bold tracking-tight">
              Level {analytics.profile.level} <span className="text-[var(--accent)]">·</span> {analytics.profile.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-muted)]">
              Track your evolution and master your rhythm. Focus on reducing <span className="text-[var(--text)]">cadence drift</span> to reach the next tier.
            </p>
            <div className="mt-8">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                <span>Progress to Level {analytics.profile.level + 1}</span>
                <span>{Math.round(analytics.profile.progressToNextLevel * 100)}%</span>
              </div>
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-black/20 p-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#b8d0ff] shadow-[0_0_15px_rgba(138,173,244,0.4)] transition-all duration-1000"
                  style={{ width: `${analytics.profile.progressToNextLevel * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <HeroMetric label="Total XP" value={analytics.profile.totalXp.toLocaleString()} />
            <HeroMetric label="Streak" value={`${analytics.profile.streakDays}d`} />
            <HeroMetric label="Rested Buffer" value={`${analytics.profile.restedWordsAvailable.toLocaleString()} words`} />
            <HeroMetric label="Sessions" value={analytics.sessions.toLocaleString()} />
          </div>
        </div>
      </Card>

      {/* 2. Lifetime Totals (Moved & Horizontal) */}
      <Card className="p-8">
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Lifetime Totals</p>
          <InfoTooltip content={SECTION_DESCRIPTIONS.lifetime} trigger="click">
            <InfoIcon className="h-3.5 w-3.5" />
          </InfoTooltip>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeroMetric label="Average WPM" value={analytics.averageWpm.toFixed(1)} />
          <HeroMetric label="Average Accuracy" value={`${analytics.averageAccuracy.toFixed(1)}%`} />
          <HeroMetric label="Words Typed" value={analytics.totalWordsTyped.toLocaleString()} />
          <HeroMetric label="Time Typed" value={formatDuration(analytics.totalTimeSeconds)} />
        </div>
      </Card>

      {/* Tab Selector */}
      <div className="flex flex-wrap gap-2 rounded-[28px] border border-[var(--border)] bg-black/10 p-2 backdrop-blur-md">
        <TabButton active={activeTab === "session"} onClick={() => setActiveTab("session")} label="Session Stats" />
        <TabButton active={activeTab === "lifetime"} onClick={() => setActiveTab("lifetime")} label="Lifetime Stats" />
        <TabButton active={activeTab === "heatmap"} onClick={() => setActiveTab("heatmap")} label="Keyboard Heatmap" />
        <TabButton active={activeTab === "recent"} onClick={() => setActiveTab("recent")} label="Recent Sessions" />
      </div>

      {/* 3. Session Stats Tab */}
      {activeTab === "session" && (
        <div className="grid gap-6 animate-fade-in xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Card className="p-8">
            {/* Session Identification Header */}
            {latestSession && (
              <div className="mb-10 flex flex-wrap items-center gap-8 border-b border-[var(--border)] pb-8">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">Session Details</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight">{latestSession.title}</h3>
                </div>
                <div className="hidden h-10 w-[1px] bg-[var(--border)] lg:block" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Training Mode</p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-[var(--text)]">
                    {SOURCE_LABELS[latestSession.source] || latestSession.source.replace("-", " ")}
                  </p>
                </div>
                <div className="hidden h-10 w-[1px] bg-[var(--border)] lg:block" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Completed At</p>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-[var(--text)]">
                    {new Date(latestSession.startTime).toLocaleDateString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight">Rolling {sessionMetric === "wpm" ? "WPM" : "Accuracy"} progression</h2>
                <InfoTooltip content={SECTION_DESCRIPTIONS.graph} trigger="click">
                  <InfoIcon className="h-4 w-4" />
                </InfoTooltip>
              </div>
              <div className="flex gap-1 rounded-full bg-black/20 p-1">
                <ToggleButton active={sessionMetric === "wpm"} onClick={() => setSessionMetric("wpm")} label="WPM" />
                <ToggleButton active={sessionMetric === "accuracy"} onClick={() => setSessionMetric("accuracy")} label="Accuracy" />
              </div>
            </div>
            <div className="mt-12">
              <SessionGraph 
                points={sessionPoints} 
                unit={sessionMetric === "wpm" ? "WPM" : "%"} 
                xAxisLabel="Time (Seconds)"
                xAxisType="time"
              />
            </div>
          </Card>

          <Card className="p-8">
            <div className="flex items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Session Quality</p>
              <InfoTooltip content={SECTION_DESCRIPTIONS.quality} trigger="click">
                <InfoIcon className="h-3.5 w-3.5" />
              </InfoTooltip>
            </div>
            <div className="mt-8 grid gap-4">
              <HeroMetric label="Rhythm Score" value={`${(analytics.latestDeepAnalytics?.rhythmScore ?? 0).toFixed(0)}%`} />
              <HeroMetric label="Focus Score" value={`${(analytics.latestDeepAnalytics?.focusScore ?? 0).toFixed(0)}%`} />
              <HeroMetric label="Consistency" value={(analytics.latestDeepAnalytics?.cadenceCv ?? 0).toFixed(2)} />
              <HeroMetric
                label="Active Typing"
                value={formatDuration(analytics.latestDeepAnalytics?.activeTypingSeconds ?? 0)}
              />
            </div>
          </Card>
        </div>
      )}

      {/* 4. Lifetime Stats Tab */}
      {activeTab === "lifetime" && (
        <div className="animate-fade-in">
          <Card className="p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight">Lifetime Trends</h2>
                <InfoTooltip content={SECTION_DESCRIPTIONS.lifetime} trigger="click">
                  <InfoIcon className="h-4 w-4" />
                </InfoTooltip>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex gap-1 rounded-full bg-black/20 p-1">
                  <ToggleButton active={timeRange === "7"} onClick={() => setTimeRange("7")} label="7d" />
                  <ToggleButton active={timeRange === "30"} onClick={() => setTimeRange("30")} label="30d" />
                  <ToggleButton active={timeRange === "90"} onClick={() => setTimeRange("90")} label="90d" />
                  <ToggleButton active={timeRange === "365"} onClick={() => setTimeRange("365")} label="1y" />
                  <ToggleButton active={timeRange === "all"} onClick={() => setTimeRange("all")} label="All" />
                </div>
                <div className="flex gap-1 rounded-full bg-black/20 p-1">
                  <ToggleButton active={lifetimeMetric === "wpm"} onClick={() => setLifetimeMetric("wpm")} label="WPM" />
                  <ToggleButton active={lifetimeMetric === "accuracy"} onClick={() => setLifetimeMetric("accuracy")} label="Accuracy" />
                  <ToggleButton active={lifetimeMetric === "words"} onClick={() => setLifetimeMetric("words")} label="Words" />
                </div>
              </div>
            </div>
            <div className="mt-12">
              <SessionGraph 
                points={lifetimePoints} 
                unit={lifetimeMetric === "wpm" ? "WPM" : lifetimeMetric === "accuracy" ? "%" : "Words"}
                xAxisLabel="Time (Days)"
                xAxisType="day"
              />
            </div>
          </Card>
        </div>
      )}

      {/* 5. Keyboard Heatmap Tab */}
      {activeTab === "heatmap" && (
        <div className="space-y-6 animate-fade-in">
          <Card className="p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Keyboard Heatmap</p>
                  <InfoTooltip content={SECTION_DESCRIPTIONS.heatmap} trigger="click">
                    <InfoIcon className="h-3.5 w-3.5" />
                  </InfoTooltip>
                </div>
                <h2 className="mt-3 text-3xl font-bold">Directional drift by key</h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex rounded-full border border-[var(--border)] bg-black/10 p-1">
                  <button
                    type="button"
                    onClick={() => setHeatmapMode("drift")}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      heatmapMode === "drift"
                        ? "bg-[var(--accent)] text-black shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    Drift
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeatmapMode("accuracy")}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      heatmapMode === "accuracy"
                        ? "bg-[var(--accent)] text-black shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    Accuracy
                  </button>
                </div>
                <div className="rounded-full border border-[var(--border)] bg-white/5 px-5 py-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] backdrop-blur-md">
                  {layout.name}
                </div>
              </div>
            </div>
            <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex items-center justify-center rounded-[32px] border border-[var(--border)] bg-black/20 p-8 shadow-inner overflow-x-auto">
                <KeyboardHeatmap
                  layout={layout}
                  confusions={analytics.aggregateConfusions}
                  keyAccuracies={analytics.keyAccuracies}
                  mode={heatmapMode}
                  selectedKey={activeKey}
                  onSelectKey={setSelectedKey}
                />
              </div>
                <DirectionalPanel
                  layout={layout}
                  selectedKey={activeKey}
                  drifts={selectedDrifts}
                  mode={heatmapMode}
                  keyAccuracies={analytics.keyAccuracies}
                />
            </div>
          </Card>

          <Card className="p-8">
            <div className="flex items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Transition Tables</p>
              <InfoTooltip content={SECTION_DESCRIPTIONS.transitions} trigger="click">
                <InfoIcon className="h-3.5 w-3.5" />
              </InfoTooltip>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <TransitionTable title="Fastest" rows={analytics.aggregateTransitions.fastest} description={SECTION_DESCRIPTIONS.fastest} />
              <TransitionTable title="Slowest" rows={analytics.aggregateTransitions.slowest} description={SECTION_DESCRIPTIONS.slowest} />
              <TransitionTable title="Drill List" rows={analytics.aggregateTransitions.errorProne} showErrorRate description={SECTION_DESCRIPTIONS.drills} />
            </div>
          </Card>
        </div>
      )}

      {/* 6. Recent Sessions Tab */}
      {activeTab === "recent" && (
        <Card className="p-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Recent Sessions</p>
            <InfoTooltip content={SECTION_DESCRIPTIONS.recent} trigger="click">
              <InfoIcon className="h-3.5 w-3.5" />
            </InfoTooltip>
          </div>
          <div className="mt-8 overflow-hidden rounded-[24px] border border-[var(--border)] bg-black/10">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[var(--panel-soft)] text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Title</th>
                  <th className="px-6 py-4 font-semibold">Mode</th>
                  <th className="px-6 py-4 font-semibold">WPM</th>
                  <th className="px-6 py-4 font-semibold">XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredSessionPoints.slice(0, 10).map((session) => (
                  <tr key={session.id} className="group transition-colors hover:bg-white/5">
                    <td className="px-6 py-4 text-sm tabular-nums">
                      {(() => {
                        const date = new Date(session.startTime);
                        return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString();
                      })()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--text)]">{session.title}</td>
                    <td className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-[var(--accent)] opacity-70">
                      {SOURCE_LABELS[session.source] || session.source}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold tabular-nums">{session.wpm.toFixed(1)}</td>
                    <td className="px-6 py-4 text-sm font-semibold tabular-nums text-[var(--success)]">+{session.xpGained.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-8 py-3 rounded-[20px] text-sm font-bold tracking-tight transition-all duration-300 ${
        active 
          ? "bg-[var(--accent)] text-black shadow-lg shadow-[var(--accent)]/20" 
          : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
        active 
          ? "bg-[var(--accent)] text-black" 
          : "text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}


function HeroMetric({ label, value }: { label: string; value: string }) {
  const description = METRIC_DESCRIPTIONS[label] || "Description not available.";
  
  return (
    <InfoTooltip content={description} trigger="hover" maxWidth="280px" className="w-full">
      <div className="group relative w-full cursor-help overflow-hidden rounded-[24px] border border-[var(--border)] bg-white/5 px-6 py-6 transition-all hover:border-[var(--accent)] hover:bg-white/10">
        <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-[var(--accent)] opacity-0 blur-xl transition-opacity group-hover:opacity-20" />
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">
          {label}
        </p>
        <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
      </div>
    </InfoTooltip>
  );
}

function SessionGraph({ 
  points, 
  unit = "WPM", 
  xAxisLabel = "Time (Seconds)",
  xAxisType = "time"
}: { 
  points: WpmSample[]; 
  unit?: string; 
  xAxisLabel?: string;
  xAxisType?: "time" | "day";
}) {
  const width = 940;
  const height = 340;
  const padding = { top: 30, right: 30, bottom: 50, left: 70 };
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm font-medium text-[var(--text-muted)]">No data available for this range.</div>;
  }

  const minAt = points[0]?.at ?? 0;
  const maxAt = points[points.length - 1]?.at ?? minAt + 1;
  const values = points.map((point) => point.value);
  const minValue = 0;
  const maxValue = Math.max(...values, unit === "%" ? 100 : 80);
  
  const chartPoints = points.map((point) => ({
    x: padding.left + ((point.at - minAt) / Math.max(maxAt - minAt, 0.0001)) * (width - padding.left - padding.right),
    y:
      height -
      padding.bottom -
      ((point.value - minValue) / Math.max(maxValue - minValue, 1)) * (height - padding.top - padding.bottom),
    raw: point
  }));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    
    // Find closest point
    let closestIndex = 0;
    let minDistance = Math.abs(chartPoints[0].x - x);
    
    for (let i = 1; i < chartPoints.length; i++) {
      const distance = Math.abs(chartPoints[i].x - x);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    
    setHoveredPointIndex(closestIndex);
  };

  const hoveredPoint = hoveredPointIndex !== null ? chartPoints[hoveredPointIndex] : null;

  return (
    <div className="relative group/graph">
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        className="h-[340px] w-full overflow-visible cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPointIndex(null)}
      >
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#b8d0ff" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Y-Axis Grid Lines & Numbers */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - padding.bottom - ratio * (height - padding.top - padding.bottom);
          const val = Math.round(minValue + ratio * (maxValue - minValue));
          return (
            <g key={`y-${ratio}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="5 8"
                strokeWidth="1"
                opacity="0.3"
              />
              <text
                x={padding.left - 15}
                y={y}
                textAnchor="end"
                alignmentBaseline="middle"
                className="fill-[var(--text-muted)] text-[10px] font-bold tabular-nums"
              >
                {val}{ratio === 1 ? unit : ""}
              </text>
            </g>
          );
        })}

        {/* X-Axis Labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const x = padding.left + ratio * (width - padding.left - padding.right);
          let label = "";
          if (xAxisType === "time") {
            label = `${(((maxAt - minAt) * ratio) / 1000).toFixed(1)}s`;
          } else {
            label = `${Math.round((maxAt - minAt) * ratio)}d`;
          }
          
          return (
            <text
              key={`x-${ratio}`}
              x={x}
              y={height - padding.bottom + 25}
              textAnchor="middle"
              className="fill-[var(--text-muted)] text-[10px] font-bold tabular-nums"
            >
              {label}
            </text>
          );
        })}

        {/* Axis Lines */}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="var(--border)"
          strokeWidth="2"
          opacity="0.5"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="var(--border)"
          strokeWidth="2"
          opacity="0.5"
        />

        {/* The Graph Path */}
        {chartPoints.length > 1 ? (
          <polyline
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")}
            className="drop-shadow-[0_0_8px_rgba(138,173,244,0.4)]"
          />
        ) : chartPoints.length === 1 ? (
          <circle cx={chartPoints[0].x} cy={chartPoints[0].y} r="4" fill="var(--accent)" />
        ) : null}

        {/* Hover Interaction Elements */}
        {hoveredPoint && (
          <g className="animate-in fade-in duration-200">
            {/* Vertical Guide Line */}
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            
            {/* Active Data Point */}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="6"
              fill="var(--accent)"
              className="drop-shadow-[0_0_10px_var(--accent)]"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="12"
              fill="var(--accent)"
              opacity="0.15"
            />

            {/* Hover Data Bubble */}
            <foreignObject
              x={hoveredPoint.x > width - 150 ? hoveredPoint.x - 140 : hoveredPoint.x + 10}
              y={hoveredPoint.y - 60}
              width="130"
              height="50"
              className="pointer-events-none"
            >
              <div className="rounded-xl border border-[var(--border)] bg-[rgba(36,39,58,0.9)] px-3 py-2 shadow-2xl backdrop-blur-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {xAxisType === "time" ? `${((hoveredPoint.raw.at - minAt) / 1000).toFixed(1)}s` : `Day ${Math.round(hoveredPoint.raw.at)}`}
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--accent)]">
                  {hoveredPoint.raw.value.toFixed(1)}
                  <span className="ml-1 text-xs text-[var(--text-muted)]">{unit}</span>
                </p>
              </div>
            </foreignObject>
          </g>
        )}

        {/* Axis Titles */}
        <text
          x={padding.left - 60}
          y={height / 2}
          transform={`rotate(-90, ${padding.left - 60}, ${height / 2})`}
          textAnchor="middle"
          className="fill-[var(--text-muted)] text-[9px] font-bold uppercase tracking-[0.2em]"
        >
          {unit}
        </text>
        <text
          x={width / 2}
          y={height - 5}
          textAnchor="middle"
          className="fill-[var(--text-muted)] text-[9px] font-bold uppercase tracking-[0.2em]"
        >
          {xAxisLabel}
        </text>
      </svg>
    </div>
  );
}

function KeyboardHeatmap({
  layout,
  confusions,
  keyAccuracies,
  mode,
  selectedKey,
  onSelectKey,
}: {
  layout: KeyboardLayoutDefinition;
  confusions: ConfusionPair[];
  keyAccuracies: KeyAccuracy[];
  mode: "drift" | "accuracy";
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const pair of confusions) {
    counts.set(pair.expected, (counts.get(pair.expected) ?? 0) + pair.count);
  }
  const peak = Math.max(...counts.values(), 1);
  const offsets = [0, 25, 42, 60];

  const accuracyMap = new Map<string, { correct: number; total: number }>();
  if (keyAccuracies) {
    for (const acc of keyAccuracies) {
      accuracyMap.set(acc.key, { correct: acc.correct, total: acc.total });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {layout.rows.map((row, rowIndex) => (
        <div key={`${row}-${rowIndex}`} className="flex gap-3" style={{ paddingLeft: `${offsets[rowIndex] ?? 0}px` }}>
          {[...row].map((key) => {
            const accObj = accuracyMap.get(key);
            const total = accObj?.total ?? 0;
            const hasData = total > 0;
            const accuracy = hasData ? accObj!.correct / total : 1;

            const count = counts.get(key) ?? 0;
            const intensity = mode === "accuracy" ? (hasData ? 1 - accuracy : 0) : count / peak;
            const isActive = selectedKey === key;

            const bg = isActive
              ? "var(--accent)"
              : `color-mix(in srgb, var(--accent) ${Math.round(intensity * 70)}%, rgba(255,255,255,0.03))`;

            return (
              <button
                key={`${rowIndex}-${key}`}
                type="button"
                onClick={() => onSelectKey(key)}
                className={`flex h-14 w-14 items-center justify-center rounded-[18px] border text-base font-bold transition-all duration-200 hover:scale-110 active:scale-95 ${
                  isActive ? "z-10 border-[var(--accent)] text-[var(--text)] shadow-[0_0_20px_rgba(138,173,244,0.5)] scale-110" : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
                style={{
                  background: bg,
                  color: isActive ? "black" : undefined
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}


function DirectionalPanel({
  layout,
  selectedKey,
  drifts,
  mode,
  keyAccuracies,
}: {
  layout: KeyboardLayoutDefinition;
  selectedKey: string | null;
  drifts: ConfusionPair[];
  mode: "drift" | "accuracy";
  keyAccuracies: KeyAccuracy[];
}) {
  const positions = useMemo(() => buildKeyPositions(layout), [layout]);
  const selectedPosition = selectedKey ? positions.get(selectedKey) : null;

  return (
    <div className="space-y-5">
      <div className="rounded-[32px] border border-[var(--border)] bg-white/5 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">
            {mode === "accuracy" ? "Key Accuracy" : "Directional Vectors"}
          </p>
          <InfoTooltip content={mode === "accuracy" ? "The accuracy percentage for the selected key." : SECTION_DESCRIPTIONS.vectors} trigger="click">
            <InfoIcon className="h-3 w-3" />
          </InfoTooltip>
        </div>
        <div className="relative mt-6 flex h-[180px] items-center justify-center rounded-2xl bg-black/20 overflow-hidden">
          {mode === "accuracy" ? (
            selectedKey ? (
              (() => {
                const accObj = keyAccuracies?.find(a => a.key === selectedKey);
                const total = accObj?.total ?? 0;
                const accuracy = total > 0 ? (accObj!.correct / total) * 100 : 100;
                return (
                  <div className="flex flex-col items-center gap-2 animate-fade-in">
                    <span className="text-5xl font-black tracking-tight text-[var(--text)]">
                      {accuracy.toFixed(1)}%
                    </span>
                    <span className="text-xs font-medium text-[var(--text-muted)]">
                      {accObj?.correct ?? 0} / {total} correct attempts
                    </span>
                  </div>
                );
              })()
            ) : (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs font-medium leading-relaxed text-[var(--text-muted)] opacity-50">
                Select a key from the heatmap to view accuracy.
              </p>
            )
          ) : (
            <>
              <svg viewBox="0 0 220 160" className="h-full w-full">
                {selectedPosition && (
                  <>
                    <circle cx={selectedPosition.x} cy={selectedPosition.y} r="10" fill="var(--accent)" className="animate-pulse" />
                    {drifts.map((drift) => {
                      const target = positions.get(drift.typed);
                      if (!target) return null;
                      return (
                        <g key={`${drift.expected}-${drift.typed}`}>
                          <line
                            x1={selectedPosition.x}
                            y1={selectedPosition.y}
                            x2={target.x}
                            y2={target.y}
                            stroke="var(--accent)"
                            strokeWidth={Math.max(2, drift.count / 4)}
                            opacity="0.6"
                            strokeLinecap="round"
                          />
                          <circle cx={target.x} cy={target.y} r="5" fill="var(--danger)" />
                        </g>
                      );
                    })}
                  </>
                )}
              </svg>
              {!selectedKey && (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs font-medium leading-relaxed text-[var(--text-muted)] opacity-50">
                  Select a key from the heatmap to view drift vectors.
                </p>
              )}
            </>
          )}
        </div>
      </div>


      <div className="rounded-[32px] border border-[var(--border)] bg-white/5 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Top Misses</p>
          <InfoTooltip content={SECTION_DESCRIPTIONS.misses} trigger="click">
            <InfoIcon className="h-3 w-3" />
          </InfoTooltip>
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => {
            const drift = selectedKey ? drifts[i] : null;
            if (drift) {
              return (
                <div key={`${drift.expected}-${drift.typed}`} className="flex h-[48px] items-center justify-between rounded-[20px] border border-[var(--border)] bg-black/10 px-5 text-sm font-medium transition-all">
                  <span className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">{drift.expected}</span>
                    <span className="text-[var(--accent)]">→</span>
                    <span>{drift.typed}</span>
                  </span>
                  <span className="rounded-full bg-[var(--danger)]/10 px-3 py-1 text-[10px] font-bold text-[var(--danger)] leading-none flex items-center h-6">
                    {drift.count}
                  </span>
                </div>
              );
            }
            return (
              <div key={`empty-${i}`} className="flex h-[48px] items-center justify-between rounded-[20px] border border-[var(--border)] bg-black/5 px-5 text-sm font-medium opacity-30">
                <span className="text-[var(--text-muted)] italic">
                  {selectedKey ? "no drift recorded" : "select a key"}
                </span>
                <span className="text-[var(--text-muted)] opacity-50">—</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TransitionTable({
  title,
  rows,
  showErrorRate = false,
  description,
}: {
  title: string;
  rows: TransitionStat[];
  showErrorRate?: boolean;
  description: string;
}) {
  return (
    <div className="flex flex-col rounded-[32px] border border-[var(--border)] bg-white/5 p-6">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
        <InfoTooltip content={description} trigger="click">
          <InfoIcon className="h-3 w-3" />
        </InfoTooltip>
      </div>
      <div className="mt-6 flex-1 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.combo} className="group flex items-center justify-between rounded-[20px] border border-[var(--border)] bg-black/10 px-5 py-4 transition-all hover:bg-white/5">
              <div>
                <span className="text-xl font-bold tracking-tighter text-[var(--text)]">{row.combo.replace(/ /g, "␣")}</span>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{row.samples} samples</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold tabular-nums ${showErrorRate ? (row.errorRate > 0.1 ? 'text-[var(--danger)]' : 'text-[var(--success)]') : 'text-[var(--accent)]'}`}>
                  {showErrorRate ? `${Math.round(row.errorRate * 100)}%` : `${row.averageMs.toFixed(0)}ms`}
                </span>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{showErrorRate ? 'Error Rate' : 'Average'}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex h-32 items-center justify-center text-xs font-medium text-[var(--text-muted)] opacity-50">
            Awaiting more data...
          </div>
        )}
      </div>
    </div>
  );
}

function buildKeyPositions(layout: KeyboardLayoutDefinition) {
  const positions = new Map<string, { x: number; y: number }>();
  const offsets = [0, 8, 14, 24];
  layout.rows.forEach((row, rowIndex) => {
    [...row].forEach((key, keyIndex) => {
      positions.set(key, {
        x: 25 + (offsets[rowIndex] ?? 0) + keyIndex * 13,
        y: 35 + rowIndex * 30,
      });
    });
  });
  return positions;
}
