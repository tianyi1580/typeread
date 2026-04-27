import { useEffect, useMemo, useRef, useState } from "react";
import { resolveKeyboardLayout } from "../lib/keyboard-layouts";
import { formatPercent } from "../lib/utils";
import { practiceWordBanks } from "../lib/word-bank";
import { useBufferedKeystrokeTransport } from "../hooks/useBufferedKeystrokeTransport";
import { applyTypingInput, calculateActiveDuration, computeMetrics, createTypingSnapshot, finalizeMetrics, parseIgnoredCharacterSet, tokenizeText, wordIndexFromTextIndex } from "../utils/typing";
import type {
  AnalyticsSummary,
  AppSettings,
  LiveMetrics,
  ProcessKeystrokeBatchInput,
  ProcessKeystrokeBatchResult,
  SessionSource,
  SessionSummaryResponse,
  TypingSnapshot,
} from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { TypingLayer } from "./TypingLayer";
import { SessionSummaryModal } from "./SessionSummaryModal";

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

interface PracticeViewProps {
  mode: SessionSource;
  settings: AppSettings;
  analytics: AnalyticsSummary | null;
  desktopReady: boolean;
  processBatch: (payload: ProcessKeystrokeBatchInput) => Promise<ProcessKeystrokeBatchResult>;
  onSettingsChange: (settings: AppSettings) => void;
  onError: (message: string) => void;
}

