export type BookFormat = "epub" | "md" | "txt";
export type ReaderMode = "scroll" | "spread";
export type InteractionMode = "type" | "read" | "versus";
export type SessionSource = "book" | "type-test" | "versus";
export type ActiveTab = "library" | "reader" | "analytics" | "achievements" | "type-test";
export type KeyboardLayoutId = "qwerty-us" | "colemak" | "dvorak" | "custom";
export type ThemeName =
  | "catppuccin-macchiato"
  | "gruvbox-dark"
  | "sepia"
  | "solarized-light"
  | "dracula"
  | "nord";
export type AppFont = "jetbrains-mono" | "fira-code" | "geist-mono";

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

export interface DailyMetric {
  day: string;
  wpm: number;
  accuracy: number;
  sessions: number;
}

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
}

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
  typeTestDuration: 15 | 30 | 60 | 120;
  versusBotCpm: number;
  practiceWordBankType: "easy" | "medium" | "hard";
  errorColor: string;
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
  type: "char" | "space" | "enter" | "backspace" | "meta";
  char?: string;
  expected?: string;
  isCorrect?: boolean;
  layout?: string;
  cursorIndex?: number;
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

export interface KeyboardLayoutDefinition {
  id: KeyboardLayoutId | string;
  name: string;
  rows: string[];
}

export interface ConfusionPair {
  expected: string;
  typed: string;
  count: number;
}

export interface TransitionStat {
  combo: string;
  samples: number;
  averageMs: number;
  deviationMs: number;
  errorRate: number;
}

export interface TransitionGroups {
  fastest: TransitionStat[];
  slowest: TransitionStat[];
  errorProne: TransitionStat[];
}

export interface WpmSample {
  at: number;
  value: number;
}

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
}

export interface UnlockState {
  draculaTheme: boolean;
  nordTheme: boolean;
  smoothCaret: boolean;
  premiumTypography: boolean;
  customErrorColors: boolean;
}

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

export interface AchievementAward {
  key: string;
  earnedAt: string;
}

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

export interface SessionContext {
  bookId: number | null;
  source: SessionSource;
  sourceLabel: string;
  keyboardLayout: KeyboardLayoutDefinition;
}

export interface ProcessKeystrokeBatchInput {
  sessionKey: string;
  context: SessionContext;
  events: KeystrokeEvent[];
  finalizeSession?: TypingSessionInput;
}

export interface ProcessKeystrokeBatchResult {
  bufferedEvents: number;
  savedSession?: SessionSummaryResponse;
}
