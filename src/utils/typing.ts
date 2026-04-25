import type { KeystrokeEvent, LiveMetrics, TokenizedWord, TypingSnapshot, WordTypingState } from "../types";
import { clamp } from "../lib/utils";

interface TypingBehavior {
  enterToSkip?: boolean;
  ignoredCharacterSet?: ReadonlySet<string>;
  layoutId?: string;
}

interface TypingInput {
  key: string;
  ctrlKey?: boolean;
}

export const DEFAULT_IGNORED_CHARACTERS = `"\"", "'", "“", "”", "‘", "’"`;

export function normalizeTypingChar(input: string) {
  return input.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'").replace(/—/g, "--").replace(/\u00a0/g, " ");
}

export function parseIgnoredCharacterSet(spec: string) {
  const parsed = new Set<string>();
  const quotedPattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  let match: RegExpExecArray | null;

  while ((match = quotedPattern.exec(spec)) !== null) {
    const value = unescapeSettingToken(match[1] ?? match[2] ?? "");
    for (const character of [...value]) {
      parsed.add(character);
    }
  }

  if (parsed.size > 0) {
    return parsed;
  }

  for (const fragment of spec.split(",")) {
    const value = fragment.trim();
    if (!value) {
      continue;
    }
    for (const character of [...value]) {
      parsed.add(character);
    }
  }

  return parsed;
}

export function normalizeForCompare(input: string, ignoredCharacterSet?: ReadonlySet<string>) {
  const normalized = normalizeTypingChar(input).normalize("NFKC");
  if (!ignoredCharacterSet || ignoredCharacterSet.size === 0) {
    return normalized;
  }

  return [...normalized].filter((character) => !ignoredCharacterSet.has(character)).join("");
}

export function tokenizeText(text: string): TokenizedWord[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const tokens: TokenizedWord[] = [];
  const regex = /(\S+)(\s*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalizedText)) !== null) {
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

export function createTypingSnapshot(tokens: TokenizedWord[], cursorTextIndex = 0): TypingSnapshot {
  const words = tokens.map<WordTypingState>(() => ({
    typed: "",
    completed: false,
    skipped: false,
  }));

  if (tokens.length === 0) {
    return {
      currentWordIndex: 0,
      words,
    };
  }

  const lastToken = tokens[tokens.length - 1];
  const clampedIndex = clamp(cursorTextIndex, 0, lastToken.end);
  let currentWordIndex = tokens.length - 1;
  let currentTyped = expectedText(tokens[currentWordIndex]);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (clampedIndex <= token.start) {
      currentWordIndex = index;
      currentTyped = "";
      break;
    }

    if (clampedIndex < token.end) {
      currentWordIndex = index;
      currentTyped = expectedText(token).slice(0, clampedIndex - token.start);
      break;
    }
  }

  for (let index = 0; index < currentWordIndex; index += 1) {
    words[index] = {
      typed: expectedText(tokens[index]),
      completed: true,
      skipped: false,
    };
  }

  words[currentWordIndex] = {
    typed: currentTyped,
    completed: currentTyped.length >= expectedText(tokens[currentWordIndex]).length,
    skipped: false,
  };

  return {
    currentWordIndex,
    words,
  };
}

export function createSnapshotFromWordStart(tokens: TokenizedWord[], wordIndex: number) {
  if (tokens.length === 0) {
    return createTypingSnapshot(tokens);
  }

  const safeIndex = clamp(wordIndex, 0, tokens.length - 1);
  return createTypingSnapshot(tokens, tokens[safeIndex].start);
}

export function wordIndexFromTextIndex(tokens: TokenizedWord[], cursorTextIndex: number) {
  if (tokens.length === 0) {
    return 0;
  }

  const lastToken = tokens[tokens.length - 1];
  const clampedIndex = clamp(cursorTextIndex, 0, lastToken.end);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (clampedIndex <= token.start || clampedIndex < token.end) {
      return index;
    }
  }

  return tokens.length - 1;
}

