import type { KeystrokeEvent, LiveMetrics, TokenizedWord, TypingSnapshot, WordTypingState } from "../types";
import { clamp } from "../lib/utils";

/**
 * Behavior options for the typing engine.
 */
interface TypingBehavior {
  /** Whether pressing Tab skips the current word. */
  tabToSkip?: boolean;
  /** Set of characters to ignore when comparing typed vs expected. */
  ignoredCharacterSet?: ReadonlySet<string>;
  /** The current keyboard layout ID. */
  layoutId?: string;
}

/**
 * Input event for a keystroke.
 */
interface TypingInput {
  /** The key pressed. */
  key: string;
  /** Whether the Ctrl key was held down. */
  ctrlKey?: boolean;
}

/** Default characters to ignore if ignoreQuotationMarks is enabled. */
export const DEFAULT_IGNORED_CHARACTERS = '"\'“”‘’';

/**
 * Normalizes a single character or string for consistent typing comparison.
 * Replaces curly quotes, em dashes, etc., with standard equivalents.
 * 
 * @param input - The string to normalize.
 * @returns The normalized string.
 */
export function normalizeTypingChar(input: string) {
  return input
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/—/g, "--")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ");
}

/**
 * Normalizes full text content, handling line endings and special characters.
 * 
 * @param text - The text to normalize.
 * @returns The fully normalized text.
 */
