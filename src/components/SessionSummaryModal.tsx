import { useEffect, useState, useMemo } from "react";
import { cn, formatDuration } from "../lib/utils";
import type { SessionSummaryResponse, WpmSample } from "../types";
import { Button } from "./ui/button";
import { InfoTooltip } from "./ui/InfoTooltip";
import { motion, animate } from "framer-motion";
import confetti from "canvas-confetti";

const METRIC_DESCRIPTIONS: Record<string, string> = {
  "Speed": "Words Per Minute (WPM). A measure of your typing throughput.",
  "Accuracy": "Characters typed correctly / total characters typed.",
  "Words": "Total words completed in this session.",
  "Rhythm": "Consistency of your inter-character timing. Higher is better.",
  "Focus": "Ability to maintain speed without sudden pauses or long hesitations.",
  "Consistency": "Coefficient of Variation for rhythm. Lower values mean more stable typing.",
  "Time": "Active duration spent typing during this session.",
};

interface SessionSummaryModalProps {
  summary: SessionSummaryResponse | null;
  onClose: () => void;
}

function CountUp({ value, decimals = 0, suffix = "" }: { value: number, decimals?: number, suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.5,
      ease: [0.16, 1, 0.3, 1], // Custom cubic-bezier for a smooth decelerating count
      onUpdate(value) {
        setDisplayValue(value);
      }
    });

    return () => controls.stop();
  }, [value]);

  return <span>{displayValue.toFixed(decimals)}{suffix}</span>;
}

