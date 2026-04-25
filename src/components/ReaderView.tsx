import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useBufferedKeystrokeTransport } from "../hooks/useBufferedKeystrokeTransport";
import { resolveKeyboardLayout } from "../lib/keyboard-layouts";
import { cn, formatPercent } from "../lib/utils";
import { paginateText } from "../utils/pagination";
import {
  applyTypingInput,
  computeMetrics,
  createSnapshotFromWordStart,
  createTypingSnapshot,
  currentCursorIndex,
  finalizeMetrics,
  parseIgnoredCharacterSet,
  tokenizeText,
} from "../utils/typing";
import type {
  AnalyticsSummary,
  AppSettings,
  InteractionMode,
  KeystrokeEvent,
  LiveMetrics,
  ParsedBook,
  ProcessKeystrokeBatchInput,
  ProcessKeystrokeBatchResult,
  ReaderMode,
  SessionSummaryResponse,
  TypingSnapshot,
} from "../types";
import { SessionSummaryModal } from "./SessionSummaryModal";
import { TypingLayer } from "./TypingLayer";
import { Button } from "./ui/button";

interface ReaderViewProps {
  book: ParsedBook;
  chapterIndex: number;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  settings: AppSettings;
  analytics: AnalyticsSummary | null;
  desktopReady: boolean;
  loadingBook: boolean;
  onBackToLibrary: () => void;
  onChapterChange: (index: number) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onOpenSettings: () => void;
  onProgress: (bookId: number, currentIndex: number, currentChapter: number) => Promise<void>;
  onProcessBatch: (payload: ProcessKeystrokeBatchInput) => Promise<ProcessKeystrokeBatchResult>;
  onError: (message: string) => void;
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
  analytics,
  desktopReady,
  loadingBook,
  onBackToLibrary,
  onChapterChange,
  onInteractionModeChange,
  onOpenSettings,
  onProgress,
  onProcessBatch,
  onError,
}: ReaderViewProps) {
  const chapter = book.chapters[chapterIndex];
  const normalizedText = useMemo(() => chapter.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), [chapter.text]);
  const tokens = useMemo(() => tokenizeText(normalizedText), [normalizedText]);
  const ignoredCharacterSet = useMemo(() => parseIgnoredCharacterSet(settings.ignoredCharacters), [settings.ignoredCharacters]);
  const keyboardLayout = useMemo(() => resolveKeyboardLayout(settings), [settings]);
  const resumeCursorIndex = useMemo(
    () => (chapterIndex === book.currentChapter ? book.currentIndex : 0),
    [book.currentChapter, book.currentIndex, chapterIndex],
  );

  const [snapshot, setSnapshot] = useState<TypingSnapshot>(() => createTypingSnapshot(tokens, resumeCursorIndex));
  const [events, setEvents] = useState<KeystrokeEvent[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [sessionStartAt, setSessionStartAt] = useState<number | null>(null);
  const [lastInputAt, setLastInputAt] = useState<number | null>(null);
  const [lastMouseAt, setLastMouseAt] = useState<number>(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [pageIndex, setPageIndex] = useState(0);
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);

  const snapshotRef = useRef(snapshot);
  const eventsRef = useRef(events);
  const sessionStartRef = useRef<number | null>(sessionStartAt);
  const lastInputRef = useRef<number | null>(lastInputAt);

  snapshotRef.current = snapshot;
  eventsRef.current = events;
  sessionStartRef.current = sessionStartAt;
  lastInputRef.current = lastInputAt;

  const transport = useBufferedKeystrokeTransport({
    desktopReady,
    context: {
      bookId: book.id,
      source: "book",
      sourceLabel: `${book.title} · ${chapter.title}`,
      keyboardLayout,
    },
    processBatch: onProcessBatch,
    onError,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAvailableHeight(entry.contentRect.height);
        setAvailableWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { maxLines, lineHeightPx, charsPerLine } = useMemo(() => {
    const fontSize = settings.baseFontSize;
    const lineHeight = settings.lineHeight;
    const lineHeightPx = Math.round(fontSize * lineHeight);
    const internalOverhead = 52 + 32 + 16;
    const measuredHeight = availableHeight || (typeof window !== "undefined" ? window.innerHeight - 40 : 800);
    const usableHeight = measuredHeight - internalOverhead;
    const maxLines = Math.max(5, Math.floor(usableHeight / lineHeightPx));
    const usableWidth = (availableWidth - 24) / 2 - 48 - 2;
    const charsPerLine = Math.max(20, Math.floor(usableWidth / (fontSize * 0.6)));

    return {
      maxLines,
      lineHeightPx,
      charsPerLine,
    };
  }, [settings.baseFontSize, settings.lineHeight, availableHeight, availableWidth]);

  const pageRanges = useMemo(() => paginateText(normalizedText, maxLines, charsPerLine, tokens), [normalizedText, maxLines, charsPerLine, tokens]);
  const pages = useMemo(() => pageRanges.map((range) => normalizedText.substring(range.start, range.end)), [normalizedText, pageRanges]);

  const liveMetrics = useMemo(() => {
    const elapsedSeconds = sessionStartAt ? Math.max(1, Math.round((clock - sessionStartAt) / 1000)) : 0;
    return computeMetrics(events, elapsedSeconds, snapshot, tokens);
  }, [clock, events, sessionStartAt, snapshot, tokens]);

  useEffect(() => {
    setMetrics(liveMetrics);
  }, [liveMetrics]);

  useEffect(() => {
    const nextSnapshot = createTypingSnapshot(tokens, resumeCursorIndex);
    setSnapshot(nextSnapshot);
    snapshotRef.current = nextSnapshot;
    setEvents([]);
    eventsRef.current = [];
    setMetrics(EMPTY_METRICS);
    setSessionStartAt(null);
    sessionStartRef.current = null;
    setLastInputAt(null);
    lastInputRef.current = null;
    setPageIndex(0);
    setSummary(null);
    transport.resetTransport();
  }, [resumeCursorIndex, tokens]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    let lastX = -1;
    let lastY = -1;
    const onMouseMove = (event: MouseEvent) => {
      if (event.clientX !== lastX || event.clientY !== lastY) {
        lastX = event.clientX;
        lastY = event.clientY;
        setLastMouseAt(Date.now());
      }
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

    if (Date.now() - lastInputAt >= 30_000) {
      void flushSession(false, true);
    }
  }, [clock, interactionMode, lastInputAt, sessionStartAt]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSession(false, false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (interactionMode !== "type") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.userAgent.toLowerCase().includes("mac");
      const isWordDeletion = event.key === "Backspace" && (isMac ? event.metaKey : event.ctrlKey);

      if (event.key === "Escape") {
        event.preventDefault();
        void flushSession(true, false);
        return;
      }

      if (
        event.altKey ||
        (isMac && event.metaKey && !isWordDeletion) ||
        (!isMac && event.ctrlKey && !isWordDeletion) ||
        (!isMac && event.metaKey)
      ) {
        return;
      }

      const relevant =
        isWordDeletion ||
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

      const previousSnapshot = snapshotRef.current;
      const nextSnapshot: TypingSnapshot = {
        ...previousSnapshot,
        words: [...previousSnapshot.words],
      };
      nextSnapshot.words[nextSnapshot.currentWordIndex] = {
        ...nextSnapshot.words[nextSnapshot.currentWordIndex],
      };

      const result = applyTypingInput(nextSnapshot, tokens, { key: event.key, ctrlKey: isWordDeletion }, now, {
        enterToSkip: settings.enterToSkip,
        ignoredCharacterSet,
        layoutId: keyboardLayout.id,
      });

      setSnapshot(result.snapshot);
      snapshotRef.current = result.snapshot;
      const nextEvent = result.event;
      if (nextEvent) {
        setEvents((current) => {
          const next = [...current, nextEvent];
          eventsRef.current = next;
          return next;
        });
        transport.pushEvent(nextEvent);
      }
      setLastInputAt(now);
      lastInputRef.current = now;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ignoredCharacterSet, interactionMode, keyboardLayout.id, settings.enterToSkip, tokens, transport]);

  useEffect(() => {
    const handleNav = (event: KeyboardEvent) => {
      if (readerMode !== "spread") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "ArrowRight") {
        setPageIndex((current) => {
          const next = current + 2;
          return next < pages.length ? next : current;
        });
      } else if (event.key === "ArrowLeft") {
        setPageIndex((current) => Math.max(0, current - 2));
      }
    };

    window.addEventListener("keydown", handleNav);
    return () => window.removeEventListener("keydown", handleNav);
  }, [pages.length, readerMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void onProgress(book.id, currentCursorIndex(snapshot, tokens), chapterIndex);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [book.id, chapterIndex, onProgress, snapshot, tokens]);

  useEffect(() => {
    return () => {
      void flushSession(false, false);
    };
  }, [book.id, chapter.id, interactionMode]);

  useEffect(() => {
    if (readerMode === "spread") {
      window.scrollTo(0, 0);
    }
  }, [readerMode]);

  useEffect(() => {
    const currentIndex = currentCursorIndex(snapshot, tokens);
    const activePage = pageRanges.findIndex((range) => currentIndex >= range.start && currentIndex < range.end);
    if (activePage >= 0) {
      setPageIndex(activePage - (activePage % 2));
    }
  }, [pageRanges, snapshot, tokens]);

  async function flushSession(revealSummary: boolean, inactive: boolean) {
    const startAt = sessionStartRef.current;
    if (!startAt) {
      return;
    }

    const result = finalizeMetrics(eventsRef.current, startAt, Date.now(), inactive ? 30_000 : 0);
    setSessionStartAt(null);
    sessionStartRef.current = null;
    setLastInputAt(null);
    lastInputRef.current = null;
    setEvents([]);
    eventsRef.current = [];

    if (result.wordsTyped === 0) {
      transport.resetTransport();
      return;
    }

    const saved = await transport.flushPending({
      bookId: book.id,
      source: "book",
      sourceLabel: `${book.title} · ${chapter.title}`,
      startTime: new Date(startAt).toISOString(),
      endTime: new Date(result.effectiveEndTimeMs).toISOString(),
      wordsTyped: result.wordsTyped,
      charsTyped: result.charsTyped,
      errors: result.errors,
      wpm: result.wpm,
      accuracy: result.accuracy,
      durationSeconds: result.durationSeconds,
    });

    if (revealSummary && saved) {
      setSummary(saved);
    }
  }

  function handleWordSelect(wordIndex: number) {
    if (interactionMode !== "type") {
      onInteractionModeChange("type");
    }

    void flushSession(false, false);
    const nextSnapshot = createSnapshotFromWordStart(tokens, wordIndex);
    setSnapshot(nextSnapshot);
    snapshotRef.current = nextSnapshot;
    setMetrics(EMPTY_METRICS);
  }

  function handleChapterJump(nextIndex: number) {
    void flushSession(false, false);
    onChapterChange(nextIndex);
  }

  const headerVisible = clock - lastMouseAt < 1600;
  const readerFontClass = "font-[var(--font-main)]";
  const visibleLeft = pageRanges[pageIndex];
  const visibleRight = pageRanges[pageIndex + 1];
  const xpProgress =
    analytics && analytics.profile.nextLevelXp > analytics.profile.currentLevelXp
      ? Math.min(
          1,
          analytics.profile.progressToNextLevel +
            metrics.typedWords / Math.max(1, analytics.profile.nextLevelXp - analytics.profile.currentLevelXp),
        )
      : 0;

  return (
    <>
      <div
        className={cn(
          "relative flex flex-col rounded-[34px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] shadow-panel",
          readerMode === "spread" ? "h-full overflow-hidden" : "mb-12 min-h-screen",
          readerFontClass,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />
        <div className="absolute inset-x-0 top-0 z-10 h-px bg-white/10">
          <div className="h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${xpProgress * 100}%` }} />
        </div>

        <div
          className={cn(
            "fixed inset-x-0 top-0 z-40 px-4 pt-4 transition duration-300 md:px-6",
            headerVisible ? "translate-y-0 opacity-100" : "-translate-y-20 opacity-0",
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
                onClick={() => void flushSession(true, false)}
                disabled={!sessionStartAt}
                className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text)] transition hover:border-[var(--accent)] disabled:opacity-40"
              >
                End Session
              </button>
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

        <div
          className={cn(
            "fixed left-4 top-1/2 z-50 -translate-y-1/2 transition duration-500 md:left-8",
            headerVisible && readerMode === "spread" ? "translate-x-0 opacity-100" : "-translate-x-8 pointer-events-none opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() => setPageIndex((current) => Math.max(0, current - 2))}
            disabled={pageIndex === 0}
            className="group flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_76%,transparent)] text-[var(--text)] shadow-panel backdrop-blur-2xl transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30"
          >
            <span className="text-2xl transition group-hover:-translate-x-0.5">‹</span>
          </button>
        </div>

        <div
          className={cn(
            "fixed right-4 top-1/2 z-50 -translate-y-1/2 transition duration-500 md:right-8",
            headerVisible && readerMode === "spread" ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() => setPageIndex((current) => Math.min(Math.max(pages.length - 2, 0), current + 2))}
            disabled={pageIndex >= pages.length - 2}
            className="group flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_76%,transparent)] text-[var(--text)] shadow-panel backdrop-blur-2xl transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30"
          >
            <span className="text-2xl transition group-hover:translate-x-0.5">›</span>
          </button>
        </div>

        <div
          ref={containerRef}
          className={cn(
            "relative mx-auto flex-1 w-full px-4 md:px-6",
            readerMode === "spread" ? "max-w-[1600px] pb-6 pt-20" : "max-w-[1360px] pb-24 pt-24",
          )}
        >
          {loadingBook && <p className="mb-4 text-sm text-[var(--text-muted)]">Loading book…</p>}

          {readerMode === "scroll" ? (
            <div className={cn("mx-auto max-w-5xl", readerFontClass)}>
              <div
                className="rounded-[36px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_68%,transparent)] px-6 py-8 md:px-10 md:py-12"
                style={{ fontSize: `${settings.baseFontSize}px`, lineHeight: settings.lineHeight }}
              >
                <TypingLayer
                  key="scroll-layer"
                  tokens={tokens}
                  snapshot={snapshot}
                  chapterText={normalizedText}
                  interactionMode={interactionMode}
                  smoothCaret={settings.smoothCaret && analytics?.profile.unlocks.smoothCaret}
                  compareOptions={{ ignoredCharacters: ignoredCharacterSet }}
                  onWordClick={handleWordSelect}
                />
              </div>
            </div>
          ) : (
            <div className="grid h-full w-full gap-6 lg:grid-cols-2">
              <SpreadPage title={`Page ${pageIndex + 1}`} style={settings} maxLines={maxLines} lineHeightPx={lineHeightPx}>
                {visibleLeft && (
                  <TypingLayer
                    key={`spread-left-${pageIndex}`}
                    tokens={tokens}
                    snapshot={snapshot}
                    chapterText={normalizedText}
                    visibleRange={visibleLeft}
                    noScroll={true}
                    faded={false}
                    interactionMode={interactionMode}
                    smoothCaret={settings.smoothCaret && analytics?.profile.unlocks.smoothCaret}
                    compareOptions={{ ignoredCharacters: ignoredCharacterSet }}
                    onWordClick={handleWordSelect}
                  />
                )}
              </SpreadPage>

              <SpreadPage title={`Page ${pageIndex + 2}`} style={settings} maxLines={maxLines} lineHeightPx={lineHeightPx}>
                {visibleRight && (
                  <TypingLayer
                    key={`spread-right-${pageIndex}`}
                    tokens={tokens}
                    snapshot={snapshot}
                    chapterText={normalizedText}
                    visibleRange={visibleRight}
                    noScroll={true}
                    faded={false}
                    interactionMode={interactionMode}
                    smoothCaret={settings.smoothCaret && analytics?.profile.unlocks.smoothCaret}
                    compareOptions={{ ignoredCharacters: ignoredCharacterSet }}
                    onWordClick={handleWordSelect}
                  />
                )}
              </SpreadPage>
            </div>
          )}
        </div>

        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-6 z-40 flex items-end justify-between px-4 transition-opacity duration-300 md:px-10",
            headerVisible ? "opacity-100" : "opacity-40",
          )}
        >
          <div className="pointer-events-auto">
            <Button
              variant="ghost"
              className="bg-[var(--panel)]/50 backdrop-blur-lg"
              onClick={() => handleChapterJump(Math.max(chapterIndex - 1, 0))}
              disabled={chapterIndex === 0}
            >
              Previous Chapter
            </Button>
          </div>

          <div className="pointer-events-auto rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_65%,transparent)] px-6 py-2.5 text-sm font-medium text-[var(--text)] shadow-panel backdrop-blur-xl">
            {Math.round(metrics.wpm)} WPM • {formatPercent(metrics.accuracy)} Acc
          </div>

          <div className="pointer-events-auto">
            <Button
              variant="ghost"
              className="bg-[var(--panel)]/50 backdrop-blur-lg"
              onClick={() => handleChapterJump(Math.min(chapterIndex + 1, book.chapters.length - 1))}
              disabled={chapterIndex >= book.chapters.length - 1}
            >
              Next Chapter
            </Button>
          </div>
        </div>
      </div>

      <SessionSummaryModal summary={summary} onClose={() => setSummary(null)} />
    </>
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
  maxLines,
  lineHeightPx,
  children,
}: {
  title: string;
  style: AppSettings;
  maxLines: number;
  lineHeightPx: number;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[34px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent)] px-6 pb-5 pt-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        "font-[var(--font-main)]",
      )}
      style={{ fontSize: `${style.baseFontSize}px`, lineHeight: `${lineHeightPx}px` }}
    >
      <p className="mb-4 shrink-0 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{title}</p>
      <div
        className="overflow-hidden whitespace-pre-wrap"
        style={{
          height: `${maxLines * lineHeightPx}px`,
        }}
      >
        {children}
      </div>
      <div className="flex-1" />
    </div>
  );
}
