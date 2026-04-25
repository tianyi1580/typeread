import { useEffect, useState } from "react";
import { achievementDefinitions } from "../lib/achievements";
import { formatPercent } from "../lib/utils";
import type { SessionSummaryResponse } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { InfoTooltip, InfoIcon } from "./ui/InfoTooltip";

const SUMMARY_DESCRIPTIONS = {
  speed: "Words Per Minute (WPM) calculated based on correct keystrokes over time.",
  accuracy: "Percentage of characters typed correctly on the first attempt.",
  words: "Total count of words completed in this session.",
  multipliers: "Bonus factors based on your performance. High accuracy, stable cadence, and longer sessions increase your XP gain.",
  deep: "Advanced metrics analyzing your typing rhythm and cognitive focus during the session.",
  rested: "Bonus XP earned by using your rested buffer. Refreshes when you are not typing.",
  unlocks: "Items or features unlocked during this session, such as new books, themes, or fonts.",
  achievements: "Permanent badges earned by meeting specific performance milestones.",
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
  "Speed": "Words Per Minute (WPM). A measure of your typing throughput.",
  "Accuracy": "Characters typed correctly / total characters typed. Multiplies XP.",
  "Words": "Total words completed. More words = more base XP.",
  "Cadence": "Consistency of your typing rhythm. Stable rhythm increases your cadence multiplier.",
  "Endurance": "Length of the session. Longer sessions earn a higher endurance multiplier.",
  "Rhythm": "How steady your stroke-to-stroke timing was. High scores mean professional stability.",
  "Focus": "Measures lack of pauses and corrections. High focus means you were in 'the zone'.",
  "Active Time": "Total time spent actively typing, excluding pauses.",
};

interface SessionSummaryModalProps {
  summary: SessionSummaryResponse | null;
  onClose: () => void;
  onRestart?: () => void;
}