export function SessionSummaryModal({ summary, onClose }: SessionSummaryModalProps) {
  const [activeMetric, setActiveMetric] = useState<"wpm" | "accuracy">("wpm");
  const isTypeTest = summary?.sessionPoint.source === "type-test";

  useEffect(() => {
    if (summary) {
      const duration = 2 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 25, spread: 360, ticks: 60, zIndex: 100 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval = window.setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 15 * (timeLeft / duration);
        confetti({ 
          ...defaults, 
          particleCount, 
          colors: ['#8aadf4', '#a6da95', '#cad3f5'],
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } 
        });
        confetti({ 
          ...defaults, 
          particleCount, 
          colors: ['#8aadf4', '#a6da95', '#cad3f5'],
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } 
        });
      }, 400);

      return () => clearInterval(interval);
    }
  }, [summary?.sessionId]);

  const graphPoints = useMemo(() => {
    if (!summary || !summary.deepAnalytics) return [];
    const points = activeMetric === "wpm" ? summary.deepAnalytics.macroWpm : summary.deepAnalytics.macroAccuracy;
    return points || [];
  }, [summary, activeMetric]);

  if (!summary) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { type: "spring" as const, damping: 20, stiffness: 100 }
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[rgba(6,8,14,0.85)] px-4 py-4 backdrop-blur-2xl md:py-12">
      <motion.button 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        type="button" 
        className="absolute inset-0 cursor-default" 
        onClick={onClose} 
      />
      
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn(
          "relative w-full rounded-[40px] border border-white/10 bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] shadow-[0_32px_120px_rgba(0,0,0,0.6)] backdrop-blur-3xl",
          isTypeTest ? "max-w-3xl" : "max-w-5xl"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent pointer-events-none" />

        <div className="relative p-6 md:p-10">
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.6em] text-[var(--accent)]">
              {summary.xpGained > 0 ? "Session Complete" : "Test Results"}
            </p>
            <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-tighter text-[var(--text)]">
              {summary.xpGained > 0 ? "Performance Report" : "Great Run!"}
            </h2>
          </motion.div>

          {/* Hero Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
            <motion.div variants={itemVariants}>
              <HeroMetric 
                label="Average Speed" 
                value={<CountUp value={summary.sessionPoint?.wpm || 0} decimals={1} suffix=" WPM" />} 
                description={METRIC_DESCRIPTIONS["Speed"]}
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <HeroMetric 
                label="Accuracy" 
                value={<CountUp value={summary.sessionPoint?.accuracy || 0} decimals={1} suffix="%" />} 
                description={METRIC_DESCRIPTIONS["Accuracy"]}
                highlight={ (summary.sessionPoint?.accuracy || 0) > 98 }
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <HeroMetric 
                label="Total XP" 
                value={<CountUp value={summary.xpGained || 0} suffix=" XP" />} 
                description="Total experience points earned in this session."
                highlight={summary.levelAfter > summary.levelBefore}
              />
            </motion.div>
          </div>

          {/* Secondary Metrics */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 mb-8">
            <SummaryMetric label="Words" value={(summary.sessionPoint?.wordsTyped || 0).toLocaleString()} />
            {!isTypeTest && (
              <>
                <SummaryMetric label="Time" value={formatDuration(summary.deepAnalytics?.activeTypingSeconds || 0)} />
                <SummaryMetric label="Rhythm" value={`${(summary.deepAnalytics?.rhythmScore || 0).toFixed(0)}%`} />
                <SummaryMetric label="Focus" value={`${(summary.deepAnalytics?.focusScore || 0).toFixed(0)}%`} />
                <SummaryMetric label="Consistency" value={(summary.deepAnalytics?.cadenceCv || 0).toFixed(2)} />
              </>
            )}
          </motion.div>

          {/* Analytics & Multipliers */}
          <div className={cn("grid gap-6", isTypeTest ? "grid-cols-1" : "lg:grid-cols-[1fr_300px] mb-8")}>
            <motion.div variants={itemVariants} className="rounded-[32px] border border-[var(--border)] bg-black/40 p-6 shadow-inner">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Performance Over Time</p>
                <div className="flex gap-1 rounded-full bg-white/5 p-1">
                  {(["wpm", "accuracy"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setActiveMetric(m)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all",
                        activeMetric === m ? "bg-[var(--accent)] text-black shadow-lg" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 h-[200px]">
                <SimpleGraph points={graphPoints} unit={activeMetric === "wpm" ? "WPM" : "%"} />
              </div>
            </motion.div>

            {!isTypeTest && (
              <div className="space-y-4">
                <motion.div variants={itemVariants} className="rounded-[32px] border border-[var(--border)] bg-black/40 p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Multiplier Stack</p>
                    <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                  </div>
                  <div className="mt-4 space-y-4">
                    {summary.accuracyMultiplier !== 1 || summary.cadenceMultiplier !== 1 || summary.enduranceMultiplier !== 1 || summary.restedBonusXp > 0 ? (
                      <>
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
                      </>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)] italic">No multipliers active</p>
                    )}
                  </div>
                </motion.div>

                {summary.deepAnalytics?.transitions.slowest.length > 0 && (
                  <motion.div variants={itemVariants} className="rounded-[32px] border border-[var(--border)] bg-black/40 p-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Slowest Transitions</p>
                    <div className="mt-4 space-y-2">
                      {summary.deepAnalytics.transitions.slowest.slice(0, 3).map((t) => (
                        <div key={t.combo} className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-xs transition-all hover:border-[var(--accent)]/50 hover:bg-white/10">
                          <span className="font-black tracking-tight font-mono">{t.combo.replace(/ /g, "␣")}</span>
                          <span className="text-[var(--text-muted)] tabular-nums font-bold">{t.averageMs.toFixed(0)}ms</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* XP & Footer */}
          <motion.div 
            variants={itemVariants}
            className="flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row"
          >
            <div className="text-center sm:text-left flex flex-col items-center sm:items-start">
              {summary.levelAfter > summary.levelBefore ? (
                <div className="flex items-center gap-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--success)]">New Rank Achieved!</p>
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--success)] px-4 py-1 text-[9px] font-black uppercase text-black"
                  >
                    Level {summary.levelAfter}
                  </motion.div>
                </div>
              ) : (
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-muted)]">Session Overview Complete</p>
              )}
            </div>

            <div className="flex w-full flex-col gap-4 sm:w-auto">
              <Button 
                onClick={onClose} 
                className="group relative min-w-[240px] overflow-hidden rounded-2xl py-6 text-lg font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 bg-[var(--accent)] text-black"
              >
                <span className="relative z-10">Continue</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </Button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function HeroMetric({ label, value, description, highlight = false }: { label: string, value: React.ReactNode, description: string, highlight?: boolean }) {
  return (
    <InfoTooltip content={description} trigger="hover" maxWidth="240px" className="w-full">
      <div className={cn(
        "group relative w-full cursor-help overflow-hidden rounded-[28px] border p-6 transition-all duration-500",
        highlight 
          ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_40px_rgba(138,173,244,0.15)]" 
          : "border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10"
      )}>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">{label}</p>
        <div className="mt-3 text-4xl font-black tracking-tighter tabular-nums text-[var(--text)]">
          {value}
        </div>
        {highlight && (
          <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-[var(--accent)] animate-ping" />
        )}
      </div>
    </InfoTooltip>
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
      <div className="group relative w-full cursor-help overflow-hidden rounded-[20px] border border-white/5 bg-white/5 px-5 py-4 transition-all hover:border-[var(--accent)]/30 hover:bg-white/10">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">{label}</p>
        <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
      </div>
    </InfoTooltip>
  );
}

function MultiplierRow({ label, value, success = false }: { label: string, value: number, success?: boolean }) {
  if (value === 1 && !success) return null;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
      <span className={cn("font-black tabular-nums text-sm", success ? "text-[var(--accent)]" : "text-[var(--text)]")}>
        x{value.toFixed(2)}
      </span>
    </div>
  );
}

function SimpleGraph({ points, unit }: { points: WpmSample[]; unit: string }) {
  if (points.length === 0) return <div className="flex h-full items-center justify-center text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">Collecting Data...</div>;

  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };

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
    <motion.svg 
      viewBox={`0 0 ${width} ${height}`} 
      className="w-full h-full overflow-visible"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <defs>
        <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((ratio) => {
        const y = height - padding.bottom - ratio * (height - padding.top - padding.bottom);
        const val = Math.round(minVal + ratio * (maxVal - minVal));
        return (
          <g key={ratio}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="8 8" opacity="0.1" />
            <text x={padding.left - 15} y={y} textAnchor="end" alignmentBaseline="middle" className="fill-[var(--text-muted)] text-[10px] tabular-nums font-black">{val}</text>
          </g>
        );
      })}

      {path && (
        <>
          <motion.path 
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
            d={`${path} L ${chartPoints[chartPoints.length - 1].x} ${height - padding.bottom} L ${chartPoints[0].x} ${height - padding.bottom} Z`} 
            fill="url(#graphGradient)" 
          />
          <motion.path 
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            d={path} 
            fill="none" 
            stroke="var(--accent)" 
            strokeWidth="4" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </>
      )}

      {chartPoints.length <= 60 && chartPoints.map((p, i) => (
        <motion.circle 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1 + i * 0.02, type: "spring" as const }}
          key={i} 
          cx={p.x} 
          cy={p.y} 
          r="3" 
          fill="var(--accent)" 
          className="shadow-lg shadow-[var(--accent)]"
        />
      ))}
    </motion.svg>
  );
}
