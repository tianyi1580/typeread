import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  currentProgress,
  calculateActiveDuration,
  finalizeMetrics,
  normalizeTypingText,
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
  onReadProgress: (bookId: number, readIndex: number, readChapter: number) => Promise<void>;
  onProcessBatch: (payload: ProcessKeystrokeBatchInput) => Promise<ProcessKeystrokeBatchResult>;
  onError: (message: string) => void;
  chapterProgressMap: Record<string, number>;
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

const READER_CHROME_TRANSITION = {
  duration: 0.4,
  ease: [0.23, 1, 0.32, 1],
} as const;

const READER_CHROME_SURFACE_CLASS =
  "border border-white/20 bg-gradient-to-b from-white/15 to-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-2xl transform-gpu";

const READER_CHROME_BUTTON_CLASS =
  "pointer-events-auto flex items-center justify-center rounded-full font-medium text-[var(--text)] transition-colors duration-300 hover:border-[var(--accent)] hover:from-white/20 hover:to-white/10 hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed";

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
  onReadProgress,
  onProcessBatch,
  onError,
  chapterProgressMap,
}: ReaderViewProps) {
  const chapter = book.chapters[chapterIndex];
  const normalizedText = useMemo(() => normalizeTypingText(chapter.text), [chapter.text]);
  const tokens = useMemo(() => tokenizeText(normalizedText), [normalizedText]);
  const ignoredCharacterSet = useMemo(() => parseIgnoredCharacterSet(settings.ignoredCharacters), [settings.ignoredCharacters]);
  const keyboardLayout = useMemo(() => resolveKeyboardLayout(settings), [settings]);
  const resumeCursorIndex = useMemo(() => {
    // Check our per-chapter progress map first
    const cached = chapterProgressMap[`${book.id}-${chapterIndex}`];
    if (cached !== undefined) {
      return cached;
    }

    // Fallback to book's global latest progress
    let targetChapter: number;
    let targetIndex: number;

    if (book.currentChapter > book.readChapter) {
      targetChapter = book.currentChapter;
      targetIndex = book.currentIndex;
    } else if (book.readChapter > book.currentChapter) {
      targetChapter = book.readChapter;
      targetIndex = book.readIndex;
    } else {
      targetChapter = book.currentChapter;
      targetIndex = Math.max(book.currentIndex, book.readIndex);
    }

    return chapterIndex === targetChapter ? targetIndex : 0;
  }, [
    book.id,
    book.currentChapter,
    book.currentIndex,
    book.readChapter,
    book.readIndex,
    chapterIndex,
    chapterProgressMap,
  ]);

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
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);

  const snapshotRef = useRef(snapshot);
  const eventsRef = useRef(events);
  const sessionStartRef = useRef<number | null>(sessionStartAt);
  const lastInputRef = useRef<number | null>(lastInputAt);
  const botCursorRef = useRef(0);
  const botPausedRef = useRef(false);
  const isAutoAdvancingRef = useRef(false);
  const chapterMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollReadIndex, setScrollReadIndex] = useState<number | null>(null);

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
  const menuRef = useRef<HTMLDivElement>(null);
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
    if (!sessionStartAt) return EMPTY_METRICS;
    const activeSeconds = calculateActiveDuration(events, sessionStartAt, clock, 10000);
    return computeMetrics(events, activeSeconds, snapshot, tokens);
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

    if (!isAutoAdvancingRef.current) {
      setEvents([]);
      eventsRef.current = [];
      setMetrics(EMPTY_METRICS);
      setSessionStartAt(null);
      sessionStartRef.current = null;
      setSummary(null);
      setBotCursorIndex(0);
      botCursorRef.current = 0;
      transport.resetTransport();
    }
    isAutoAdvancingRef.current = false;

    const activePage = pageRanges.findIndex((range) => resumeCursorIndex >= range.start && resumeCursorIndex < range.end);
    setPageIndex(activePage >= 0 ? activePage - (activePage % 2) : 0);
    setScrollReadIndex(null);
  }, [tokens]); // Removed resumeCursorIndex from dependencies

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

  // Auto-pause is now handled implicitly by calculateActiveDuration in liveMetrics.
  // The session no longer flushes on inactivity, it only 'pauses' the clock.

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSession(false);
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

      const target = event.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        void flushSession(true);
        return;
      }

      // If chapter is already finished, any character key press moves to the next chapter immediately.
      if (currentProgress(snapshotRef.current, tokens) === 1 && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        if (chapterIndex < book.chapters.length - 1) {
          event.preventDefault();
          isAutoAdvancingRef.current = true;
          onChapterChange(chapterIndex + 1);
          return;
        }
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
        (settings.tabToSkip && event.key === "Tab") ||
        event.key === "Enter" ||
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

      const result = applyTypingInput(nextSnapshot, tokens, { key: event.key, ctrlKey: isWordDeletion }, now, chapterIndex, {
        tabToSkip: settings.tabToSkip,
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
  }, [ignoredCharacterSet, interactionMode, keyboardLayout.id, settings.tabToSkip, tokens, transport]);

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
    let readIndex = 0;
    if (readerMode === "spread") {
      readIndex = pageRanges[pageIndex]?.start ?? 0;
    } else if (interactionMode === "read") {
      readIndex = scrollReadIndex ?? currentCursorIndex(snapshot, tokens);
    } else {
      readIndex = currentCursorIndex(snapshot, tokens);
    }

    const timer = window.setTimeout(() => {
      void onReadProgress(book.id, readIndex, chapterIndex);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [book.id, chapterIndex, interactionMode, onReadProgress, pageIndex, pageRanges, readerMode, scrollReadIndex, snapshot, tokens]);

  const handleScroll = useCallback(() => {
    if (readerMode !== "scroll" || !scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const scrollTop = container.scrollTop;
    
    // Find the word element closest to the top of the container
    // We can use the container's children (which is the TypingLayer's div)
    const layer = container.firstElementChild as HTMLElement;
    if (!layer) return;

    const words = Array.from(layer.children) as HTMLElement[];
    // Find the first word whose bottom is below the top of the container
    const topWord = words.find((word) => word.offsetTop + word.offsetHeight > scrollTop);
    
    if (topWord) {
      const indexAttr = topWord.getAttribute("data-word-index");
      if (indexAttr) {
        const wordIndex = parseInt(indexAttr, 10);
        if (!isNaN(wordIndex)) {
          const textIndex = tokens[wordIndex]?.start ?? 0;
          setScrollReadIndex((current) => (current === textIndex ? current : textIndex));
        }
      }
    }
  }, [readerMode, tokens]);

  useEffect(() => {
    return () => {
      void flushSession(false);
    };
  }, [book.id, chapter.id]);

  useEffect(() => {
    if (readerMode === "spread") {
      window.scrollTo(0, 0);
    }
  }, [readerMode]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onCloseMenu();
      }
    };

    // Use a small timeout to avoid immediate closure if the click that opened the menu bubbles up
    const timeout = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [menuOpen, onCloseMenu]);

  useEffect(() => {
    if (!chapterMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (chapterMenuRef.current && !chapterMenuRef.current.contains(event.target as Node)) {
        setChapterMenuOpen(false);
      }
    };

    const timeout = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [chapterMenuOpen]);

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

  const flushSession = useCallback(async (revealSummary: boolean): Promise<SessionSummaryResponse | undefined> => {
    const startAt = sessionStartRef.current;
    if (!startAt) {
      return undefined;
    }

    const result = finalizeMetrics(eventsRef.current, startAt, Date.now());
    setSessionStartAt(null);
    sessionStartRef.current = null;
    setLastInputAt(null);
    lastInputRef.current = null;
    setEvents([]);
    eventsRef.current = [];

    // Only save if meaningful work was done.
    if (result.wordsTyped < 5) {
      transport.resetTransport();
      return undefined;
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
      durationSeconds: Math.round(result.durationSeconds),
    });

    if (revealSummary && saved) {
      setSummary(saved);
    }
    return saved;
  }, [book.id, book.title, chapter.title, interactionMode, transport]);

  const navigate = useCallback(async (action: () => void) => {
    const startAt = sessionStartRef.current;
    if (startAt) {
      // Create a snapshot of current progress to check word count
      const result = finalizeMetrics(eventsRef.current, startAt, Date.now());
      if (result.wordsTyped >= 5) {
        setPendingNav(() => action);
        const saved = await flushSession(true);
        if (!saved) {
          setPendingNav(null);
          action();
        }
        return;
      }
    }
    action();
  }, [flushSession]);

  const handleWordSelect = useCallback((wordIndex: number) => {
    if (interactionMode === "read") {
      onSettingsChange({ ...settings, interactionMode: "type" });
    }

    void flushSession(false);
    const nextSnapshot = createSnapshotFromWordStart(tokens, wordIndex);
    setSnapshot(nextSnapshot);
    snapshotRef.current = nextSnapshot;
    setMetrics(EMPTY_METRICS);
  }, [interactionMode, onSettingsChange, settings, tokens]);

  function handleChapterJump(nextIndex: number) {
    void flushSession(false);
    onChapterChange(nextIndex);
  }

  const headerVisible = clock - lastMouseAt < 1600;
  const readerFontClass = "font-[var(--font-main)]";
  const visibleLeft = pageRanges[pageIndex];
  const visibleRight = pageRanges[pageIndex + 1];
  const compareOptions = useMemo(() => ({ ignoredCharacters: ignoredCharacterSet }), [ignoredCharacterSet]);

  return (
    <>
      <div
        className={cn(
          "relative flex flex-col rounded-[34px] border border-white/5 bg-[color-mix(in_srgb,var(--panel)_40%,transparent)] shadow-panel backdrop-blur-2xl",
          "h-screen overflow-hidden",
          readerFontClass,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />


        <AnimatePresence>
          {headerVisible && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, z: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={READER_CHROME_TRANSITION}
              className={cn(
                "fixed left-4 right-4 top-4 z-40 mx-auto flex max-w-[1360px] items-center justify-between gap-4 rounded-full px-4 py-3 md:left-6 md:right-6 pointer-events-auto",
                "border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-3xl transform-gpu",
              )}
            >
              <div className="flex flex-1 items-center justify-start gap-4">
                <Button variant="ghost" className="rounded-full px-3 py-2" onClick={() => navigate(onBackToLibrary)}>
                  &lt; Library
                </Button>

                <div className="inline-flex rounded-full border border-white/5 bg-white/[0.03] p-1">
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
                      : "bg-white/[0.03] text-[var(--text)] hover:border-[var(--accent)] hover:bg-white/[0.08]",
                    interactionMode === "read" ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  Versus
                </button>
              </div>

            <div className="relative min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-medium">{book.title}</p>
              <button
                type="button"
                onClick={() => setChapterMenuOpen(!chapterMenuOpen)}
                className="mx-auto flex items-center gap-1.5 truncate text-xs uppercase tracking-[0.24em] text-[var(--text-muted)] transition hover:text-[var(--text)]"
              >
                {chapter.title}
                <span className="text-[10px] opacity-60">▼</span>
              </button>

              {chapterMenuOpen && (
                <div
                  ref={chapterMenuRef}
                  className="no-scrollbar absolute left-1/2 top-full z-50 mt-4 max-h-[360px] w-[280px] -translate-x-1/2 overflow-y-auto rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] p-2 shadow-2xl backdrop-blur-3xl transform-gpu"
                >
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Chapters
                  </div>
                  {book.chapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        handleChapterJump(idx);
                        setChapterMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center rounded-[20px] px-4 py-3 text-left text-sm transition",
                        idx === chapterIndex
                          ? "bg-[var(--accent-soft)] font-semibold text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]",
                      )}
                    >
                      <span className="mr-3 tabular-nums opacity-40">{idx + 1}</span>
                      <span className="truncate">{ch.title}</span>

                      {(() => {
                        let progress = 0;
                        if (idx < book.currentChapter) {
                          progress = 1;
                        } else if (idx === book.currentChapter) {
                          progress = book.currentIndex / Math.max(1, ch.text.length);
                        }

                        // If this is the chapter currently being viewed/typed in, show live progress
                        if (idx === chapterIndex) {
                          const currentIdx = currentCursorIndex(snapshot, tokens);
                          progress = currentIdx / Math.max(1, normalizedText.length);
                        }

                        if (progress <= 0) return null;

                        return (
                          <div className="ml-auto flex items-center gap-2 pl-4">
                            <div className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full bg-[var(--accent)] transition-all duration-300"
                                style={{ width: `${Math.min(1, progress) * 100}%` }}
                              />
                            </div>
                            <span className="min-w-[28px] text-right text-[10px] tabular-nums opacity-40">
                              {Math.round(Math.min(1, progress) * 100)}%
                            </span>
                          </div>
                        );
                      })()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void flushSession(true)}
                disabled={!sessionStartAt}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--text)] transition duration-300 hover:border-[var(--accent)] hover:bg-white/[0.08] disabled:opacity-40"
              >
                End Session
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={onToggleMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-soft)] text-lg text-[var(--text)] transition hover:border-[var(--accent)]"
                >
                  ≡
                </button>
                {menuOpen && (
                  <div 
                    ref={menuRef}
                    className="absolute right-0 top-12 z-50 min-w-[240px] rounded-[24px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] p-2 shadow-2xl backdrop-blur-3xl transform-gpu"
                  >
                    <MenuButton
                      onClick={() => {
                        navigate(() => onOpenTab("library"));
                      }}
                    >
                      Library
                    </MenuButton>
                    <MenuButton
                      onClick={() => {
                        navigate(() => onOpenTab("analytics"));
                      }}
                    >
                      Profile & Analytics
                    </MenuButton>
                    <MenuButton
                      onClick={() => {
                        navigate(() => onOpenTab("achievements"));
                      }}
                    >
                      Achievements
                    </MenuButton>
                    <MenuButton
                      onClick={() => {
                        navigate(() => onOpenTab("type-test"));
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
                )}
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {headerVisible && readerMode === "spread" && (
            <>
              <motion.button
                type="button"
                initial={{ x: -20, y: "-50%", opacity: 0 }}
                animate={{ x: 0, y: "-50%", z: 0, opacity: pageIndex === 0 ? 0.2 : 1 }}
                exit={{ x: -20, y: "-50%", opacity: 0 }}
                transition={READER_CHROME_TRANSITION}
                onClick={() => setPageIndex((current) => Math.max(0, current - 2))}
                disabled={pageIndex === 0}
                className={cn(
                  "fixed left-4 top-1/2 z-50 md:left-8 group h-14 w-14",
                  READER_CHROME_SURFACE_CLASS,
                  READER_CHROME_BUTTON_CLASS,
                )}
              >
                <span className="text-2xl transition group-hover:-translate-x-0.5">‹</span>
              </motion.button>

              <motion.button
                type="button"
                initial={{ x: 20, y: "-50%", opacity: 0 }}
                animate={{ x: 0, y: "-50%", z: 0, opacity: pageIndex >= pages.length - 2 ? 0.2 : 1 }}
                exit={{ x: 20, y: "-50%", opacity: 0 }}
                transition={READER_CHROME_TRANSITION}
                onClick={() => setPageIndex((current) => Math.min(Math.max(pages.length - 2, 0), current + 2))}
                disabled={pageIndex >= pages.length - 2}
                className={cn(
                  "fixed right-4 top-1/2 z-50 md:right-8 group h-14 w-14",
                  READER_CHROME_SURFACE_CLASS,
                  READER_CHROME_BUTTON_CLASS,
                )}
              >
                <span className="text-2xl transition group-hover:translate-x-0.5">›</span>
              </motion.button>
            </>
          )}
        </AnimatePresence>

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
                ref={scrollContainerRef}
                onScroll={handleScroll}
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

        <AnimatePresence>
          {(headerVisible || interactionMode !== "read") && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, z: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={READER_CHROME_TRANSITION}
              className="pointer-events-none fixed inset-x-0 bottom-6 z-40 px-4 md:px-10"
            >
              {/* Stack the tracker above the chapter buttons on narrow widths so the floating chrome settles into the same layout it animates toward. */}
              <div className="mx-auto grid max-w-[1360px] grid-cols-2 items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-6">
                {interactionMode !== "read" && (
                  <motion.div
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={READER_CHROME_TRANSITION}
                    className={cn(
                      "pointer-events-auto relative col-span-2 justify-self-center overflow-hidden rounded-full px-5 py-2.5 text-sm font-medium text-[var(--text)] sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:px-6",
                      READER_CHROME_SURFACE_CLASS,
                    )}
                  >
                    <div className="truncate text-center">
                      {Math.round(metrics.wpm)} WPM • {formatPercent(metrics.accuracy)} Acc
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-b-full bg-white/5">
                      <div
                        className="h-full bg-[var(--accent)] transition-[width] duration-300"
                        style={{ width: `${metrics.chapterProgress * 100}%` }}
                      />
                    </div>
                  </motion.div>
                )}

                <motion.button
                  type="button"
                  initial={false}
                  animate={{ opacity: headerVisible ? (chapterIndex === 0 ? 0.5 : 1) : 0 }}
                  transition={READER_CHROME_TRANSITION}
                  className={cn(
                    "justify-self-start whitespace-nowrap px-5 py-2 text-sm sm:col-start-1 sm:row-start-1 sm:px-6",
                    READER_CHROME_SURFACE_CLASS,
                    READER_CHROME_BUTTON_CLASS,
                    !headerVisible && "pointer-events-none"
                  )}
                  onClick={() => handleChapterJump(Math.max(chapterIndex - 1, 0))}
                  disabled={chapterIndex === 0}
                >
                  Previous Chapter
                </motion.button>

                <motion.button
                  type="button"
                  initial={false}
                  animate={{ opacity: headerVisible ? (chapterIndex >= book.chapters.length - 1 ? 0.5 : 1) : 0 }}
                  transition={READER_CHROME_TRANSITION}
                  className={cn(
                    "justify-self-end whitespace-nowrap px-5 py-2 text-sm sm:col-start-3 sm:row-start-1 sm:px-6",
                    READER_CHROME_SURFACE_CLASS,
                    READER_CHROME_BUTTON_CLASS,
                    !headerVisible && "pointer-events-none"
                  )}
                  onClick={() => handleChapterJump(Math.min(chapterIndex + 1, book.chapters.length - 1))}
                  disabled={chapterIndex >= book.chapters.length - 1}
                >
                  Next Chapter
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SessionSummaryModal
        summary={summary}
        onClose={() => {
          setSummary(null);
          if (pendingNav) {
            pendingNav();
            setPendingNav(null);
          }
        }}
      />

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