export function textIndexForWordStart(tokens: TokenizedWord[], wordIndex: number) {
  if (tokens.length === 0) {
    return 0;
  }

  return tokens[clamp(wordIndex, 0, tokens.length - 1)]?.start ?? 0;
}

export function computeWordScore(expected: string, typed: string, options: TypingBehavior = {}) {
  const normalizedExpected = normalizeForCompare(expected, options.ignoredCharacterSet);
  const normalizedTyped = normalizeForCompare(typed, options.ignoredCharacterSet);
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
  input: TypingInput,
  timestamp: number,
  options: TypingBehavior = {},
): { snapshot: TypingSnapshot; event?: KeystrokeEvent } {
  const current = snapshot.words[snapshot.currentWordIndex];
  const token = tokens[snapshot.currentWordIndex];

  if (!current || !token) {
    return { snapshot };
  }

  if (input.ctrlKey && input.key === "Backspace") {
    const expected = currentExpectedCharacter(current, token);
    deleteCurrentWord(snapshot);
    return {
      snapshot,
      event: {
        at: timestamp,
        type: "meta",
        expected,
        layout: options.layoutId,
        cursorIndex: token.start + current.typed.length,
      },
    };
  }

  if (input.key === "Backspace") {
    const expected = currentExpectedCharacter(current, token);
    const cursorIndex = token.start + Math.max(current.typed.length - 1, 0);
    if (current.typed.length > 0) {
      current.typed = current.typed.slice(0, -1);
      current.completed = false;
      current.skipped = false;
    } else {
      moveToPreviousWord(snapshot);
    }
    return {
      snapshot,
      event: {
        at: timestamp,
        type: "backspace",
        expected,
        layout: options.layoutId,
        cursorIndex,
      },
    };
  }

  if (input.key === "Enter") {
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
        expected: currentExpectedCharacter(current, token),
        layout: options.layoutId,
        cursorIndex: token.start + current.typed.length,
        skippedWord: true,
      },
    };
  }

  if (input.key.length === 1) {
    autoConsumeIgnoredCharacters(current, token, options.ignoredCharacterSet);

    const expected = currentExpectedCharacter(current, token);
    const cursorIndex = token.start + current.typed.length;
    const inputChar = normalizeTypingChar(input.key);
    const isCorrect =
      normalizeForCompare(inputChar, options.ignoredCharacterSet) ===
      normalizeForCompare(expected ?? "", options.ignoredCharacterSet);
    current.typed += inputChar;

    autoConsumeIgnoredCharacters(current, token, options.ignoredCharacterSet);

    const expectedValue = expectedText(token);
    if (current.typed.length >= expectedValue.length) {
      current.completed = true;
      const score = computeWordScore(expectedValue, current.typed, options);
      if (snapshot.currentWordIndex < snapshot.words.length - 1) {
        snapshot.currentWordIndex += 1;
      }

      return {
        snapshot,
        event: {
          at: timestamp,
          type: inputChar === " " ? "space" : "char",
          char: inputChar,
          expected,
          isCorrect,
          layout: options.layoutId,
          cursorIndex,
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
        char: inputChar,
        expected,
        isCorrect,
        layout: options.layoutId,
        cursorIndex,
      },
    };
  }

  return { snapshot };
}

export function currentCursorIndex(snapshot: TypingSnapshot, tokens: TokenizedWord[]) {
  const currentToken = tokens[snapshot.currentWordIndex];
  if (!currentToken) {
    const lastToken = tokens[tokens.length - 1];
    return lastToken?.end ?? 0;
  }

  const wordState = snapshot.words[snapshot.currentWordIndex];
  if (!wordState) {
    return currentToken.start;
  }

  return Math.min(currentToken.start + wordState.typed.length, currentToken.end);
}

