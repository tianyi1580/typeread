import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { paginateText } from "../utils/pagination";
import {
  applyTypingInput,
  computeMetrics,
  createTypingSnapshot,
  currentChapterIndex,
  finalizeMetrics,
  tokenizeText,
} from "../utils/typing";
import type {
  AppSettings,
  InteractionMode,
  KeystrokeEvent,
  LiveMetrics,
  ParsedBook,
  ReaderMode,
  TokenizedWord,
  TypingSnapshot,
  TypingSessionInput,
} from "../types";
import { TypingLayer } from "./TypingLayer";
import { Button } from "./ui/button";
import { cn, formatPercent } from "../lib/utils";

interface ReaderViewProps {
  book: ParsedBook;
  chapterIndex: number;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  settings: AppSettings;
  desktopReady: boolean;
  loadingBook: boolean;
  onBackToLibrary: () => void;
  onChapterChange: (index: number) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onOpenSettings: () => void;
  onProgress: (bookId: number, currentIndex: number, currentChapter: number) => Promise<void>;
  onSaveSession: (session: TypingSessionInput) => Promise<void>;
}

const EMPTY_METRICS: LiveMetrics = {
  wpm: 0,
  accuracy: 100,
  elapsedSeconds: 0,
  typedWords: 0,
  typedChars: 0,
  errors: 0,
  progress: 0,
  chapterProgress: 0,
};

