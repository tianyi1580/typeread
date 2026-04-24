import { useEffect, useMemo, useRef, useState } from "react";
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
import { Hud } from "./Hud";
import { TypingLayer } from "./TypingLayer";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface ReaderViewProps {
  book: ParsedBook;
  chapterIndex: number;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  settings: AppSettings;
  desktopReady: boolean;
  onChapterChange: (index: number) => void;
  onReaderModeChange: (mode: ReaderMode) => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
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
  onChapterChange,
  onReaderModeChange,
  onInteractionModeChange,
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

  const pageChars = typeof window !== "undefined" && window.innerWidth < 900 ? 1100 : 1500;
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
    const onMouseMove = () => setLastMouseAt(Date.now());
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

    // The spec is explicit: 30 seconds idle ends the session and the idle tail is discarded.
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

      const nextSnapshot: TypingSnapshot = structuredClone(snapshotRef.current);
      const result = applyTypingInput(nextSnapshot, tokens, event.key, now);
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
  }, [interactionMode, tokens]);

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

  const minimalHud =
    settings.focusMode &&
    interactionMode === "type" &&
    !!lastInputAt &&
    clock - lastInputAt < 2600 &&
    clock - lastMouseAt > 1200;

  const readerFontClass = interactionMode === "type" ? "font-[var(--font-type)]" : "font-[var(--font-read)]";
  const visibleLeft = pageRanges[pageIndex];
  const visibleRight = pageRanges[pageIndex + 1];

  return (
    <div className="space-y-4">
      <Hud
        metrics={metrics}
        chapterIndex={chapterIndex}
        chapterCount={book.chapters.length}
        readerMode={readerMode}
        interactionMode={interactionMode}
        minimal={minimalHud}
        onPreviousChapter={() => onChapterChange(Math.max(chapterIndex - 1, 0))}
        onNextChapter={() => onChapterChange(Math.min(chapterIndex + 1, book.chapters.length - 1))}
        onReaderModeChange={onReaderModeChange}
        onInteractionModeChange={onInteractionModeChange}
      />

      <Card className={`relative overflow-hidden p-4 md:p-8 ${readerFontClass}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_45%)]" />
        <div className="relative space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{book.title}</p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--text)]">{chapter.title}</h2>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-sm text-[var(--text-muted)]">
              {interactionMode === "type" ? "Loose Typing with Anchors" : "Read Mode"}
            </span>
          </div>

          {readerMode === "scroll" ? (
            <div className="mx-auto max-w-4xl rounded-[32px] border border-[var(--border)] bg-[var(--panel-soft)] px-6 py-8 md:px-12">
              {interactionMode === "type" ? (
                <TypingLayer tokens={tokens} snapshot={snapshot} className="text-lg md:text-xl" />
              ) : (
                <div className="space-y-7 text-lg leading-[2.05] text-[var(--text)]">
                  {chapter.chunks.map((chunk) => (
                    <p key={chunk.id} className="whitespace-pre-wrap">
                      {chunk.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="relative grid gap-4 lg:grid-cols-2">
              {interactionMode === "read" && (
                <>
                  <Button
                    variant="secondary"
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full"
                    onClick={() => setPageIndex((current) => Math.max(0, current - 2))}
                    disabled={pageIndex === 0}
                  >
                    ←
                  </Button>
                  <Button
                    variant="secondary"
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full"
                    onClick={() => setPageIndex((current) => Math.min(Math.max(pages.length - 2, 0), current + 2))}
                    disabled={pageIndex >= pages.length - 2}
                  >
                    →
                  </Button>
                </>
              )}

              <SpreadPage title={`Page ${pageIndex + 1}`}>
                {interactionMode === "type" ? (
                  <TypingLayer tokens={tokens} snapshot={snapshot} visibleRange={visibleLeft} className="text-lg" faded={false} />
                ) : (
                  visibleLeft && <p className="whitespace-pre-wrap text-lg leading-[2] text-[var(--text)]">{pages[pageIndex]}</p>
                )}
              </SpreadPage>

              <SpreadPage title={`Page ${pageIndex + 2}`}>
                {interactionMode === "type" ? (
                  <TypingLayer tokens={tokens} snapshot={snapshot} visibleRange={visibleRight} className="text-lg" faded={false} />
                ) : (
                  visibleRight && <p className="whitespace-pre-wrap text-lg leading-[2] text-[var(--text)]">{pages[pageIndex + 1]}</p>
                )}
              </SpreadPage>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function SpreadPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[560px] rounded-[30px] border border-[var(--border)] bg-[linear-gradient(180deg,_rgba(255,255,255,0.12),_transparent)] px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
      <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{title}</p>
      <div className="min-h-[480px] whitespace-pre-wrap">{children}</div>
    </div>
  );
}
