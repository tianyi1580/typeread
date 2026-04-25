import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  wordIndexFromTextIndex,
} from "../utils/typing";
import type {
  ActiveTab,
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
import { VersusConfigModal } from "./VersusConfigModal";

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
  onSettingsChange: (settings: AppSettings) => void;
  onOpenSettings: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenTab: (tab: ActiveTab) => void;
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
  onSettingsChange,
  onOpenSettings,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenTab,
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
  const [botCursorIndex, setBotCursorIndex] = useState(0);
  const [versusConfigOpen, setVersusConfigOpen] = useState(false);

  const snapshotRef = useRef(snapshot);
  const eventsRef = useRef(events);
  const sessionStartRef = useRef<number | null>(sessionStartAt);
  const lastInputRef = useRef<number | null>(lastInputAt);
  const botCursorRef = useRef(0);
  const botPausedRef = useRef(false);

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
    
    // Internal overhead accounts for:
    // 1. ReaderView top/bottom padding: pt-20 (80px) + pb-6 (24px) = 104px
    // 2. SpreadPage top/bottom padding: pt-8 (32px) + pb-5 (20px) = 52px
    // 3. SpreadPage title: approx 16px height + mb-4 (16px) = 32px
    // Total vertical overhead: 104 (grid) + 32 (page pt) + 32 (title) + 2 (buffer) = 170px
    const verticalOverhead = 170;
    const measuredHeight = availableHeight || (typeof window !== "undefined" ? window.innerHeight : 800);
    const usableHeight = measuredHeight - verticalOverhead;
    const maxLines = Math.max(5, Math.floor(usableHeight / lineHeightPx));
    
    // Horizontal overhead:
    // 1. ReaderView side padding: px-4 or px-6 (max 24px each side) = 48px total
    // 2. Grid gap: gap-6 = 24px
    // 3. SpreadPage side padding: px-6 = 24px each side = 48px total
    // Per page horizontal overhead: (48 + 24 + 48*2) / 2 = 84px
    const horizontalOverhead = 84;
    const usableWidth = (availableWidth || (typeof window !== "undefined" ? window.innerWidth : 1200)) / 2 - horizontalOverhead;
    
    // Using 0.65 for a balance between fitting text and avoiding overflow.
    const charsPerLine = Math.max(20, Math.floor(usableWidth / (fontSize * 0.65)));

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
    if (!summary) {
      setMetrics(liveMetrics);
    }
  }, [liveMetrics, summary]);

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
    setBotCursorIndex(0);
    botCursorRef.current = 0;
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
    if (!sessionStartAt || !lastInputAt || interactionMode === "read") {
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
    if (interactionMode === "versus" && !sessionStartAt) {
      const userStartIndex = tokens[snapshot.currentWordIndex]?.start ?? 0;
      setBotCursorIndex(userStartIndex);
      botCursorRef.current = userStartIndex;
      botPausedRef.current = false;
    }
  }, [interactionMode, sessionStartAt, snapshot.currentWordIndex, tokens]);

  useEffect(() => {
    if (interactionMode !== "versus" || !sessionStartAt) {
      return;
    }

    let frameId: number;
    let lastTick = performance.now();

    const animate = (time: number) => {
      const delta = (time - lastTick) / 1000;
      lastTick = time;

      const userWordIndex = snapshotRef.current.currentWordIndex;
      const botWordIndex = wordIndexFromTextIndex(tokens, botCursorRef.current);

      if (!botPausedRef.current && botWordIndex > userWordIndex + 30) {
        botPausedRef.current = true;
      } else if (botPausedRef.current && botWordIndex <= userWordIndex + 10) {
        botPausedRef.current = false;
      }

      if (!botPausedRef.current) {
        const cps = (settings.versusBotCpm || 200) / 60;
        const next = Math.min(botCursorRef.current + cps * delta, normalizedText.length);
        botCursorRef.current = next;
        setBotCursorIndex(next);
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [interactionMode, normalizedText.length, sessionStartAt, settings.versusBotCpm, tokens]);

  useEffect(() => {
    if (interactionMode === "read") {
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
    // Only auto-snap the page if the user is in typing mode or versus mode.
    // In read mode, we let the user navigate freely with arrows/buttons.
    if (interactionMode === "read") {
      return;
    }
    const currentIndex = currentCursorIndex(snapshot, tokens);
    const activePage = pageRanges.findIndex((range) => currentIndex >= range.start && currentIndex < range.end);
    if (activePage >= 0) {
      const targetPageIndex = activePage - (activePage % 2);
      if (targetPageIndex !== pageIndex) {
        setPageIndex(targetPageIndex);
      }
    }
  }, [pageRanges, snapshot, tokens, interactionMode]);

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

    // Only save if meaningful work was done.
    // 5 words is a safe threshold to avoid accidental keypresses or just clicking around.
    if (result.wordsTyped < 5) {
      transport.resetTransport();
      return;
    }

    const saved = await transport.flushPending({
      bookId: book.id,
      source: interactionMode === "versus" ? "versus" : "book",
      sourceLabel: interactionMode === "versus"
        ? `Versus · ${book.title} · ${chapter.title}`
        : `${book.title} · ${chapter.title}`,
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

  const handleWordSelect = useCallback((wordIndex: number) => {
    if (interactionMode === "read") {
      onSettingsChange({ ...settings, interactionMode: "type" });
    }

    void flushSession(false, false);
    const nextSnapshot = createSnapshotFromWordStart(tokens, wordIndex);
    setSnapshot(nextSnapshot);
    snapshotRef.current = nextSnapshot;
    setMetrics(EMPTY_METRICS);
  }, [interactionMode, onSettingsChange, settings, tokens]);

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

  const compareOptions = useMemo(() => ({ ignoredCharacters: ignoredCharacterSet }), [ignoredCharacterSet]);

  return (
    <>
      <div
        className={cn(
          "relative flex flex-col rounded-[34px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] shadow-panel",
          "h-screen overflow-hidden",
          readerFontClass,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />


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
                <ModePill active={interactionMode === "read"} onClick={() => onSettingsChange({ ...settings, interactionMode: "read" })}>
                  Read
                </ModePill>
                <ModePill active={interactionMode !== "read"} onClick={() => onSettingsChange({ ...settings, interactionMode: "type" })}>
                  Type
                </ModePill>
              </div>

              <button
                type="button"
                disabled={interactionMode === "read"}
                onClick={() => {
                  if (interactionMode === "versus") {
                    onSettingsChange({ ...settings, interactionMode: "type" });
                  } else {
                    setVersusConfigOpen(true);
                  }
                }}
                className={cn(
                  "rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition duration-300",
                  interactionMode === "versus"
                    ? "bg-[var(--accent)] text-black border-[var(--accent)] shadow-[0_0_15px_var(--accent-soft)]"
                    : "bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]",
                  interactionMode === "read" ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                )}
              >
                Versus
              </button>
              <button
                type="button"
                onClick={() => void flushSession(true, false)}
                disabled={!sessionStartAt}
                className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text)] transition hover:border-[var(--accent)] disabled:opacity-40"
              >
                End Session
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    console.log("Menu button clicked in ReaderView");
                    onToggleMenu();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-soft)] text-lg text-[var(--text)] transition hover:border-[var(--accent)]"
                >
                  ≡
                </button>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseMenu();
                      }}
                    />
                    <div className="absolute right-0 top-12 z-50 min-w-[240px] rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-2 shadow-panel backdrop-blur-xl">
                      <MenuButton
                        onClick={() => {
                          onOpenTab("library");
                        }}
                      >
                        Library
                      </MenuButton>
                      <MenuButton
                        onClick={() => {
                          onOpenTab("analytics");
                        }}
                      >
                        Profile & Analytics
                      </MenuButton>
                      <MenuButton
                        onClick={() => {
                          onOpenTab("achievements");
                        }}
                      >
                        Achievements
                      </MenuButton>
                      <MenuButton
                        onClick={() => {
                          onOpenTab("type-test");
                        }}
                      >
                        Type Test
                      </MenuButton>
                      <MenuButton
                        onClick={() => {
                          onOpenSettings();
                        }}
                      >
                        Settings
                      </MenuButton>
                    </div>
                  </>
                )}
              </div>
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
            "relative mx-auto flex-1 w-full overflow-hidden flex flex-col",
            readerMode === "spread" ? "max-w-[1600px]" : "max-w-[1360px]"
          )}
        >

          {loadingBook && <p className="mb-4 text-sm text-[var(--text-muted)]">Loading book…</p>}

          {readerMode === "scroll" ? (
            <div className={cn("mx-auto flex-1 w-full max-w-5xl overflow-hidden flex flex-col px-4 md:px-6 pb-24 pt-24", readerFontClass)}>
              <div
                className="flex-1 overflow-y-auto no-scrollbar rounded-[36px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_68%,transparent)] px-6 py-8 md:px-10 md:py-12"
                style={{ fontSize: `${settings.baseFontSize}px`, lineHeight: settings.lineHeight }}
              >
                <TypingLayer
                  key="scroll-layer"
                  tokens={tokens}
                  snapshot={snapshot}
                  chapterText={normalizedText}
                  interactionMode={interactionMode}
                  smoothCaret={settings.smoothCaret && analytics?.profile.unlocks.smoothCaret}
                  botCursorIndex={interactionMode === "versus" ? botCursorIndex : null}
                  compareOptions={compareOptions}
                  onWordClick={handleWordSelect}
                />
              </div>
            </div>
          ) : (
            <div className="grid h-full w-full gap-6 lg:grid-cols-2 pt-20 pb-6 px-4 md:px-6">
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
                    botCursorIndex={interactionMode === "versus" ? botCursorIndex : null}
                    compareOptions={compareOptions}
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
                    botCursorIndex={interactionMode === "versus" ? botCursorIndex : null}
                    compareOptions={compareOptions}
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

          <div className="relative pointer-events-auto overflow-hidden rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_65%,transparent)] px-6 py-2.5 text-sm font-medium text-[var(--text)] shadow-panel backdrop-blur-xl">
            {Math.round(metrics.wpm)} WPM • {formatPercent(metrics.accuracy)} Acc
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-300"
                style={{ width: `${metrics.chapterProgress * 100}%` }}
              />
            </div>
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

      <VersusConfigModal
        isOpen={versusConfigOpen}
        onClose={() => setVersusConfigOpen(false)}
        onStart={(nextCpm) => {
          onSettingsChange({ ...settings, versusBotCpm: nextCpm, interactionMode: "versus" });
          onInteractionModeChange("versus");
          setSessionStartAt(null);
          sessionStartRef.current = null;
          setVersusConfigOpen(false);
        }}
        currentCpm={settings.versusBotCpm}
        averageWpm={analytics?.averageWpm ?? 60}
      />
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
        "flex h-full flex-col overflow-hidden rounded-[34px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent)] px-6 pb-0 pt-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
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

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center rounded-[18px] px-4 py-3 text-left text-sm text-[var(--text)] transition hover:bg-[var(--accent-soft)]"
    >
      {children}
    </button>
  );
}