export function ReaderView({
  book,
  chapterIndex,
  readerMode,
  interactionMode,
  settings,
  desktopReady,
  loadingBook,
  onBackToLibrary,
  onChapterChange,
  onInteractionModeChange,
  onOpenSettings,
  onProgress,
  onSaveSession,
}: ReaderViewProps) {
  const chapter = book.chapters[chapterIndex];
  const tokens = useMemo(() => tokenizeText(chapter.text), [chapter]);
  const [snapshot, setSnapshot] = useState<TypingSnapshot>(() => createTypingSnapshot(tokens));
  const [events, setEvents] = useState<KeystrokeEvent[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [sessionStartAt, setSessionStartAt] = useState<number | null>(null);
  const [lastInputAt, setLastInputAt] = useState<number | null>(null);
  const [lastMouseAt, setLastMouseAt] = useState<number>(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [pageIndex, setPageIndex] = useState(0);

  const snapshotRef = useRef(snapshot);
  const eventsRef = useRef(events);
  const sessionStartRef = useRef<number | null>(sessionStartAt);
  const lastInputRef = useRef<number | null>(lastInputAt);

  snapshotRef.current = snapshot;
  eventsRef.current = events;
  sessionStartRef.current = sessionStartAt;
  lastInputRef.current = lastInputAt;

  const pageChars = typeof window !== "undefined" && window.innerWidth < 960 ? 1200 : 1700;
  const pages = useMemo(() => paginateText(chapter.text, pageChars), [chapter.text, pageChars]);
  const pageRanges = useMemo(() => {
    let cursor = 0;
    return pages.map((page) => {
      const start = cursor;
      const end = cursor + page.length;
      cursor = end;
      return { start, end };
    });
  }, [pages]);

  const liveMetrics = useMemo(() => {
    const elapsedSeconds = sessionStartAt ? Math.max(1, Math.round((clock - sessionStartAt) / 1000)) : 0;
    return computeMetrics(events, elapsedSeconds, snapshot, tokens);
  }, [clock, events, sessionStartAt, snapshot, tokens]);

  useEffect(() => {
    setMetrics(liveMetrics);
  }, [liveMetrics]);

  useEffect(() => {
    setSnapshot(createTypingSnapshot(tokens));
    setEvents([]);
    setMetrics(EMPTY_METRICS);
    setSessionStartAt(null);
    setLastInputAt(null);
    setPageIndex(0);
  }, [tokens]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    const onMouseMove = () => {
      setLastMouseAt(Date.now());
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  useEffect(() => {
    if (!sessionStartAt || !lastInputAt || interactionMode !== "type") {
      return;
    }

    if (Date.now() - lastInputAt >= 30000) {
      void flushSession(true);
    }
  }, [clock, interactionMode, lastInputAt, sessionStartAt]);

  useEffect(() => {
    if (interactionMode !== "type") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const relevant =
        event.key === "Backspace" ||
        (settings.enterToSkip && event.key === "Enter") ||
        event.key === " " ||
        (event.key.length === 1 && !event.key.match(/\s/) ? true : false);

      if (!relevant) {
        return;
      }

      event.preventDefault();
      const now = Date.now();
      if (!sessionStartRef.current) {
        setSessionStartAt(now);
        sessionStartRef.current = now;
      }

      const prevSnapshot = snapshotRef.current;
      const nextSnapshot: TypingSnapshot = {
        ...prevSnapshot,
        words: [...prevSnapshot.words],
      };

      nextSnapshot.words[nextSnapshot.currentWordIndex] = {
        ...nextSnapshot.words[nextSnapshot.currentWordIndex],
      };

      const result = applyTypingInput(nextSnapshot, tokens, event.key, now, {
        enterToSkip: settings.enterToSkip,
        ignoreQuotationMarks: settings.ignoreQuotationMarks,
      });

      setSnapshot(result.snapshot);
      snapshotRef.current = result.snapshot;
      if (result.event) {
        setEvents((current) => {
          const next = [...current, result.event as KeystrokeEvent];
          eventsRef.current = next;
          return next;
        });
      }
      setLastInputAt(now);
      lastInputRef.current = now;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [interactionMode, settings.enterToSkip, settings.ignoreQuotationMarks, tokens]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void onProgress(book.id, currentChapterIndex(snapshot, tokens), chapterIndex);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [book.id, chapterIndex, onProgress, snapshot, tokens]);

  useEffect(() => {
    return () => {
      void flushSession(false);
    };
  }, [book.id, chapter.id, interactionMode]);

  useEffect(() => {
    const currentIndex = currentChapterIndex(snapshot, tokens);
    const activePage = pageRanges.findIndex((range) => currentIndex >= range.start && currentIndex <= range.end);
    if (activePage >= 0) {
      setPageIndex(Math.max(0, activePage - (activePage % 2)));
    }
  }, [pageRanges, snapshot, tokens]);

  async function flushSession(inactive: boolean) {
    const startAt = sessionStartRef.current;
    if (!startAt) {
      return;
    }

    const result = finalizeMetrics(eventsRef.current, startAt, Date.now(), inactive ? 30000 : 0);
    setSessionStartAt(null);
    sessionStartRef.current = null;
    setLastInputAt(null);
    lastInputRef.current = null;
    setEvents([]);
    eventsRef.current = [];

    if (result.wordsTyped === 0 || !desktopReady) {
      return;
    }

    await onSaveSession({
      bookId: book.id,
      startTime: new Date(startAt).toISOString(),
      endTime: new Date(result.effectiveEndTimeMs).toISOString(),
      wordsTyped: result.wordsTyped,
      charsTyped: result.charsTyped,
      errors: result.errors,
      wpm: result.wpm,
      accuracy: result.accuracy,
      durationSeconds: result.durationSeconds,
    });
  }

  const headerVisible = clock - lastMouseAt < 1600;
  const readerFontClass = interactionMode === "type" ? "font-[var(--font-type)]" : "font-[var(--font-read)]";
  const visibleLeft = pageRanges[pageIndex];
  const visibleRight = pageRanges[pageIndex + 1];

  return (
    <div className="relative min-h-screen overflow-hidden rounded-[34px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] shadow-panel">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />

      <div
        className={cn(
          "absolute inset-x-0 top-0 z-30 px-4 pt-4 transition duration-300 md:px-6",
          headerVisible ? "translate-y-0 opacity-100" : "-translate-y-5 opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_76%,transparent)] px-4 py-3 shadow-panel backdrop-blur-2xl">
          <Button variant="ghost" className="rounded-full px-3 py-2" onClick={onBackToLibrary}>
            &lt; Back to Library
          </Button>

          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-medium">{book.title}</p>
            <p className="truncate text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{chapter.title}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel-soft)] p-1">
              <ModePill active={interactionMode === "read"} onClick={() => onInteractionModeChange("read")}>
                Read
              </ModePill>
              <ModePill active={interactionMode === "type"} onClick={() => onInteractionModeChange("type")}>
                Type
              </ModePill>
            </div>
            <button
              type="button"
              aria-label="Open settings"
              onClick={onOpenSettings}
              className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-[1360px] px-4 pb-24 pt-24 md:px-6">
        {loadingBook && <p className="mb-4 text-sm text-[var(--text-muted)]">Loading book…</p>}

        {readerMode === "scroll" ? (
          <div className={cn("mx-auto max-w-5xl", readerFontClass)}>
            <div
              className="rounded-[36px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_68%,transparent)] px-6 py-8 md:px-10 md:py-12"
              style={{ fontSize: `${settings.baseFontSize}px`, lineHeight: settings.lineHeight }}
            >
              {interactionMode === "type" ? (
                <TypingLayer
                  tokens={tokens}
                  snapshot={snapshot}
                  className="tracking-[0.01em]"
                  compareOptions={{ ignoreQuotationMarks: settings.ignoreQuotationMarks }}
                />
              ) : (
                <div className="space-y-8 text-[var(--text)]">
                  {chapter.chunks.map((chunk) => (
                    <p key={chunk.id} className="whitespace-pre-wrap">
                      {chunk.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative grid gap-4 lg:grid-cols-2">
            {interactionMode === "read" && (
              <>
                <Button
                  variant="secondary"
                  className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full"
                  onClick={() => setPageIndex((current) => Math.max(0, current - 2))}
                  disabled={pageIndex === 0}
                >
                  ←
                </Button>
                <Button
                  variant="secondary"
                  className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full"
                  onClick={() => setPageIndex((current) => Math.min(Math.max(pages.length - 2, 0), current + 2))}
                  disabled={pageIndex >= pages.length - 2}
                >
                  →
                </Button>
              </>
            )}

            <SpreadPage title={`Page ${pageIndex + 1}`} style={settings}>
              {interactionMode === "type" ? (
                <TypingLayer
                  tokens={tokens}
                  snapshot={snapshot}
                  visibleRange={visibleLeft}
                  className="tracking-[0.01em]"
                  faded={false}
                  compareOptions={{ ignoreQuotationMarks: settings.ignoreQuotationMarks }}
                />
              ) : (
                visibleLeft && <p className="whitespace-pre-wrap">{pages[pageIndex]}</p>
              )}
            </SpreadPage>

            <SpreadPage title={`Page ${pageIndex + 2}`} style={settings}>
              {interactionMode === "type" ? (
                <TypingLayer
                  tokens={tokens}
                  snapshot={snapshot}
                  visibleRange={visibleRight}
                  className="tracking-[0.01em]"
                  faded={false}
                  compareOptions={{ ignoreQuotationMarks: settings.ignoreQuotationMarks }}
                />
              ) : (
                visibleRight && <p className="whitespace-pre-wrap">{pages[pageIndex + 1]}</p>
              )}
            </SpreadPage>
          </div>
        )}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-5 z-20 flex items-end justify-between px-4 md:px-6",
          headerVisible ? "opacity-100" : "opacity-70",
        )}
      >
        <div className="pointer-events-auto">
          <Button variant="ghost" onClick={() => onChapterChange(Math.max(chapterIndex - 1, 0))} disabled={chapterIndex === 0}>
            Previous Chapter
          </Button>
        </div>

        <div className="rounded-full bg-transparent px-4 py-2 text-sm text-[var(--text)]">
          {Math.round(metrics.wpm)} WPM • {formatPercent(metrics.accuracy)} Acc
        </div>

        <div className="pointer-events-auto">
          <Button
            variant="ghost"
            onClick={() => onChapterChange(Math.min(chapterIndex + 1, book.chapters.length - 1))}
            disabled={chapterIndex >= book.chapters.length - 1}
          >
            Next Chapter
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModePill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-4 py-2 text-sm transition", active ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)]")}
    >
      {children}
    </button>
  );
}

function SpreadPage({
  title,
  style,
  children,
}: {
  title: string;
  style: AppSettings;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-[640px] rounded-[34px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent)] px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      style={{ fontSize: `${style.baseFontSize}px`, lineHeight: style.lineHeight }}
    >
      <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{title}</p>
      <div className="min-h-[540px] whitespace-pre-wrap">{children}</div>
    </div>
  );
}
