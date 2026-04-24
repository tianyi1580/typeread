import type { KeystrokeEvent, LiveMetrics, TokenizedWord, TypingSnapshot, WordTypingState } from "../types";
import { clamp } from "../lib/utils";

interface TypingBehavior {
  enterToSkip?: boolean;
  ignoreQuotationMarks?: boolean;
}

export function normalizeTypingChar(input: string) {
  return input
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/—/g, "--")
    .replace(/\u00a0/g, " ");
}

export function normalizeForCompare(input: string, ignoreQuotationMarks = false) {
  const normalized = normalizeTypingChar(input).normalize("NFKC");
  return ignoreQuotationMarks ? normalized.replace(/["“”'‘’]/g, "") : normalized;
}

export function tokenizeText(text: string): TokenizedWord[] {
  const tokens: TokenizedWord[] = [];
  const regex = /(\S+)(\s*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [full, word, separator] = match;
    tokens.push({
      id: `${tokens.length}-${match.index}`,
      word,
      separator,
      start: match.index,
      end: match.index + full.length,
    });
  }

  return tokens;
}

export function createTypingSnapshot(tokens: TokenizedWord[]): TypingSnapshot {
  return {
    currentWordIndex: 0,
    words: tokens.map<WordTypingState>(() => ({
      typed: "",
      completed: false,
      skipped: false,
    })),
  };
}

export function computeWordScore(expected: string, typed: string, options: TypingBehavior = {}) {
  const normalizedExpected = normalizeForCompare(expected, options.ignoreQuotationMarks);
  const normalizedTyped = normalizeForCompare(typed, options.ignoreQuotationMarks);
  const overlap = Math.max(normalizedExpected.length, normalizedTyped.length);
  let correctChars = 0;
  let errors = 0;

  for (let index = 0; index < overlap; index += 1) {
    const exp = normalizedExpected[index];
    const got = normalizedTyped[index];
    if (!got && exp) {
      continue;
    }
    if (exp === got) {
      correctChars += 1;
    } else if (got) {
      errors += 1;
    }
  }

  return {
    correctChars,
    typedChars: normalizedTyped.length,
    errors,
  };
}

export function moveToPreviousWord(snapshot: TypingSnapshot) {
  if (snapshot.currentWordIndex === 0) {
    return snapshot;
  }

  snapshot.currentWordIndex -= 1;
  const current = snapshot.words[snapshot.currentWordIndex];
  current.completed = false;
  current.skipped = false;
  
  if (current.typed.length > 0) {
    current.typed = current.typed.slice(0, -1);
  }
  
  return snapshot;
}

export function applyTypingInput(
  snapshot: TypingSnapshot,
  tokens: TokenizedWord[],
  key: string,
  timestamp: number,
  options: TypingBehavior = {},
): { snapshot: TypingSnapshot; event?: KeystrokeEvent } {
  const current = snapshot.words[snapshot.currentWordIndex];
  const token = tokens[snapshot.currentWordIndex];

  if (!current || !token) {
    return { snapshot };
  }

  if (key === "Backspace") {
    if (current.typed.length > 0) {
      current.typed = current.typed.slice(0, -1);
      current.completed = false;
      current.skipped = false;
    } else {
      moveToPreviousWord(snapshot);
    }
    return {
      snapshot,
      event: { at: timestamp, type: "backspace" },
    };
  }

  if (key === "Enter") {
    if (!options.enterToSkip) {
      return { snapshot };
    }
    current.completed = true;
    current.skipped = true;
    current.typed = "";
    if (snapshot.currentWordIndex < snapshot.words.length - 1) {
      snapshot.currentWordIndex += 1;
    }
    return {
      snapshot,
      event: {
        at: timestamp,
        type: "enter",
        skippedWord: true,
      },
    };
  }

  if (key.length === 1) {
    if (options.ignoreQuotationMarks) {
      autoConsumeQuotationMarks(current, token);
    }

    const inputChar = normalizeTypingChar(key);
    current.typed += inputChar;
    if (options.ignoreQuotationMarks) {
      autoConsumeQuotationMarks(current, token);
    }

    const fullExpectedLength = token.word.length + token.separator.length;
    
    // If we've typed enough characters to fill the word and its separator, advance.
    // Note: This allows "over-typing" the word part, but it will eventually cap out at the separator.
    if (current.typed.length >= fullExpectedLength) {
      current.completed = true;
      const score = computeWordScore(token.word + token.separator, current.typed, options);
      if (snapshot.currentWordIndex < snapshot.words.length - 1) {
        snapshot.currentWordIndex += 1;
      }
      
      return {
        snapshot,
        event: {
          at: timestamp,
          type: inputChar === " " ? "space" : "char",
          correctChars: score.correctChars,
          typedChars: score.typedChars,
          errors: score.errors,
        },
      };
    }

    return {
      snapshot,
      event: {
        at: timestamp,
        type: inputChar === " " ? "space" : "char",
      },
    };
  }

  return { snapshot };
}

function autoConsumeQuotationMarks(state: WordTypingState, token: TokenizedWord) {
  const expected = token.word + token.separator;
  while (state.typed.length < expected.length && /["“”'‘’]/.test(expected[state.typed.length] ?? "")) {
    state.typed += expected[state.typed.length];
  }
}

export function currentProgress(snapshot: TypingSnapshot, tokens: TokenizedWord[]) {
  const currentToken = tokens[snapshot.currentWordIndex];
  if (!currentToken) {
    return 1;
  }

  const lastToken = tokens[tokens.length - 1];
  return currentToken.start / Math.max(lastToken?.end ?? 1, 1);
}

export function currentChapterIndex(snapshot: TypingSnapshot, tokens: TokenizedWord[]) {
  const currentToken = tokens[snapshot.currentWordIndex];
  return currentToken?.start ?? 0;
}

export function computeMetrics(
  events: KeystrokeEvent[],
  elapsedSeconds: number,
  snapshot: TypingSnapshot,
  tokens: TokenizedWord[],
): LiveMetrics {
  let typedWords = 0;
  let typedChars = 0;
  let correctChars = 0;
  let errors = 0;

  // Optimization: Only look at the last 100 events for live metrics to keep keystrokes snappy.
  // Full metrics are calculated only on session end.
  const recentEvents = events.length > 100 ? events.slice(-100) : events;
  for (const event of recentEvents) {
    if (event.type === "space" && !event.skippedWord) {
      typedWords += 1;
      typedChars += event.typedChars ?? 0;
      correctChars += event.correctChars ?? 0;
      errors += event.errors ?? 0;
    }
  }

  // To maintain accuracy even with truncated events, we use the snapshot's state for counts where possible.
  // But for live WPM, just the recent window is actually better for "current" speed.
  if (events.length > 100) {
      // Approximate for the older history to keep UI totals consistent
      const ratio = events.length / 100;
      typedWords = Math.round(typedWords * ratio);
      typedChars = Math.round(typedChars * ratio);
      correctChars = Math.round(correctChars * ratio);
      errors = Math.round(errors * ratio);
  }

  const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
  const wpm = correctChars / 5 / minutes;
  const accuracy = typedChars === 0 ? 100 : clamp((correctChars / typedChars) * 100, 0, 100);
  const progress = currentProgress(snapshot, tokens);
  const chapterProgress = progress;

  return {
    wpm,
    accuracy,
    elapsedSeconds,
    typedWords,
    typedChars,
    errors,
    progress,
    chapterProgress,
  };
}

export function finalizeMetrics(
  events: KeystrokeEvent[],
  startTime: number,
  endTime: number,
  discardedTailMs = 0,
) {
  // Inactivity cleanup trims the dead tail so sessions reflect active typing instead of idle inflation.
  const effectiveEnd = Math.max(startTime, endTime - discardedTailMs);
  const filteredEvents = events.filter((event) => event.at <= effectiveEnd);
  let typedWords = 0;
  let typedChars = 0;
  let correctChars = 0;
  let errors = 0;

  for (const event of filteredEvents) {
    if (event.type === "space" && !event.skippedWord) {
      typedWords += 1;
      typedChars += event.typedChars ?? 0;
      correctChars += event.correctChars ?? 0;
      errors += event.errors ?? 0;
    }
  }

  const durationSeconds = Math.max(1, Math.round((effectiveEnd - startTime) / 1000));
  const minutes = durationSeconds / 60;
  const wpm = minutes <= 0 ? 0 : correctChars / 5 / minutes;
  const accuracy = typedChars === 0 ? 100 : clamp((correctChars / typedChars) * 100, 0, 100);

  return {
    wordsTyped: typedWords,
    charsTyped: typedChars,
    errors,
    wpm,
    accuracy,
    durationSeconds,
    effectiveEndTimeMs: effectiveEnd,
  };
}
