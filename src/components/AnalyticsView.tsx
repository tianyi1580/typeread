import { Card } from "./ui/card";
import { formatDuration } from "../lib/utils";
import type { AnalyticsSummary } from "../types";

export function AnalyticsView({ analytics }: { analytics: AnalyticsSummary | null }) {
  if (!analytics) {
    return (
      <Card className="p-8">
        <p className="text-sm text-[var(--text-muted)]">No analytics are available yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Total Words" value={analytics.totalWordsTyped.toLocaleString()} />
        <StatCard label="Total Time" value={formatDuration(analytics.totalTimeSeconds)} />
        <StatCard label="Avg WPM" value={analytics.averageWpm.toFixed(1)} />
        <StatCard label="Avg Accuracy" value={`${analytics.averageAccuracy.toFixed(1)}%`} />
        <StatCard label="Sessions" value={analytics.sessions.toString()} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="WPM Progression" color="var(--accent)" values={analytics.history.map((item) => item.wpm)} labels={analytics.history.map((item) => item.day)} />
        <ChartCard title="Accuracy Trend" color="var(--success)" values={analytics.history.map((item) => item.accuracy)} labels={analytics.history.map((item) => item.day)} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{value}</p>
    </Card>
  );
}

function ChartCard({
  title,
  values,
  labels,
  color,
}: {
  title: string;
  values: number[];
  labels: string[];
  color: string;
}) {
  const width = 640;
  const height = 260;
  const padding = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const points = values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
        <span className="text-sm text-[var(--text-muted)]">{labels.length} samples</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <defs>
          <linearGradient id={`gradient-${title}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {[0, 1, 2, 3].map((line) => {
          const y = padding + ((height - padding * 2) / 3) * line;
          return <line key={line} x1={padding} x2={width - padding} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 6" />;
        })}
        {points && (
          <>
            <polyline fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" points={points} />
            <polygon
              fill={`url(#gradient-${title})`}
              points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
            />
          </>
        )}
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {labels.map((label) => (
          <span key={label}>{label.slice(5)}</span>
        ))}
      </div>
    </Card>
  );
}
