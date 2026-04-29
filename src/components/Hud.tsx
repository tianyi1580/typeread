import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { formatDuration, formatPercent } from "../lib/utils";
import type { LiveMetrics, ReaderMode, InteractionMode } from "../types";

/**
 * Properties for the Hud component.
 */
interface HudProps {
  /** Real-time typing metrics. */
  metrics: LiveMetrics;
  /** Current chapter index. */
  chapterIndex: number;
  /** Total number of chapters. */
  chapterCount: number;
  /** Current reader mode (scroll or spread). */
  readerMode: ReaderMode;
  /** Current interaction mode (type or read). */
  interactionMode: InteractionMode;
  /** Whether to show a minimal HUD (fade out controls). */
  minimal: boolean;
  /** Callback to navigate to the previous chapter. */
  onPreviousChapter: () => void;
  /** Callback to navigate to the next chapter. */
  onNextChapter: () => void;
  /** Callback to change the reader mode. */
  onReaderModeChange: (mode: ReaderMode) => void;
  /** Callback to change the interaction mode. */
  onInteractionModeChange: (mode: InteractionMode) => void;
}

/**
 * Heads-Up Display (HUD) for tracking metrics and controlling reader modes.
 */
export function Hud({
  metrics,
  chapterIndex,
  chapterCount,
  readerMode,
  interactionMode,
  minimal,
  onPreviousChapter,
  onNextChapter,
  onReaderModeChange,
  onInteractionModeChange,
}: HudProps) {

  return (
    <Card
      className={`sticky top-0 z-20 overflow-hidden px-4 py-3 transition duration-300 ${
        minimal ? "opacity-60" : "opacity-100"
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-white/10">
        <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${metrics.progress * 100}%` }} />
      </div>
      <div className="absolute inset-x-0 top-[4px] h-[2px] bg-transparent">
        <div className="h-full bg-[var(--success)]/70 transition-all duration-300" style={{ width: `${metrics.chapterProgress * 100}%` }} />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Metric label="WPM" value={metrics.wpm.toFixed(1)} />
          <Metric label="Accuracy" value={formatPercent(metrics.accuracy)} />
          <Metric label="Session" value={formatDuration(metrics.elapsedSeconds)} />
          <div className={minimal ? "opacity-0 pointer-events-none" : "opacity-100 transition-opacity duration-300"}>
            <Metric label="Chapter" value={`${chapterIndex + 1}/${chapterCount}`} />
          </div>
        </div>

        <div className={`flex flex-wrap items-center gap-2 transition-opacity duration-300 ${minimal ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
          <div className="rounded-full bg-[var(--panel-soft)] p-1">
            <Button variant={interactionMode === "type" ? "primary" : "ghost"} onClick={() => onInteractionModeChange("type")}>
              Type
            </Button>
            <Button variant={interactionMode === "read" ? "primary" : "ghost"} onClick={() => onInteractionModeChange("read")}>
              Read
            </Button>
          </div>
          <div className="rounded-full bg-[var(--panel-soft)] p-1">
            <Button variant={readerMode === "scroll" ? "primary" : "ghost"} onClick={() => onReaderModeChange("scroll")}>
              Scroll
            </Button>
            <Button variant={readerMode === "spread" ? "primary" : "ghost"} onClick={() => onReaderModeChange("spread")}>
              Spread
            </Button>
          </div>
          <Button variant="secondary" onClick={onPreviousChapter} disabled={chapterIndex === 0}>
            Previous
          </Button>
          <Button variant="secondary" onClick={onNextChapter} disabled={chapterIndex >= chapterCount - 1}>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-1.5">
      <span className="mr-2 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
}