export function SessionSummaryModal({ summary, onClose, onRestart }: SessionSummaryModalProps) {
  const [animatedXp, setAnimatedXp] = useState(0);
  const achievementNames = new Map(achievementDefinitions.map((achievement) => [achievement.key, achievement.name]));

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

  if (!summary) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(6,8,14,0.7)] px-4 py-6 backdrop-blur-xl animate-in fade-in">
      <button type="button" aria-label="Close summary" className="absolute inset-0" onClick={onClose} />
      <Card className="relative w-full max-w-4xl border-white/10 bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.5)] backdrop-blur-3xl md:p-10 animate-tooltip-in">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="space-y-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.4em] text-[var(--text-muted)]">Session Complete</p>
              <h2 className="mt-4 text-5xl font-bold tracking-tight text-[var(--text)]">
                {summary.xpGained > 0 ? "XP lands after the work is done." : "Session complete. The silent growth counts."}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-muted)]">
                {summary.xpGained > 0 
                  ? "The session was silent. The growth is loud. Your efforts have been recorded." 
                  : "Type tests and practice sessions don't grant XP, but they sharpen the blade."}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryMetric label="Speed" value={`${summary.sessionPoint.wpm.toFixed(1)} WPM`} />
              <SummaryMetric label="Accuracy" value={formatPercent(summary.sessionPoint.accuracy)} />
              <SummaryMetric label="Words" value={summary.sessionPoint.wordsTyped.toLocaleString()} />
            </div>

            <div className="rounded-[32px] border border-[var(--border)] bg-black/20 p-6">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Multiplier Stack</p>
                <InfoTooltip content={SUMMARY_DESCRIPTIONS.multipliers} trigger="click">
                  <InfoIcon className="h-3.5 w-3.5" />
                </InfoTooltip>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <SummaryMetric label="Accuracy" value={`${summary.accuracyMultiplier.toFixed(2)}x`} compact />
                <SummaryMetric label="Cadence" value={`${summary.cadenceMultiplier.toFixed(2)}x`} compact />
                <SummaryMetric label="Endurance" value={`${summary.enduranceMultiplier.toFixed(2)}x`} compact />
              </div>
              {summary.xpGained > 0 && (
                <div className="mt-8 flex items-end justify-between gap-4 border-t border-[var(--border)] pt-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Rested Bonus</p>
                      <InfoTooltip content={SUMMARY_DESCRIPTIONS.rested} trigger="hover">
                        <InfoIcon className="h-3 w-3" />
                      </InfoTooltip>
                    </div>
                    <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">+{summary.restedBonusXp.toLocaleString()} XP</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Session Total</p>
                    <p className="mt-2 text-6xl font-black tracking-tighter text-[var(--accent)] tabular-nums drop-shadow-[0_0_20px_rgba(138,173,244,0.3)]">
                      {animatedXp.toLocaleString()} <span className="text-2xl font-bold tracking-tight">XP</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {summary.xpGained > 0 && (
              <div className="rounded-[32px] border border-[var(--border)] bg-gradient-to-r from-[rgba(138,173,244,0.1)] to-transparent p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--text-muted)]">Profile Progression</p>
                    <h3 className="mt-3 text-3xl font-bold tracking-tight">
                      Level {summary.profile.level} <span className="text-[var(--accent)]">·</span> {summary.profile.title}
                    </h3>
                  </div>
                  {summary.levelAfter > summary.levelBefore && (
                    <div className="rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_20px_rgba(138,173,244,0.5)]">
                      Level Up
                    </div>
                  )}
                </div>
                <div className="mt-6 h-4 overflow-hidden rounded-full bg-black/30 p-1">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#b8d0ff] transition-[width] duration-1000 ease-out"
                    style={{ width: `${summary.profile.progressToNextLevel * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border-[var(--border)] bg-black/10 p-6">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--text-muted)]">Unlocks</p>
                <InfoTooltip content={SUMMARY_DESCRIPTIONS.unlocks} trigger="click">
                  <InfoIcon className="h-3 w-3" />
                </InfoTooltip>
              </div>
              <div className="mt-6 space-y-3">
                {summary.unlockedRewards.length > 0 ? (
                  summary.unlockedRewards.map((reward) => (
                    <div key={reward} className="rounded-[20px] border border-[var(--border)] bg-[var(--accent-soft)] px-5 py-4 text-sm font-semibold text-[var(--text)]">
                      {reward}
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-medium text-[var(--text-muted)] opacity-50">No new unlocks this session.</p>
                )}
              </div>
            </Card>

            <Card className="border-[var(--border)] bg-black/10 p-6">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--text-muted)]">Achievements</p>
                <InfoTooltip content={SUMMARY_DESCRIPTIONS.achievements} trigger="click">
                  <InfoIcon className="h-3 w-3" />
                </InfoTooltip>
              </div>
              <div className="mt-6 space-y-3">
                {summary.newlyEarnedAchievements.length > 0 ? (
                  summary.newlyEarnedAchievements.map((achievement) => (
                    <div key={achievement.key} className="rounded-[20px] border border-[var(--border)] bg-[var(--success)]/10 px-5 py-4 text-sm font-semibold text-[var(--success)]">
                      {achievementNames.get(achievement.key) ?? achievement.key}
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-medium text-[var(--text-muted)] opacity-50">Keep pushing for milestones.</p>
                )}
              </div>
            </Card>

            <Card className="border-[var(--border)] bg-black/10 p-6">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--text-muted)]">Deep Analytics</p>
                <InfoTooltip content={SUMMARY_DESCRIPTIONS.deep} trigger="click">
                  <InfoIcon className="h-3.5 w-3.5" />
                </InfoTooltip>
              </div>
              <div className="mt-6 grid gap-4">
                <SummaryMetric label="Rhythm" value={`${summary.deepAnalytics.rhythmScore.toFixed(0)}%`} compact />
                <SummaryMetric label="Focus" value={`${summary.deepAnalytics.focusScore.toFixed(0)}%`} compact />
                <SummaryMetric
                  label="Active Time"
                  value={`${summary.deepAnalytics.activeTypingSeconds.toLocaleString()}s`}
                  compact
                />
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap justify-end gap-4 border-t border-[var(--border)] pt-8">
          {onRestart && (
            <Button variant="secondary" onClick={onRestart} className="px-8 py-6 text-base">
              Restart
            </Button>
          )}
          <Button onClick={onClose} className="px-10 py-6 text-base font-bold">Close</Button>
        </div>
      </Card>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  const description = METRIC_DESCRIPTIONS[label] || "Description not available.";
  
  return (
    <InfoTooltip content={description} trigger="hover" maxWidth="240px" className="w-full">
      <div className="group relative w-full cursor-help overflow-hidden rounded-[24px] border border-[var(--border)] bg-white/5 px-5 py-5 transition-all hover:border-[var(--accent)] hover:bg-white/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">{label}</p>
        <p className={compact ? "mt-2 text-xl font-bold tracking-tight" : "mt-3 text-3xl font-bold tracking-tight"}>{value}</p>
      </div>
    </InfoTooltip>
  );
}