export function PracticeView({
  mode,
  settings,
  analytics,
  desktopReady,
  processBatch,
  onSettingsChange,
  onError,
}: PracticeViewProps) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000000));
  const practiceText = useMemo(() => buildPracticeText(seed, 600, settings.practiceWordBankType), [seed, settings.practiceWordBankType]);
  const tokens = useMemo(() => tokenizeText(practiceText), [practiceText]);
  
  const [status, setStatus] = useState<"idle" | "active" | "completed">("idle");
  const [snapshot, setSnapshot] = useState<TypingSnapshot>(() => createTypingSnapshot(tokens, 0));
  const [events, setEvents] = useState<ProcessKeystrokeBatchInput["events"]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [sessionStartAt, setSessionStartAt] = useState<number | null>(null);
  const [lastInputAt, setLastInputAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [botCursorIndex, setBotCursorIndex] = useState(0);

  const snapshotRef = useRef(snapshot);
  const eventsRef = useRef(events);
  const sessionStartRef = useRef<number | null>(sessionStartAt);
  const lastInputRef = useRef<number | null>(lastInputAt);
  const botPausedRef = useRef(false);
  const botCursorRef = useRef(botCursorIndex);
  const statusRef = useRef(status);
  const runVersionRef = useRef(0);

  snapshotRef.current = snapshot;
  eventsRef.current = events;
  sessionStartRef.current = sessionStartAt;
  lastInputRef.current = lastInputAt;
  botCursorRef.current = botCursorIndex;
  statusRef.current = status;

  const ignoredCharacterSet = useMemo(() => parseIgnoredCharacterSet(settings.ignoredCharacters), [settings.ignoredCharacters]);
  const keyboardLayout = useMemo(() => resolveKeyboardLayout(settings), [settings]);
  const compareOptions = useMemo(() => ({ ignoredCharacters: ignoredCharacterSet }), [ignoredCharacterSet]);
  const label =
    mode === "type-test" ? `Type Test · ${settings.typeTestDuration}s` : `Versus · ${settings.versusBotCpm} CPM`;

  const transport = useBufferedKeystrokeTransport({
    desktopReady,
    context: {
      bookId: null,
      source: mode,
      sourceLabel: label,
      keyboardLayout,
    },
    processBatch,
    onError,
  });

  useEffect(() => {
    // Invalidate any in-flight flush so an old session cannot write stale summary state after a restart.
    runVersionRef.current += 1;
    const nextSnapshot = createTypingSnapshot(tokens, 0);
    setSnapshot(nextSnapshot);
    setEvents([]);
    setMetrics(EMPTY_METRICS);
    setSessionStartAt(null);
    setLastInputAt(null);
    setBotCursorIndex(0);
    botCursorRef.current = 0;
    botPausedRef.current = false;
    setSummary(null);
    setShowSummary(false);
    setStatus("idle");
    transport.resetTransport();
  }, [tokens, transport]);

  useEffect(() => {
    if (status !== "active") {
      return;
    }

    const interval = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [status]);

  const liveMetrics = useMemo(() => {
    if (!sessionStartAt) return EMPTY_METRICS;
    const activeSeconds = calculateActiveDuration(events, sessionStartAt, clock, 10000);
    return computeMetrics(events, activeSeconds, snapshot, tokens);
  }, [clock, events, sessionStartAt, snapshot, tokens]);

  useEffect(() => {
    if (status !== "completed") {
      setMetrics(liveMetrics);
    }
  }, [liveMetrics, status]);

  useEffect(() => {
    if (status !== "active" || !sessionStartAt || !lastInputAt) {
      return;
    }

    if (Date.now() - lastInputAt >= 30_000) {
      void flushSession();
    }
  }, [clock, lastInputAt, sessionStartAt, status]);

  useEffect(() => {
    if (mode !== "type-test" || status !== "active" || !sessionStartAt) {
      return;
    }

    if (clock - sessionStartAt >= settings.typeTestDuration * 1000) {
      void flushSession();
    }
  }, [clock, mode, status, sessionStartAt, settings.typeTestDuration]);

  useEffect(() => {
    if (mode !== "versus" || status !== "active" || !sessionStartAt) {
      return;
    }

    let frame = 0;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const elapsedMs = now - lastTick;
      lastTick = now;
      const currentSnapshot = snapshotRef.current;
      const userWordIndex = currentSnapshot.currentWordIndex;
      const nextBotWordIndex = wordIndexFromTextIndex(tokens, botCursorRef.current);

      if (!botPausedRef.current && nextBotWordIndex > userWordIndex + 30) {
        botPausedRef.current = true;
      } else if (botPausedRef.current && nextBotWordIndex <= userWordIndex + 10) {
        botPausedRef.current = false;
      }

      if (!botPausedRef.current) {
        const cps = settings.versusBotCpm / 60;
        const nextCursor = Math.min(botCursorRef.current + cps * (elapsedMs / 1000), practiceText.length);
        botCursorRef.current = nextCursor;
        setBotCursorIndex(nextCursor);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [mode, practiceText.length, status, sessionStartAt, settings.versusBotCpm, tokens]);

  useEffect(() => {
    if (status !== "active") {
      return;
    }

    const lastWord = snapshot.words[tokens.length - 1];
    if (lastWord?.completed || (mode === "versus" && botCursorIndex >= practiceText.length)) {
      void flushSession();
    }
  }, [botCursorIndex, mode, practiceText.length, snapshot.words, status, tokens.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (statusRef.current === "completed") {
        return;
      }

      const isMac = navigator.userAgent.toLowerCase().includes("mac");
      const isWordDeletion = event.key === "Backspace" && (isMac ? event.metaKey : event.ctrlKey);

      const target = event.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        void flushSession();
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
        (settings.tabToSkip && event.key === "Tab") ||
        event.key === "Enter" ||
        event.key === " " ||
        (event.key.length === 1 && !event.key.match(/\s/) ? true : false);

      if (!relevant) {
        return;
      }

      event.preventDefault();
      const now = Date.now();
      
      if (statusRef.current === "idle") {
        setStatus("active");
        statusRef.current = "active";
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

      const result = applyTypingInput(nextSnapshot, tokens, { key: event.key, ctrlKey: isWordDeletion }, now, 0, {
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
  }, [ignoredCharacterSet, keyboardLayout.id, settings.tabToSkip, tokens, transport]);

  async function flushSession() {
    const startAt = sessionStartRef.current;
    if (!startAt || statusRef.current === "completed") {
      return;
    }

    // Lock session to prevent double-flushing or restarts while syncing
    setStatus("completed");
    statusRef.current = "completed";

    const result = finalizeMetrics(eventsRef.current, startAt, Date.now());
    
    // Update live metrics one last time with finalized values
    setMetrics({
      wpm: result.wpm,
      accuracy: result.accuracy,
      elapsedSeconds: result.durationSeconds,
      typedWords: result.wordsTyped,
      typedChars: result.charsTyped,
      errors: result.errors,
      progress: snapshotRef.current.currentWordIndex / tokens.length,
      chapterProgress: snapshotRef.current.currentWordIndex / tokens.length,
    });

    setSessionStartAt(null);
    sessionStartRef.current = null;
    setLastInputAt(null);
    lastInputRef.current = null;
    setEvents([]);
    eventsRef.current = [];

    if (result.wordsTyped < 5) {
      transport.resetTransport();
      setStatus("idle");
      return;
    }

    try {
      const flushRunVersion = runVersionRef.current;
      const saved = await transport.flushPending({
        bookId: null,
        source: mode,
        sourceLabel: label,
        startTime: new Date(startAt).toISOString(),
        endTime: new Date(result.effectiveEndTimeMs).toISOString(),
        wordsTyped: result.wordsTyped,
        charsTyped: result.charsTyped,
        errors: result.errors,
        wpm: result.wpm,
        accuracy: result.accuracy,
        durationSeconds: result.durationSeconds,
      });

      if (saved && flushRunVersion === runVersionRef.current) {
        setSummary(saved);
      }
    } catch (err) {
      console.error("Session flush failed:", err);
    }
  }

  function restart() {
    runVersionRef.current += 1;
    setSeed(Date.now());
  }

  const timeRemaining =
    mode === "type-test"
      ? sessionStartAt
        ? Math.max(0, settings.typeTestDuration - Math.floor((clock - sessionStartAt) / 1000))
        : settings.typeTestDuration
      : 0;

  const botProgress = practiceText.length === 0 ? 0 : botCursorIndex / practiceText.length;

  return (
    <>
      <div className="space-y-5">
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {mode === "type-test" ? (
                [15, 30, 60, 120].map((seconds) => (
                  <ModeChip
                    key={seconds}
                    active={settings.typeTestDuration === seconds}
                    onClick={() => onSettingsChange({ ...settings, typeTestDuration: seconds as 15 | 30 | 60 | 120 })}
                    disabled={status !== "idle"}
                  >
                    {seconds}s
                  </ModeChip>
                ))
              ) : (
                [180, 240, 300, 360, 420].map((cpm) => (
                  <ModeChip
                    key={cpm}
                    active={settings.versusBotCpm === cpm}
                    onClick={() => onSettingsChange({ ...settings, versusBotCpm: cpm })}
                    disabled={status !== "idle"}
                  >
                    {cpm} CPM
                  </ModeChip>
                ))
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Difficulty</span>
                  <div className="group relative">
                    <button
                      type="button"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-[var(--text-muted)] transition hover:bg-[var(--accent)] hover:text-black"
                    >
                      i
                    </button>
                    <div className="absolute top-full right-0 mt-3 w-64 -translate-y-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 pointer-events-none z-[60]">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-2xl backdrop-blur-xl">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">Word Bank Difficulty</p>
                        <div className="mt-3 space-y-2 text-xs leading-5 text-[var(--text-muted)]">
                          <p><span className="text-[var(--text)] font-medium">Easy:</span> Top 200 words repeated. Mostly 4-5 letters. Clean & fast.</p>
                          <p><span className="text-[var(--text)] font-medium">Medium:</span> Top 2,000 words. Balanced length (2-10 letters).</p>
                          <p><span className="text-[var(--text)] font-medium">Hard:</span> 10,000 words including rare and complex patterns.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[var(--text-muted)]">Easy</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="1"
                    value={settings.practiceWordBankType === "easy" ? 0 : settings.practiceWordBankType === "medium" ? 1 : 2}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      const type = val === 0 ? "easy" : val === 1 ? "medium" : "hard";
                      onSettingsChange({ ...settings, practiceWordBankType: type });
                    }}
                    disabled={status !== "idle"}
                    aria-label="Word bank difficulty"
                    className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">Hard</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-6 h-[440px] overflow-hidden rounded-[34px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_74%,transparent)] px-6 py-8 md:px-10 md:py-12">
            <TypingLayer
              tokens={tokens}
              snapshot={snapshot}
              chapterText={practiceText}
              className={`text-lg leading-9 md:text-[1.35rem] md:leading-[2.6rem] transition-opacity duration-500 ${status === "completed" ? "opacity-40 grayscale pointer-events-none" : ""}`}
              interactionMode="type"
              smoothCaret={settings.smoothCaret && analytics?.profile.unlocks.smoothCaret}
              botCursorIndex={mode === "versus" ? botCursorIndex : null}
              compareOptions={compareOptions}
            />

            {mode === "versus" && (
              <div className="absolute inset-x-6 bottom-5 h-8 md:inset-x-10">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                <div
                  className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_18px_var(--accent)]"
                  style={{ left: `calc(${botProgress * 100}% - 4px)` }}
                />
              </div>
            )}
            
            {status === "completed" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md rounded-[34px] z-50">
                <div className="text-center animate-in fade-in zoom-in duration-500 max-w-sm px-6">
                  <p className="text-3xl font-bold">Session Finished</p>
                  
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">WPM</p>
                      <p className="text-2xl font-bold mt-1">{metrics.wpm.toFixed(1)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Accuracy</p>
                      <p className="text-2xl font-bold mt-1">{formatPercent(metrics.accuracy)}</p>
                    </div>
                  </div>

                  {!summary ? (
                    <p className="text-[var(--text-muted)] mt-8 text-sm flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                      Syncing your results...
                    </p>
                  ) : (
                    <p className="text-[var(--accent)] mt-8 text-sm font-medium">✓ Results synced to profile</p>
                  )}
                  
                  <div className="mt-10 flex flex-col gap-3">
                    <Button className="w-full" onClick={() => setShowSummary(true)} disabled={!summary}>See Results</Button>
                    <Button variant="ghost" className="w-full" onClick={restart}>Start New Test</Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="WPM" value={metrics.wpm.toFixed(1)} />
            <Metric label="Accuracy" value={formatPercent(metrics.accuracy)} />
            <Metric label={mode === "type-test" ? "Time Left" : "Session"} value={mode === "type-test" ? `${timeRemaining}s` : status === "completed" ? "Finished" : status === "idle" ? "Ready" : "In Progress"} />
            <Metric label="Words" value={metrics.typedWords.toLocaleString()} />
          </div>

          {mode === "versus" && (
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Metric label="Bot CPM" value={settings.versusBotCpm.toString()} compact />
              <Metric label="Bot Word" value={wordIndexFromTextIndex(tokens, botCursorIndex).toString()} compact />
              <Metric label="Your Word" value={snapshot.currentWordIndex.toString()} compact />
            </div>
          )}
        </Card>

        {!desktopReady && (
          <Card className="p-5 text-sm text-[var(--text-muted)]">
            Practice works in preview mode, but progression, achievements, and analytics persistence only work in the desktop app.
          </Card>
        )}
      </div>

      <SessionSummaryModal summary={showSummary ? summary : null} onClose={() => setShowSummary(false)} />
    </>
  );
}

function ModeChip({
  active,
  children,
  onClick,
  disabled = false,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active ? "bg-[var(--accent)] text-black" : "border border-[var(--border)] bg-black/10 text-[var(--text-muted)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-black/10 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</p>
      <p className={compact ? "mt-2 text-xl font-semibold" : "mt-3 text-3xl font-semibold"}>{value}</p>
    </div>
  );
}

function buildPracticeText(seed: number, words: number, bankType: keyof typeof practiceWordBanks = "easy") {
  // Deterministic generation based on seed
  let state = seed;
  const generated: string[] = [];
  const bank = practiceWordBanks[bankType] || practiceWordBanks.easy;

  for (let index = 0; index < words; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const nextIndex = Math.floor((state / 2147483648) * bank.length);
    generated.push(bank[nextIndex] ?? bank[0]);
  }

  return generated.join(" ");
}
