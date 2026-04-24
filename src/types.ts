export type BookFormat = "epub" | "md" | "txt";
export type ReaderMode = "scroll" | "spread";
export type InteractionMode = "type" | "read";
export type ThemeName = "catppuccin-macchiato" | "gruvbox-dark" | "sepia" | "solarized-light";
export type TypeFont = "jetbrains-mono" | "fira-code" | "geist-mono";
export type ReadFont = "inter" | "literata" | "merriweather";

export interface BookRecord {
  id: number;
  title: string;
  author: string | null;
  path: string;
  format: BookFormat;
  coverPath: string | null;
  currentIndex: number;
  currentChapter: number;
  totalChars: number;
  addedAt: string;
}

export interface BookChunk {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface BookChapter {
  id: string;
  title: string;
  start: number;
  end: number;
  text: string;
  chunks: BookChunk[];
}

export interface ParsedBook extends BookRecord {
  chapters: BookChapter[];
}

export interface TypingSessionInput {
  bookId: number;
  startTime: string;
  endTime: string;
  wordsTyped: number;
  charsTyped: number;
  errors: number;
  wpm: number;
  accuracy: number;
  durationSeconds: number;
}

export interface DailyMetric {
  day: string;
  wpm: number;
  accuracy: number;
  sessions: number;
}

export interface AnalyticsSummary {
  totalWordsTyped: number;
  totalCharsTyped: number;
  totalTimeSeconds: number;
  averageWpm: number;
  averageAccuracy: number;
  sessions: number;
  history: DailyMetric[];
}

export interface AppSettings {
  theme: ThemeName;
  typeFont: TypeFont;
  readFont: ReadFont;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  focusMode: boolean;
}

export interface TokenizedWord {
  id: string;
  word: string;
  separator: string;
  start: number;
  end: number;
}

export interface WordTypingState {
  typed: string;
  completed: boolean;
  skipped: boolean;
}

export interface TypingSnapshot {
  words: WordTypingState[];
  currentWordIndex: number;
}

export interface KeystrokeEvent {
  at: number;
  type: "char" | "space" | "enter" | "backspace";
  skippedWord?: boolean;
  correctChars?: number;
  typedChars?: number;
  errors?: number;
}

export interface LiveMetrics {
  wpm: number;
  accuracy: number;
  elapsedSeconds: number;
  typedWords: number;
  typedChars: number;
  errors: number;
  progress: number;
  chapterProgress: number;
}
