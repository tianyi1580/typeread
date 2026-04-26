import { useEffect, useState, useMemo } from "react";
import { formatPercent, cn } from "../lib/utils";
import type { SessionSummaryResponse, WpmSample, TransitionStat } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { InfoTooltip, InfoIcon } from "./ui/InfoTooltip";

const METRIC_DESCRIPTIONS: Record<string, string> = {
  "Speed": "Words Per Minute (WPM). A measure of your typing throughput.",
  "Accuracy": "Characters typed correctly / total characters typed.",
  "Words": "Total words completed in this session.",
  "Rhythm": "Consistency of your inter-character timing. Higher is better.",
  "Focus": "Ability to maintain speed without sudden pauses or long hesitations.",
  "Cadence CV": "Coefficient of Variation for rhythm. Lower values mean more stable typing.",
};

interface SessionSummaryModalProps {
  summary: SessionSummaryResponse | null;
  onClose: () => void;
}

export function SessionSummaryModal({ summary, onClose }: SessionSummaryModalProps) {
  const [animatedXp, setAnimatedXp] = useState(0);
  const [activeMetric, setActiveMetric] = useState<"wpm" | "accuracy">("wpm");

  const isTypeTest = summary?.sessionPoint.source === "type-test";

  useEffect(() => {
    if (!summary || summary.xpGained === 0) {
      setAnimatedXp(0);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const durationMs = 850;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setAnimatedXp(Math.round(summary.xpGained * eased));
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [summary]);

  const graphPoints = useMemo(() => {
    if (!summary || !summary.deepAnalytics) return [];
    const points = activeMetric === "wpm" ? summary.deepAnalytics.macroWpm : summary.deepAnalytics.macroAccuracy;
    return points || [];
  }, [summary, activeMetric]);

  if (!summary) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(6,8,14,0.7)] px-4 py-6 backdrop-blur-xl animate-in fade-in">
      <button type="button" aria-label="Close summary" className="absolute inset-0" onClick={onClose} />
      <Card className={cn(
        "relative w-full border-white/10 bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.5)] backdrop-blur-3xl animate-in max-h-[90vh] overflow-y-auto transition-all duration-500",
        isTypeTest ? "max-w-3xl md:p-12" : "max-w-5xl md:p-10"
      )}>
        <div className="space-y-10">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-[var(--text-muted)]">Session Complete</p>
            <h2 className="mt-4 text-4xl font-bold tracking-tight text-[var(--text)]">
              {summary.xpGained > 0 ? "Breakdown" : "Test finished!"}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <SummaryMetric label="Speed" value={`${(summary.sessionPoint?.wpm || 0).toFixed(1)} WPM`} />
            <SummaryMetric label="Accuracy" value={formatPercent(summary.sessionPoint?.accuracy || 0)} />
            <SummaryMetric label="Words" value={(summary.sessionPoint?.wordsTyped || 0).toLocaleString()} />
            {!isTypeTest && (
              <>
                <SummaryMetric label="Rhythm" value={`${(summary.deepAnalytics?.rhythmScore || 0).toFixed(0)}%`} />
                <SummaryMetric label="Focus" value={`${(summary.deepAnalytics?.focusScore || 0).toFixed(0)}%`} />
                <SummaryMetric label="Cadence CV" value={(summary.deepAnalytics?.cadenceCv || 0).toFixed(2)} />
              </>
            )}
          </div>

          <div className={cn("grid gap-6", isTypeTest ? "grid-cols-1" : "lg:grid-cols-[1fr_320px]")}>
            <div className="rounded-[32px] border border-[var(--border)] bg-black/20 p-8">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Performance Flow</p>
                <div className="flex gap-1 rounded-full bg-black/20 p-1">
                  <button
                    onClick={() => setActiveMetric("wpm")}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeMetric === "wpm" ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  >
                    WPM
                  </button>
                  <button
                    onClick={() => setActiveMetric("accuracy")}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeMetric === "accuracy" ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  >
                    Accuracy
                  </button>
                </div>
              </div>
              <div className="mt-8 h-[260px]">
                <SimpleGraph points={graphPoints} unit={activeMetric === "wpm" ? "WPM" : "%"} />
              </div>
            </div>

            {!isTypeTest && (
              <div className="space-y-6">
                <div className="rounded-[32px] border border-[var(--border)] bg-black/20 p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Multiplier Stack</p>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <MultiplierRow label="Accuracy" value={summary.accuracyMultiplier} />
                    <MultiplierRow label="Cadence" value={summary.cadenceMultiplier} />
                    <MultiplierRow label="Endurance" value={summary.enduranceMultiplier} />
                    {summary.restedBonusXp > 0 && (
                      <MultiplierRow
                        label="Rested Bonus"
                        value={summary.xpGained / Math.max(1, summary.xpGained - summary.restedBonusXp)}
                        success
                      />
                    )}
                  </div>
                </div>

                {summary.deepAnalytics?.transitions.slowest.length > 0 && (
                  <div className="rounded-[32px] border border-[var(--border)] bg-black/20 p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Slowest Transitions</p>
                    <div className="mt-4 space-y-2">
                      {summary.deepAnalytics.transitions.slowest.slice(0, 3).map((t) => (
                        <div key={t.combo} className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-xs transition-colors hover:border-[var(--accent)]/30">
                          <span className="font-bold tracking-tight">{t.combo}</span>
                          <span className="text-[var(--text-muted)] tabular-nums">{t.averageMs.toFixed(0)}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {(summary.newlyEarnedAchievements.length > 0 || summary.unlockedRewards.length > 0) && !isTypeTest && (
            <div className="grid gap-6 md:grid-cols-2">
              {summary.newlyEarnedAchievements.length > 0 && (
                <div className="rounded-[32px] border border-[var(--border)] bg-[var(--accent)]/5 p-6 shadow-[inset_0_0_20px_rgba(138,173,244,0.1)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">New Achievements</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {summary.newlyEarnedAchievements.map((a) => (
                      <div key={a.key} className="flex items-center gap-2 rounded-full bg-[var(--accent)]/20 px-3 py-1.5 text-xs font-bold text-[var(--accent)]">
                        <span className="text-sm">🏆</span> {a.key.replace(/-/g, " ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {summary.unlockedRewards.length > 0 && (
                <div className="rounded-[32px] border border-[var(--border)] bg-[var(--success)]/5 p-6 shadow-[inset_0_0_20px_rgba(166,227,161,0.1)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--success)]">Rewards Unlocked</p>
                  <div className="mt-4 space-y-2">
                    {summary.unlockedRewards.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
                        <span className="text-[var(--success)]">✨</span> {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-center justify-between gap-8 border-t border-[var(--border)] pt-10 sm:flex-row">
            {summary.xpGained > 0 ? (
              <div className="text-center sm:text-left">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Session Total</p>
                <div className="flex items-baseline gap-4">
                  <p className="mt-2 text-6xl font-black tracking-tighter text-[var(--accent)] tabular-nums drop-shadow-[0_0_20px_rgba(138,173,244,0.3)]">
                    {animatedXp.toLocaleString()} <span className="text-2xl font-bold tracking-tight">XP</span>
                  </p>
                  {summary.levelAfter > summary.levelBefore && (
                    <div className="animate-bounce rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-black uppercase text-black">
                      Level Up!
                    </div>
                  )}
                </div>
              </div>
            ) : <div />}

            <div className="flex w-full flex-col gap-3 sm:w-auto">
              <Button onClick={onClose} className="min-w-[180px] py-6 text-base font-bold">Close Summary</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const description = METRIC_DESCRIPTIONS[label] || "Description not available.";

  return (
    <InfoTooltip content={description} trigger="hover" maxWidth="240px" className="w-full">
      <div className="group relative w-full cursor-help overflow-hidden rounded-[24px] border border-[var(--border)] bg-white/5 px-6 py-6 transition-all hover:border-[var(--accent)] hover:bg-white/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">{label}</p>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      </div>
    </InfoTooltip>
  );
}

function MultiplierRow({ label, value, success = false }: { label: string, value: number, success?: boolean }) {
  if (value === 1 && !success) return null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn("font-bold tabular-nums", success ? "text-[var(--accent)]" : "text-[var(--text)]")}>
        x{value.toFixed(2)}
      </span>
    </div>
  );
}

function SimpleGraph({ points, unit }: { points: WpmSample[]; unit: string }) {
  if (points.length === 0) return <div className="flex h-full items-center justify-center text-[var(--text-muted)] text-xs">Awaiting data samples...</div>;

  const width = 800;
  const height = 240;
  const padding = { top: 10, right: 10, bottom: 20, left: 40 };

  const minAt = points[0].at;
  const maxAt = points[points.length - 1].at;
  const values = points.map(p => p.value);
  const minVal = 0;
  const maxVal = Math.max(...values, unit === "%" ? 100 : 60);

  const chartPoints = points.map(p => ({
    x: padding.left + ((p.at - minAt) / Math.max(1, maxAt - minAt)) * (width - padding.left - padding.right),
    y: height - padding.bottom - ((p.value - minVal) / Math.max(1, maxVal - minVal)) * (height - padding.top - padding.bottom)
  }));

  const path = chartPoints.length > 1
    ? `M ${chartPoints[0].x} ${chartPoints[0].y} ` + chartPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ")
    : "";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((ratio) => {
        const y = height - padding.bottom - ratio * (height - padding.top - padding.bottom);
        const val = Math.round(minVal + ratio * (maxVal - minVal));
        return (
          <g key={ratio}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.2" />
            <text x={padding.left - 10} y={y} textAnchor="end" alignmentBaseline="middle" className="fill-[var(--text-muted)] text-[10px] tabular-nums font-bold">{val}</text>
          </g>
        );
      })}

      {path && (
        <>
          <path d={`${path} L ${chartPoints[chartPoints.length - 1].x} ${height - padding.bottom} L ${chartPoints[0].x} ${height - padding.bottom} Z`} fill="url(#graphGradient)" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {chartPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent)" opacity="0.4" />
      ))}
    </svg>
  );
}