export function normalizeTypingText(text: string) {
  return normalizeTypingChar(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")).normalize("NFKC");
}

/**
 * Parses a string specification of ignored characters into a Set.
 * Supports comma-separated or quoted formats.
 * 
 * @param spec - The string specification of ignored characters.
 * @returns A Set of parsed characters.
 */
export function parseIgnoredCharacterSet(spec: string) {
  const parsed = new Set<string>();
  const quotedPattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  let match: RegExpExecArray | null;

  while ((match = quotedPattern.exec(spec)) !== null) {
    const value = unescapeSettingToken(match[1] ?? match[2] ?? "");
    for (const character of [...value]) {
      const normalized = normalizeTypingChar(character);
      for (const n of [...normalized]) {
        parsed.add(n);
      }
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
      const normalized = normalizeTypingChar(character);
      for (const n of [...normalized]) {
        parsed.add(n);
      }
      parsed.add(character);
    }
  }

  return parsed;
}

/**
 * Normalizes text specifically for comparison, filtering out ignored characters.
 * 
 * @param input - The input string to normalize.
 * @param ignoredCharacterSet - Optional set of characters to ignore.
 * @returns The normalized string ready for comparison.
 */
export function normalizeForCompare(input: string, ignoredCharacterSet?: ReadonlySet<string>) {
  const normalized = normalizeTypingChar(input).normalize("NFKC");
  if (!ignoredCharacterSet || ignoredCharacterSet.size === 0) {
    return normalized;
  }

  return [...normalized].filter((character) => !charIsIgnored(character, ignoredCharacterSet)).join("");
}

/**
 * Checks if a character is in the ignored set.
 * 
 * @param char - The character to check.
 * @param set - The set of ignored characters.
 * @returns True if the character should be ignored.
 */
function charIsIgnored(char: string, set?: ReadonlySet<string>) {
  if (!set || set.size === 0) return false;
  if (set.has(char)) return true;
  const normalized = normalizeTypingChar(char).normalize("NFKC");
  for (const n of [...normalized]) {
    if (set.has(n)) return true;
  }
  return false;
}

/**
 * Tokenizes text into words and their trailing whitespace.
 * 
 * @param text - The text to tokenize.
 * @returns An array of tokenized words.
 */
export function tokenizeText(text: string): TokenizedWord[] {
  const normalizedText = normalizeTypingText(text);
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


/**
 * Creates a typing snapshot based on the current cursor position in the text.
 * 
 * @param tokens - The tokenized words.
 * @param cursorTextIndex - The current character index of the cursor.
 * @returns A new TypingSnapshot.
 */
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

/**
 * Creates a typing snapshot starting at the beginning of a specific word.
 * 
 * @param tokens - The tokenized words.
 * @param wordIndex - The index of the word to start at.
 * @returns A new TypingSnapshot.
 */
export function createSnapshotFromWordStart(tokens: TokenizedWord[], wordIndex: number) {
  if (tokens.length === 0) {
    return createTypingSnapshot(tokens);
  }

  const safeIndex = clamp(wordIndex, 0, tokens.length - 1);
  return createTypingSnapshot(tokens, tokens[safeIndex].start);
}

/**
 * Resolves the word index from a character index.
 * 
 * @param tokens - The tokenized words.
 * @param cursorTextIndex - The character index.
 * @returns The corresponding word index.
 */
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

/**
 * Resolves the character index of the start of a word.
 * 
 * @param tokens - The tokenized words.
 * @param wordIndex - The word index.
 * @returns The starting character index.
 */
export function textIndexForWordStart(tokens: TokenizedWord[], wordIndex: number) {
  if (tokens.length === 0) {
    return 0;
  }

  return tokens[clamp(wordIndex, 0, tokens.length - 1)]?.start ?? 0;
}

/**
 * Computes the score (correct chars, errors) for a typed word.
 * 
 * @param expected - The expected word text.
 * @param typed - The actual typed text.
 * @param options - Typing behavior options.
 * @returns Object containing correctChars, typedChars, and errors.
 */
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


/**
 * Moves the cursor to the previous word in the snapshot.
 * 
 * @param snapshot - The current TypingSnapshot.
 * @returns The updated snapshot.
 */
export function moveToPreviousWord(snapshot: TypingSnapshot) {
  if (snapshot.currentWordIndex === 0) {
    return snapshot;
  }

  snapshot.currentWordIndex -= 1;
  const current = getMutableWord(snapshot, snapshot.currentWordIndex);
  if (!current) {
    return snapshot;
  }
  current.completed = false;
  current.skipped = false;

  if (current.typed.length > 0) {
    current.typed = current.typed.slice(0, -1);
  }

  return snapshot;
}

/**
 * Applies a keystroke input to the current typing snapshot.
 * 
 * @param snapshot - The current TypingSnapshot.
 * @param tokens - The tokenized words.
 * @param input - The keystroke input.
 * @param timestamp - The timestamp of the event.
 * @param chapterIndex - The current chapter index.
 * @param options - Typing behavior options.
 * @returns Object containing the updated snapshot and an optional KeystrokeEvent.
 */
export function applyTypingInput(
  snapshot: TypingSnapshot,
  tokens: TokenizedWord[],
  input: TypingInput,
  timestamp: number,
  chapterIndex: number,
  options: TypingBehavior = {},
): { snapshot: TypingSnapshot; event?: KeystrokeEvent } {
  const current = getMutableWord(snapshot, snapshot.currentWordIndex);
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
        chapterIndex,
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
        chapterIndex,
        cursorIndex,
      },
    };
  }

  if (input.key === "Tab") {
    if (!options.tabToSkip) {
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
        type: "meta",
        expected: currentExpectedCharacter(current, token),
        layout: options.layoutId,
        chapterIndex,
        cursorIndex: token.start + current.typed.length,
        skippedWord: true,
      },
    };
  }


  const isEnter = input.key === "Enter";
  if (isEnter || input.key.length === 1) {
    autoConsumeIgnoredCharacters(current, token, options.ignoredCharacterSet);

    const expected = currentExpectedCharacter(current, token);
    const cursorIndex = token.start + current.typed.length;
    const inputChar = isEnter ? "\n" : normalizeTypingChar(input.key);

    if (charIsIgnored(inputChar, options.ignoredCharacterSet)) {
      return { snapshot };
    }
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
          type: isEnter ? "enter" : (inputChar === " " ? "space" : "char"),
          char: inputChar,
          expected,
          isCorrect,
          layout: options.layoutId,
          chapterIndex,
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
        type: isEnter ? "enter" : (inputChar === " " ? "space" : "char"),
        char: inputChar,
        expected,
        isCorrect,
        layout: options.layoutId,
        chapterIndex,
        cursorIndex,
      },
    };
  }

  return { snapshot };
}

/**
 * Calculates the current cursor index in the text.
 * 
 * @param snapshot - The current TypingSnapshot.
 * @param tokens - The tokenized words.
 * @returns The character index of the cursor.
 */
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

/**
 * Calculates the current progress as a fraction (0 to 1).
 * 
 * @param snapshot - The current TypingSnapshot.
 * @param tokens - The tokenized words.
 * @returns The progress fraction.
 */
export function currentProgress(snapshot: TypingSnapshot, tokens: TokenizedWord[]) {
  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) {
    return 1;
  }

  return currentCursorIndex(snapshot, tokens) / Math.max(lastToken.end, 1);
}

/**
 * Calculates the active typing duration, excluding pauses longer than thresholdMs.
 * 
 * @param events - The keystroke events.
 * @param startTime - The session start timestamp.
 * @param currentTime - The current timestamp.
 * @param thresholdMs - The pause threshold in milliseconds (default 10s).
 * @returns The active duration in seconds.
 */
