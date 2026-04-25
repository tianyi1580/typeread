import type { AnalyticsSummary, AppSettings, ParsedBook } from "../types";
import { buildProfileProgress } from "./progression";

export const demoSettings: AppSettings = {
  theme: "sepia",
  font: "jetbrains-mono",
  readerMode: "scroll",
  interactionMode: "type",
  baseFontSize: 19,
  lineHeight: 1.75,
  enterToSkip: true,
  ignoreQuotationMarks: false,
  ignoredCharacters: `"\"", "'", "“", "”", "‘", "’"`,
  focusMode: true,
  keyboardLayout: "qwerty-us",
  customKeyboardLayout: "",
  smoothCaret: false,
  typeTestDuration: 60,
  versusBotCpm: 300,
  errorColor: "#aa3d2b",
};

const demoText = `Chapter One

TypeRead exists to turn passive reading into measurable, repeatable practice. The point is not to gamify every keystroke. The point is to make long-form text usable again for deliberate work.

You import a real book. You choose a chapter. You either read it cleanly or type through it with loose anchors that let you recover from mistakes without stopping cold. That matters because friction ruins consistency.

Chapter Two

Accuracy is important, but fake accuracy is worthless. If the user skips words, those skips should not pollute the session metrics. If the user vanishes for thirty seconds, the stale tail of that session should be discarded instead of flattering them with bad data.

Chapter Three

Themes, typography, chapter chunking, and progress persistence are not decorative details. They determine whether the application feels stable enough to live in every day.`;

const chapterRanges = demoText.split(/\n\n(?=Chapter )/);

export const demoBook: ParsedBook = {
  id: 1,
  title: "TypeRead Spec Demo",
  author: "Local Preview",
  path: "/demo/design.md",
  format: "md",
  coverPath: null,
  currentIndex: 0,
  currentChapter: 0,
  totalChars: demoText.length,
  pinned: true,
  averageWpm: 64.2,
  addedAt: new Date("2026-04-24T00:00:00Z").toISOString(),
  chapters: chapterRanges.map((chapter, index) => ({
    id: `demo-${index}`,
    title: chapter.split("\n")[0] || `Chapter ${index + 1}`,
    start: 0,
    end: chapter.length,
    text: chapter,
    chunks: [
      {
        id: `demo-${index}-chunk-0`,
        start: 0,
        end: chapter.length,
        text: chapter,
      },
    ],
  })),
};