export function currentProgress(snapshot: TypingSnapshot, tokens: TokenizedWord[]) {
  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) {
    return 1;
  }

  return currentCursorIndex(snapshot, tokens) / Math.max(lastToken.end, 1);
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

  const firstAttempts = new Map<number, boolean>();
  for (const event of events) {
    if ((event.type === "char" || event.type === "space") && event.cursorIndex !== undefined) {
      if (!firstAttempts.has(event.cursorIndex)) {
        firstAttempts.set(event.cursorIndex, !!event.isCorrect);
      }
    }
  }

  const totalFirstAttempts = firstAttempts.size;
  const correctFirstAttempts = Array.from(firstAttempts.values()).filter(Boolean).length;
  const accuracy = totalFirstAttempts === 0 ? 100 : clamp((correctFirstAttempts / totalFirstAttempts) * 100, 0, 100);

  const recentEvents = events.length > 200 ? events.slice(-200) : events;
  for (const event of recentEvents) {
    if (event.skippedWord || event.typedChars === undefined) {
      continue;
    }

    typedWords += 1;
    typedChars += event.typedChars;
    correctChars += event.correctChars ?? 0;
    errors += event.errors ?? 0;
  }

  if (events.length > 200) {
    const ratio = events.length / 200;
    typedWords = Math.round(typedWords * ratio);
    typedChars = Math.round(typedChars * ratio);
    correctChars = Math.round(correctChars * ratio);
    errors = Math.round(errors * ratio);
  }

  const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
  const wpm = correctChars / 5 / minutes;
  const progress = currentProgress(snapshot, tokens);

  return {
    wpm,
    accuracy,
    elapsedSeconds,
    typedWords,
    typedChars,
    errors,
    progress,
    chapterProgress: progress,
  };
}

export function finalizeMetrics(
  events: KeystrokeEvent[],
  startTime: number,
  endTime: number,
  discardedTailMs = 0,
) {
  const effectiveEnd = Math.max(startTime, endTime - discardedTailMs);
  const filteredEvents = events.filter((event) => event.at <= effectiveEnd);
  let typedWords = 0;
  let typedChars = 0;
  let correctChars = 0;
  let errors = 0;
  const firstAttempts = new Map<number, boolean>();
  for (const event of filteredEvents) {
    if ((event.type === "char" || event.type === "space") && event.cursorIndex !== undefined) {
      if (!firstAttempts.has(event.cursorIndex)) {
        firstAttempts.set(event.cursorIndex, !!event.isCorrect);
      }
    }
    
    if (!event.skippedWord && event.typedChars !== undefined) {
      typedWords += 1;
      typedChars += event.typedChars;
      correctChars += event.correctChars ?? 0;
      errors += event.errors ?? 0;
    }
  }

  const totalFirstAttempts = firstAttempts.size;
  const correctFirstAttempts = Array.from(firstAttempts.values()).filter(Boolean).length;
  const accuracy = totalFirstAttempts === 0 ? 100 : clamp((correctFirstAttempts / totalFirstAttempts) * 100, 0, 100);

  const durationSeconds = Math.max(1, Math.round((effectiveEnd - startTime) / 1000));
  const minutes = durationSeconds / 60;
  const wpm = minutes <= 0 ? 0 : correctChars / 5 / minutes;

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

function deleteCurrentWord(snapshot: TypingSnapshot) {
  const current = snapshot.words[snapshot.currentWordIndex];
  if (current?.typed.length) {
    current.typed = "";
    current.completed = false;
    current.skipped = false;
    return;
  }

  if (snapshot.currentWordIndex === 0) {
    return;
  }

  snapshot.currentWordIndex -= 1;
  const previous = snapshot.words[snapshot.currentWordIndex];
  previous.typed = "";
  previous.completed = false;
  previous.skipped = false;
}

function autoConsumeIgnoredCharacters(
  state: WordTypingState,
  token: TokenizedWord,
  ignoredCharacterSet?: ReadonlySet<string>,
) {
  if (!ignoredCharacterSet || ignoredCharacterSet.size === 0) {
    return;
  }

  const expected = expectedText(token);
  while (state.typed.length < expected.length && ignoredCharacterSet.has(expected[state.typed.length] ?? "")) {
    state.typed += expected[state.typed.length];
  }
}

function expectedText(token: TokenizedWord) {
  return token.word + token.separator;
}

function currentExpectedCharacter(state: WordTypingState, token: TokenizedWord) {
  return expectedText(token)[state.typed.length];
}

function unescapeSettingToken(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}