export function calculateActiveDuration(
  events: KeystrokeEvent[],
  startTime: number,
  currentTime: number,
  thresholdMs: number = 10000,
): number {
  if (events.length === 0) {
    return 0;
  }

  let activeMs = 0;
  let lastAt = startTime;

  for (const event of events) {
    const gap = event.at - lastAt;
    if (gap < thresholdMs) {
      activeMs += gap;
    }
    lastAt = event.at;
  }

  // Handle the current pending time since the last event
  const finalGap = currentTime - lastAt;
  if (finalGap < thresholdMs) {
    activeMs += finalGap;
  }

  return Math.round(Math.max(1000, activeMs) / 1000);
}

/**
 * Summarizes session events to calculate typed words, chars, errors, etc.
 * 
 * @param events - The keystroke events.
 * @returns Object containing typedWords, typedChars, correctChars, errors, and accuracy.
 */
function summarizeSessionEvents(events: KeystrokeEvent[]) {
  let typedWords = 0;
  let typedChars = 0;
  let correctChars = 0;
  let errors = 0;
  const firstAttempts = new Map<string, boolean>();

  for (const event of events) {
    if ((event.type === "char" || event.type === "space" || event.type === "enter") && event.cursorIndex !== undefined) {
      const key = `${event.chapterIndex ?? 0}:${event.cursorIndex}`;
      if (!firstAttempts.has(key)) {
        firstAttempts.set(key, !!event.isCorrect);
      }
      if (event.isCorrect) {
        correctChars += 1;
      }
    }

    if (!event.skippedWord && event.typedChars !== undefined) {
      typedWords += 1;
      typedChars += event.typedChars;
      errors += event.errors ?? 0;
    }
  }

  const totalFirstAttempts = firstAttempts.size;
  const correctFirstAttempts = Array.from(firstAttempts.values()).filter(Boolean).length;
  const accuracy = totalFirstAttempts === 0 ? 100 : clamp((correctFirstAttempts / totalFirstAttempts) * 100, 0, 100);

  return {
    typedWords,
    typedChars,
    correctChars,
    errors,
    accuracy,
  };
}

/**
 * Computes live metrics during a typing session.
 * 
 * @param events - The keystroke events.
 * @param elapsedSeconds - Elapsed time in seconds.
 * @param snapshot - The current TypingSnapshot.
 * @param tokens - The tokenized words.
 * @returns The LiveMetrics.
 */
export function computeMetrics(
  events: KeystrokeEvent[],
  elapsedSeconds: number,
  snapshot: TypingSnapshot,
  tokens: TokenizedWord[],
): LiveMetrics {
  // Live and persisted metrics need to share identical event accounting or the HUD lies.
  const { typedWords, typedChars, correctChars, errors, accuracy } = summarizeSessionEvents(events);
  const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
  const rawWpm = correctChars / 5 / minutes;
  const wpm = Math.min(rawWpm, 350);
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

/**
 * Finalizes metrics at the end of a typing session.
 * 
 * @param events - The keystroke events.
 * @param startTime - The session start timestamp.
 * @param endTime - The session end timestamp.
 * @returns Finalized metrics.
 */
export function finalizeMetrics(
  events: KeystrokeEvent[],
  startTime: number,
  endTime: number,
) {

  const durationSeconds = calculateActiveDuration(events, startTime, endTime);
  const { typedWords, typedChars, correctChars, errors, accuracy } = summarizeSessionEvents(events);

  const minutes = durationSeconds / 60;
  const rawWpm = minutes <= 0 ? 0 : correctChars / 5 / minutes;
  const wpm = Math.min(rawWpm, 350);

  return {
    wordsTyped: typedWords,
    charsTyped: typedChars,
    errors,
    wpm,
    accuracy,
    durationSeconds,
    effectiveEndTimeMs: endTime,
  };
}

function deleteCurrentWord(snapshot: TypingSnapshot) {
  const current = getMutableWord(snapshot, snapshot.currentWordIndex);
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
  const previous = getMutableWord(snapshot, snapshot.currentWordIndex);
  if (!previous) {
    return;
  }
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
  while (state.typed.length < expected.length && charIsIgnored(expected[state.typed.length] ?? "", ignoredCharacterSet)) {
    state.typed += expected[state.typed.length];
  }
}

function expectedText(token: TokenizedWord) {
  return token.word + token.separator;
}

function currentExpectedCharacter(state: WordTypingState, token: TokenizedWord) {
  return expectedText(token)[state.typed.length];
}

function getMutableWord(snapshot: TypingSnapshot, index: number) {
  const state = snapshot.words[index];
  if (!state) {
    return undefined;
  }

  const clone = { ...state };
  snapshot.words[index] = clone;
  return clone;
}

function unescapeSettingToken(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}
