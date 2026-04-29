/**
 * Supported book formats.
 */
export const BOOK_FORMATS = ["epub", "md", "txt"] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];

/**
 * Available reader modes.
 * - scroll: Continuous vertical scrolling.
 * - spread: Two-page book layout.
 */
export const READER_MODES = ["scroll", "spread"] as const;
export type ReaderMode = (typeof READER_MODES)[number];

/**
 * Interaction modes for the reader.
 * - type: User types the text as they read.
 * - read: Traditional reading mode.
 * - versus: Competitive typing against a bot or opponent.
 */
export const INTERACTION_MODES = ["type", "read", "versus"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

/**
 * Source of a typing session.
 */
export const SESSION_SOURCES = ["book", "type-test", "versus"] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

/**
 * Active navigation tabs in the application.
 */
export const ACTIVE_TABS = ["library", "reader", "analytics", "achievements", "type-test"] as const;
export type ActiveTab = (typeof ACTIVE_TABS)[number];

/**
 * Supported keyboard layouts.
 */
export const KEYBOARD_LAYOUT_IDS = ["qwerty-us", "colemak", "dvorak", "custom"] as const;
export type KeyboardLayoutId = (typeof KEYBOARD_LAYOUT_IDS)[number];

/**
 * Available UI themes.
 */
export const THEME_NAMES = [
  "catppuccin-macchiato",
  "gruvbox-dark",
  "sepia",
  "solarized-light",
  "dracula",
  "nord",
  "rosewood",
  "sakura-tea",
  "mocha-blush",
] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/**
 * Available application fonts.
 */
export const APP_FONTS = ["jetbrains-mono", "fira-code", "geist-mono"] as const;
export type AppFont = (typeof APP_FONTS)[number];

/**
 * Durations for typing tests in seconds.
 */
export const TYPE_TEST_DURATIONS = [15, 30, 60, 120] as const;
export type TypeTestDuration = (typeof TYPE_TEST_DURATIONS)[number];

/**
 * Difficulty levels for practice word banks.
 */
export const PRACTICE_WORD_BANK_TYPES = ["easy", "medium", "hard"] as const;
export type PracticeWordBankType = (typeof PRACTICE_WORD_BANK_TYPES)[number];


/**
 * Represents a book record stored in the database.
 */
export interface BookRecord {
  id: number;
  title: string;
  author: string | null;
  path: string;
  format: BookFormat;
  coverPath: string | null;
  currentIndex: number;
  currentChapter: number;
  readIndex: number;
  readChapter: number;
  totalChars: number;
  pinned: boolean;
  averageWpm: number;
  addedAt: string;
}

/**
 * Represents a chunk of text within a book chapter.
 */
export interface BookChunk {
  id: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Represents a chapter within a book.
 */
export interface BookChapter {
  id: string;
  title: string;
  start: number;
  end: number;
  text: string;
  chunks: BookChunk[];
}

/**
 * Represents a book that has been parsed and is ready for reading/typing.
 */
export interface ParsedBook extends BookRecord {
  chapters: BookChapter[];
}

/**
 * Input data for saving a typing session.
 */
export interface TypingSessionInput {
  bookId: number | null;
  source: SessionSource;
  sourceLabel: string;
  startTime: string;
  endTime: string;
  wordsTyped: number;
  charsTyped: number;
  errors: number;
  wpm: number;
  accuracy: number;
  durationSeconds: number;
}

/**
 * Aggregated typing metrics for a single day.
 */
export interface DailyMetric {
  day: string;
  wpm: number;
  accuracy: number;
  sessions: number;
  wordsTyped: number;
}

/**
 * A data point representing a completed typing session.
 */
export interface SessionPoint {
  id: number;
  bookId: number | null;
  title: string;
  source: SessionSource;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  wordsTyped: number;
  charsTyped: number;
  wpm: number;
  accuracy: number;
  xpGained: number;
  rhythmScore: number;
  focusScore: number;
}

/**
 * Summary of all analytics data for the user.
 */
export interface AnalyticsSummary {
  totalWordsTyped: number;
  totalCharsTyped: number;
  totalTimeSeconds: number;
  averageWpm: number;
  averageAccuracy: number;
  sessions: number;
  history: DailyMetric[];
  sessionPoints: SessionPoint[];
  profile: ProfileProgress;
  achievements: AchievementAward[];
  latestDeepAnalytics: DeepAnalytics | null;
  aggregateConfusions: ConfusionPair[];
  aggregateTransitions: TransitionGroups;
  keyAccuracies: KeyAccuracy[];
}

/**
 * Application settings and preferences.
 */
export interface AppSettings {
  theme: ThemeName;
  font: AppFont;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  baseFontSize: number;
  lineHeight: number;
  tabToSkip: boolean;
  ignoreQuotationMarks: boolean;
  ignoredCharacters: string;
  focusMode: boolean;
  keyboardLayout: KeyboardLayoutId;
  customKeyboardLayout: string;
  smoothCaret: boolean;
  typeTestDuration: TypeTestDuration;
  versusBotCpm: number;
  practiceWordBankType: PracticeWordBankType;
  errorColor: string;
  successColor: string;
}


/**
 * Represents a tokenized word with its trailing separator.
 */
export interface TokenizedWord {
  id: string;
  word: string;
  separator: string;
  start: number;
  end: number;
}

/**
 * Represents the typing state of a single word.
 */
export interface WordTypingState {
  typed: string;
  completed: boolean;
  skipped: boolean;
}

/**
 * A snapshot of the current typing progress.
 */
export interface TypingSnapshot {
  words: WordTypingState[];
  currentWordIndex: number;
}

/**
 * Represents a single keystroke event.
 */
export interface KeystrokeEvent {
  at: number;
  type: "char" | "space" | "enter" | "backspace" | "meta";
  char?: string;
  expected?: string;
  isCorrect?: boolean;
  layout?: string;
  chapterIndex?: number;
  cursorIndex?: number;
  skippedWord?: boolean;
  correctChars?: number;
  typedChars?: number;
  errors?: number;
}

/**
 * Live metrics calculated during a typing session.
 */
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

/**
 * Definition of a keyboard layout.
 */
export interface KeyboardLayoutDefinition {
  id: KeyboardLayoutId | string;
  name: string;
  rows: string[];
}

/**
 * Represents a pair of keys that the user frequently confuses.
 */
export interface ConfusionPair {
  expected: string;
  typed: string;
  count: number;
}

/**
 * Accuracy metrics for a specific key.
 */
export interface KeyAccuracy {
  key: string;
  correct: number;
  total: number;
}



/**
 * Statistics for a key transition (e.g., "th", "he").
 */
export interface TransitionStat {
  combo: string;
  samples: number;
  averageMs: number;
  deviationMs: number;
  errorRate: number;
}

/**
 * Grouped transition statistics.
 */
export interface TransitionGroups {
  fastest: TransitionStat[];
  slowest: TransitionStat[];
  errorProne: TransitionStat[];
}

/**
 * A sample of WPM at a specific timestamp.
 */
export interface WpmSample {
  at: number;
  value: number;
}

/**
 * Detailed analytics for a typing session or aggregate period.
 */
export interface DeepAnalytics {
  macroWpm: WpmSample[];
  macroAccuracy: WpmSample[];
  recentWpm: WpmSample[];
  confusionPairs: ConfusionPair[];
  transitions: TransitionGroups;
  rhythmScore: number;
  cadenceCv: number;
  focusScore: number;
  activeTypingSeconds: number;
  keyAccuracies: KeyAccuracy[];
}

/**
 * Features and cosmetics unlocked by the user.
 */
export interface UnlockState {
  draculaTheme: boolean;
  nordTheme: boolean;
  rosewoodTheme: boolean;
  mochaBlushTheme: boolean;
  smoothCaret: boolean;
  premiumTypography: boolean;
  customErrorColors: boolean;
  customSuccessColors: boolean;
}

/**
 * User profile progression state.
 */
export interface ProfileProgress {
  totalXp: number;
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressToNextLevel: number;
  streakDays: number;
  restedWordsAvailable: number;
  unlocks: UnlockState;
}

/**
 * An achievement awarded to the user.
 */
export interface AchievementAward {
  key: string;
  earnedAt: string;
}

/**
 * Response received after completing and saving a session.
 */
export interface SessionSummaryResponse {
  sessionId: number;
  xpGained: number;
  restedBonusXp: number;
  accuracyMultiplier: number;
  cadenceMultiplier: number;
  enduranceMultiplier: number;
  levelBefore: number;
  levelAfter: number;
  unlockedRewards: string[];
  newlyEarnedAchievements: AchievementAward[];
  profile: ProfileProgress;
  deepAnalytics: DeepAnalytics;
  sessionPoint: SessionPoint;
}

/**
 * Contextual information about the current typing session.
 */
export interface SessionContext {
  bookId: number | null;
  source: SessionSource;
  sourceLabel: string;
  keyboardLayout: KeyboardLayoutDefinition;
}

/**
 * Input for processing a batch of keystrokes.
 */
export interface ProcessKeystrokeBatchInput {
  sessionKey: string;
  context: SessionContext;
  events: KeystrokeEvent[];
  finalizeSession?: TypingSessionInput;
}

/**
 * Result of processing a batch of keystrokes.
 */
export interface ProcessKeystrokeBatchResult {
  bufferedEvents: number;
  savedSession?: SessionSummaryResponse;
}

