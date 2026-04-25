import { useMemo, useState } from "react";
import { formatDuration } from "../lib/utils";
import { Card } from "./ui/card";
import { cn } from "../lib/utils";
import type { AnalyticsSummary, DailyMetric, SessionPoint } from "../types";

type MetricMode = "wpm" | "accuracy";
type RangeMode = "30" | "90" | "365" | "all";
type SortField = "date" | "title" | "duration" | "wpm";

export function AnalyticsView({ analytics }: { analytics: AnalyticsSummary | null }) {
  const [metricMode, setMetricMode] = useState<MetricMode>("wpm");
  const [rangeMode, setRangeMode] = useState<RangeMode>("90");
  const [sortField, setSortField] = useState<SortField>("date");

  const filteredHistory = useMemo(() => filterHistory(analytics?.history ?? [], rangeMode), [analytics?.history, rangeMode]);
  const recentSessions = useMemo(() => {
    const points = [...(analytics?.sessionPoints ?? [])];
    points.sort((left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime());
    return points.slice(0, 5);
  }, [analytics?.sessionPoints]);

  const sortedLedger = useMemo(() => {
    const points = [...recentSessions];
    points.sort((left, right) => compareSessions(left, right, sortField));
    return points;
  }, [recentSessions, sortField]);

  if (!analytics) {
    return (
      <Card className="p-10">
        <p className="text-sm text-[var(--text-muted)]">No analytics are available yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Profile & Analytics</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <HeroMetric label="All-Time Average WPM" value={analytics.averageWpm.toFixed(1)} />
          <HeroMetric label="Global Accuracy" value={`${analytics.averageAccuracy.toFixed(1)}%`} />
          <HeroMetric label="Total Hours Typed" value={(analytics.totalTimeSeconds / 3600).toFixed(1)} />
          <HeroMetric label="Total Words Typed" value={analytics.totalWordsTyped.toLocaleString()} />
          <HeroMetric label="Total Characters Typed" value={analytics.totalCharsTyped.toLocaleString()} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Trendline</p>
              <h2 className="mt-3 text-2xl font-semibold">{metricMode === "wpm" ? "Speed over time" : "Accuracy over time"}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <SegmentedControl
                value={metricMode}
                options={[
                  { value: "wpm", label: "WPM" },
                  { value: "accuracy", label: "Accuracy" },
                ]}
                onChange={(value) => setMetricMode(value as MetricMode)}
              />
              <SegmentedControl
                value={rangeMode}
                options={[
                  { value: "30", label: "30d" },
                  { value: "90", label: "90d" },
                  { value: "365", label: "365d" },
                  { value: "all", label: "All" },
                ]}
                onChange={(value) => setRangeMode(value as RangeMode)}
              />
            </div>
          </div>
          <div className="mt-6">
            <TrendChart history={filteredHistory} metricMode={metricMode} />
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Accuracy vs Speed</p>
          <h2 className="mt-3 text-2xl font-semibold">Where speed starts to tax precision</h2>
          <div className="mt-6">
            <ScatterChart points={analytics.sessionPoints} />
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Session Ledger</p>
            <h2 className="mt-3 text-2xl font-semibold">Latest five sessions</h2>
          </div>
          <SegmentedControl
            value={sortField}
            options={[
              { value: "date", label: "Date" },
              { value: "title", label: "Book" },
              { value: "duration", label: "Duration" },
              { value: "wpm", label: "WPM" },
            ]}
            onChange={(value) => setSortField(value as SortField)}
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-[var(--border)]">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[var(--panel-soft)] text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Book</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Session WPM</th>
              </tr>
            </thead>
            <tbody>
              {sortedLedger.map((session) => (
                <tr key={session.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 text-sm">{formatDate(session.startTime)}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-muted)]">{session.bookTitle}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-muted)]">{formatDuration(session.durationSeconds)}</td>
                  <td className="px-4 py-3 text-sm">{session.wpm.toFixed(1)}</td>
                </tr>
              ))}
              {sortedLedger.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                    No sessions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-[var(--border)] pl-4 first:border-l-0 first:pl-0">
      <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel-soft)] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-4 py-2 text-sm transition",
            value === option.value ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TrendChart({ history, metricMode }: { history: DailyMetric[]; metricMode: MetricMode }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  const width = 920;
  const height = 320;
  const padding = { top: 20, right: 20, bottom: 44, left: 56 };

  if (history.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-[var(--text-muted)]">No trend data yet.</div>;
  }

  const values = history.map((item) => (metricMode === "wpm" ? item.wpm : item.accuracy));
  const max = Math.max(...values, metricMode === "wpm" ? 80 : 100);
  const min = Math.min(...values, metricMode === "wpm" ? 0 : 85);
  const ticks = buildTicks(min, max, 5, metricMode === "accuracy" ? 1 : 5);
  const chartMin = ticks[0] ?? min;
  const chartMax = ticks[ticks.length - 1] ?? max;
  const range = Math.max(chartMax - chartMin, 1);

  const chartPoints = history.map((item, index) => {
    const value = metricMode === "wpm" ? item.wpm : item.accuracy;
    const x =
      padding.left +
      (index / Math.max(history.length - 1, 1)) * (width - padding.left - padding.right);
    const y =
      height -
      padding.bottom -
      ((value - chartMin) / range) * (height - padding.top - padding.bottom);

    return {
      day: item.day,
      value,
      x,
      y,
    };
  });

  const points = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="relative">
      {hoveredPoint && <ChartTooltip point={hoveredPoint} width={width} height={height} />}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full overflow-visible">
        {ticks.map((tick) => {
          const y =
            height -
            padding.bottom -
            ((tick - chartMin) / range) * (height - padding.top - padding.bottom);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="4 8"
              />
              <text x={padding.left - 10} y={y + 4} fill="var(--text-muted)" fontSize="12" textAnchor="end">
                {formatAxisValue(tick, metricMode)}
              </text>
            </g>
          );
        })}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="var(--border)"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="var(--border)"
        />

        {points && (
          <>
            <defs>
              <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={points} />
            <polygon
              fill="url(#trend-fill)"
              points={`${padding.left},${height - padding.bottom} ${points} ${width - padding.right},${height - padding.bottom}`}
            />
          </>
        )}

        {chartPoints.map((point) => (
          <circle
            key={point.day}
            cx={point.x}
            cy={point.y}
            r="5"
            fill="var(--panel)"
            stroke="var(--accent)"
            strokeWidth="2"
            onMouseEnter={() =>
              setHoveredPoint({
                x: point.x,
                y: point.y,
                label: formatDate(`${point.day}T00:00:00Z`),
                value: `${formatAxisValue(point.value, metricMode)} ${metricMode === "wpm" ? "WPM" : "% accuracy"}`,
              })
            }
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}

        {pickXLabelIndexes(history.length).map((index) => {
          const point = chartPoints[index];
          if (!point) {
            return null;
          }

          return (
            <text
              key={`${point.day}-label`}
              x={point.x}
              y={height - 14}
              fill="var(--text-muted)"
              fontSize="12"
              textAnchor={index === 0 ? "start" : index === history.length - 1 ? "end" : "middle"}
            >
              {formatShortDay(point.day)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function ScatterChart({ points }: { points: SessionPoint[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  const width = 420;
  const height = 320;
  const padding = { top: 20, right: 20, bottom: 44, left: 52 };

  if (points.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-[var(--text-muted)]">No session points yet.</div>;
  }

  const maxWpm = Math.max(...points.map((point) => point.wpm), 80);
  const minWpm = Math.min(...points.map((point) => point.wpm), 0);
  const wpmTicks = buildTicks(minWpm, maxWpm, 5, 5);
  const maxAccuracy = 100;
  const minAccuracy = Math.max(Math.min(...points.map((point) => point.accuracy), 92), 80);
  const accuracyTicks = buildTicks(minAccuracy, maxAccuracy, 5, 1);
  const xMin = wpmTicks[0] ?? minWpm;
  const xMax = wpmTicks[wpmTicks.length - 1] ?? maxWpm;
  const yMin = accuracyTicks[0] ?? minAccuracy;
  const yMax = accuracyTicks[accuracyTicks.length - 1] ?? maxAccuracy;

  const chartPoints = points.map((point) => {
    const x =
      padding.left +
      ((point.wpm - xMin) / Math.max(xMax - xMin, 1)) * (width - padding.left - padding.right);
    const y =
      height -
      padding.bottom -
      ((point.accuracy - yMin) / Math.max(yMax - yMin, 1)) * (height - padding.top - padding.bottom);
    const radius = 4 + Math.min(point.durationSeconds / 900, 6);

    return { point, x, y, radius };
  });

  return (
    <div className="relative">
      {hoveredPoint && <ChartTooltip point={hoveredPoint} width={width} height={height} />}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full overflow-visible">
        {accuracyTicks.map((tick) => {
          const y =
            height -
            padding.bottom -
            ((tick - yMin) / Math.max(yMax - yMin, 1)) * (height - padding.top - padding.bottom);
          return (
            <g key={`acc-${tick}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 8" />
              <text x={padding.left - 10} y={y + 4} fill="var(--text-muted)" fontSize="12" textAnchor="end">
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        {wpmTicks.map((tick) => {
          const x =
            padding.left +
            ((tick - xMin) / Math.max(xMax - xMin, 1)) * (width - padding.left - padding.right);
          return (
            <g key={`wpm-${tick}`}>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="var(--border)" strokeDasharray="4 8" />
              <text x={x} y={height - 14} fill="var(--text-muted)" fontSize="12" textAnchor="middle">
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="var(--border)" />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="var(--border)"
        />

        {chartPoints.map(({ point, x, y, radius }) => (
          <circle
            key={point.id}
            cx={x}
            cy={y}
            r={radius}
            fill="var(--success)"
            fillOpacity="0.72"
            onMouseEnter={() =>
              setHoveredPoint({
                x,
                y,
                label: `${point.bookTitle} • ${formatDate(point.startTime)}`,
                value: `${point.wpm.toFixed(1)} WPM • ${point.accuracy.toFixed(1)}% accuracy`,
              })
            }
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}

        <text x={padding.left} y={14} fill="var(--text-muted)" fontSize="12">
          Accuracy (%)
        </text>
        <text x={width - padding.right} y={height - 14} fill="var(--text-muted)" fontSize="12" textAnchor="end">
          WPM
        </text>
      </svg>
    </div>
  );
}

function filterHistory(history: DailyMetric[], rangeMode: RangeMode) {
  if (rangeMode === "all") {
    return history;
  }

  const days = Number(rangeMode);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return history.filter((item) => new Date(`${item.day}T00:00:00`).getTime() >= cutoff.getTime());
}

function compareSessions(left: SessionPoint, right: SessionPoint, field: SortField) {
  if (field === "date") {
    return new Date(right.startTime).getTime() - new Date(left.startTime).getTime();
  }
  if (field === "title") {
    return left.bookTitle.localeCompare(right.bookTitle);
  }
  if (field === "duration") {
    return right.durationSeconds - left.durationSeconds;
  }
  return right.wpm - left.wpm;
}

function ChartTooltip({
  point,
  width,
  height,
}: {
  point: { x: number; y: number; label: string; value: string };
  width: number;
  height: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] px-3 py-2 text-xs shadow-panel backdrop-blur-xl"
      style={{
        left: `${(point.x / width) * 100}%`,
        top: `${(point.y / height) * 100}%`,
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <div className="font-medium text-[var(--text)]">{point.value}</div>
      <div className="mt-1 text-[var(--text-muted)]">{point.label}</div>
    </div>
  );
}

function buildTicks(min: number, max: number, count: number, stepFloor: number) {
  const safeMin = Math.floor(Math.min(min, max));
  const safeMax = Math.ceil(Math.max(min, max));
  const range = Math.max(safeMax - safeMin, stepFloor);
  const rawStep = Math.max(range / Math.max(count - 1, 1), stepFloor);
  const step = Math.max(stepFloor, Math.ceil(rawStep / stepFloor) * stepFloor);
  const start = Math.floor(safeMin / step) * step;
  const end = Math.ceil(safeMax / step) * step;

  const ticks: number[] = [];
  for (let value = start; value <= end; value += step) {
    ticks.push(value);
  }

  return ticks;
}

function formatAxisValue(value: number, metricMode: MetricMode) {
  return metricMode === "wpm" ? value.toFixed(0) : value.toFixed(1);
}

function pickXLabelIndexes(length: number) {
  if (length <= 1) {
    return [0];
  }
  if (length === 2) {
    return [0, 1];
  }

  return [0, Math.floor((length - 1) / 2), length - 1];
}

function formatShortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