export const demoAnalytics: AnalyticsSummary = {
  totalWordsTyped: 12480,
  totalCharsTyped: 64320,
  totalTimeSeconds: 16420,
  averageWpm: 62.4,
  averageAccuracy: 96.3,
  sessions: 42,
  history: [
    { day: "2026-04-18", wpm: 54, accuracy: 93.9, sessions: 4 },
    { day: "2026-04-19", wpm: 57.2, accuracy: 95.1, sessions: 5 },
    { day: "2026-04-20", wpm: 59.6, accuracy: 95.7, sessions: 6 },
    { day: "2026-04-21", wpm: 61.3, accuracy: 96.1, sessions: 7 },
    { day: "2026-04-22", wpm: 63.9, accuracy: 96.5, sessions: 8 },
    { day: "2026-04-23", wpm: 64.5, accuracy: 97.2, sessions: 6 },
    { day: "2026-04-24", wpm: 66.1, accuracy: 96.8, sessions: 6 },
  ],
  sessionPoints: [
    {
      id: 1,
      bookId: 1,
      title: "TypeRead Spec Demo",
      source: "book",
      startTime: "2026-04-24T13:15:00.000Z",
      endTime: "2026-04-24T13:42:00.000Z",
      durationSeconds: 1620,
      wordsTyped: 1840,
      charsTyped: 9270,
      wpm: 68.1,
      accuracy: 97.4,
      xpGained: 2878,
      rhythmScore: 88,
      focusScore: 92,
    },
    {
      id: 2,
      bookId: 1,
      title: "TypeRead Spec Demo",
      source: "book",
      startTime: "2026-04-23T20:04:00.000Z",
      endTime: "2026-04-23T20:26:00.000Z",
      durationSeconds: 1320,
      wordsTyped: 1322,
      charsTyped: 6815,
      wpm: 60.1,
      accuracy: 95.9,
      xpGained: 1904,
      rhythmScore: 81,
      focusScore: 89,
    },
    {
      id: 3,
      bookId: 1,
      title: "TypeRead Spec Demo",
      source: "book",
      startTime: "2026-04-22T17:20:00.000Z",
      endTime: "2026-04-22T17:40:00.000Z",
      durationSeconds: 1200,
      wordsTyped: 1185,
      charsTyped: 6120,
      wpm: 58.4,
      accuracy: 95.1,
      xpGained: 1692,
      rhythmScore: 78,
      focusScore: 86,
    },
    {
      id: 4,
      bookId: 1,
      title: "TypeRead Spec Demo",
      source: "book",
      startTime: "2026-04-21T11:00:00.000Z",
      endTime: "2026-04-21T11:23:00.000Z",
      durationSeconds: 1380,
      wordsTyped: 1260,
      charsTyped: 6450,
      wpm: 59.7,
      accuracy: 96.1,
      xpGained: 1824,
      rhythmScore: 82,
      focusScore: 90,
    },
    {
      id: 5,
      bookId: 1,
      title: "TypeRead Spec Demo",
      source: "book",
      startTime: "2026-04-20T09:28:00.000Z",
      endTime: "2026-04-20T09:47:00.000Z",
      durationSeconds: 1140,
      wordsTyped: 980,
      charsTyped: 5180,
      wpm: 55.3,
      accuracy: 94.8,
      xpGained: 980,
      rhythmScore: 73,
      focusScore: 84,
    },
  ],
  profile: buildProfileProgress(42750, 6, 1200),
  achievements: [
    { key: "speed-30", earnedAt: "2026-04-18T10:00:00.000Z" },
    { key: "speed-50", earnedAt: "2026-04-19T10:00:00.000Z" },
    { key: "duration-5", earnedAt: "2026-04-20T10:00:00.000Z" },
    { key: "words-1000", earnedAt: "2026-04-23T10:00:00.000Z" },
    { key: "accuracy-100", earnedAt: "2026-04-24T10:00:00.000Z" },
  ],
  latestDeepAnalytics: {
    macroWpm: Array.from({ length: 24 }, (_, index) => ({
      at: 1713964500000 + index * 4000,
      value: 44 + Math.sin(index / 3) * 7 + index,
    })),
    macroAccuracy: Array.from({ length: 24 }, (_, index) => ({
      at: 1713964500000 + index * 4000,
      value: 94 + Math.cos(index / 5) * 4,
    })),
    recentWpm: Array.from({ length: 12 }, (_, index) => ({
      at: 1713964530000 + index * 2500,
      value: 60 + Math.cos(index / 2) * 5,
    })),
    confusionPairs: [
      { expected: "a", typed: "s", count: 18 },
      { expected: "o", typed: "i", count: 11 },
      { expected: "n", typed: "m", count: 9 },
      { expected: "e", typed: "r", count: 7 },
    ],
    transitions: {
      fastest: [
        { combo: "th", samples: 22, averageMs: 118, deviationMs: 18, errorRate: 0.02 },
        { combo: "st", samples: 18, averageMs: 124, deviationMs: 19, errorRate: 0.03 },
      ],
      slowest: [
        { combo: "io", samples: 11, averageMs: 246, deviationMs: 34, errorRate: 0.09 },
        { combo: "gn", samples: 9, averageMs: 238, deviationMs: 41, errorRate: 0.11 },
      ],
      errorProne: [
        { combo: "ou", samples: 8, averageMs: 210, deviationMs: 36, errorRate: 0.18 },
        { combo: "ea", samples: 12, averageMs: 202, deviationMs: 28, errorRate: 0.14 },
      ],
    },
    rhythmScore: 88,
    cadenceCv: 0.14,
    focusScore: 92,
    activeTypingSeconds: 1490,
  },
  aggregateConfusions: [
    { expected: "a", typed: "s", count: 64 },
    { expected: "o", typed: "i", count: 47 },
    { expected: "e", typed: "r", count: 34 },
    { expected: "n", typed: "m", count: 29 },
  ],
  aggregateTransitions: {
    fastest: [
      { combo: "th", samples: 122, averageMs: 116, deviationMs: 17, errorRate: 0.02 },
      { combo: "st", samples: 98, averageMs: 124, deviationMs: 21, errorRate: 0.03 },
    ],
    slowest: [
      { combo: "io", samples: 54, averageMs: 242, deviationMs: 35, errorRate: 0.08 },
      { combo: "gn", samples: 41, averageMs: 238, deviationMs: 38, errorRate: 0.1 },
    ],
    errorProne: [
      { combo: "ou", samples: 48, averageMs: 208, deviationMs: 29, errorRate: 0.17 },
      { combo: "ea", samples: 53, averageMs: 198, deviationMs: 24, errorRate: 0.13 },
    ],
  },
};
