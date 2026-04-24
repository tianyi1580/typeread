import type { AnalyticsSummary, AppSettings, ParsedBook } from "../types";

export const demoSettings: AppSettings = {
  theme: "sepia",
  typeFont: "jetbrains-mono",
  readFont: "literata",
  readerMode: "scroll",
  interactionMode: "type",
  baseFontSize: 19,
  lineHeight: 1.75,
  enterToSkip: true,
  ignoreQuotationMarks: false,
  focusMode: true,
};

const demoText = `Chapter One

BookTyper exists to turn passive reading into measurable, repeatable practice. The point is not to gamify every keystroke. The point is to make long-form text usable again for deliberate work.

You import a real book. You choose a chapter. You either read it cleanly or type through it with loose anchors that let you recover from mistakes without stopping cold. That matters because friction ruins consistency.

Chapter Two

Accuracy is important, but fake accuracy is worthless. If the user skips words, those skips should not pollute the session metrics. If the user vanishes for thirty seconds, the stale tail of that session should be discarded instead of flattering them with bad data.

Chapter Three

Themes, typography, chapter chunking, and progress persistence are not decorative details. They determine whether the application feels stable enough to live in every day.`;

const chapterRanges = demoText.split(/\n\n(?=Chapter )/);

export const demoBook: ParsedBook = {
  id: 1,
  title: "BookTyper Spec Demo",
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
      bookTitle: "BookTyper Spec Demo",
      startTime: "2026-04-24T13:15:00.000Z",
      endTime: "2026-04-24T13:42:00.000Z",
      durationSeconds: 1620,
      wordsTyped: 1840,
      charsTyped: 9270,
      wpm: 68.1,
      accuracy: 97.4,
    },
    {
      id: 2,
      bookId: 1,
      bookTitle: "BookTyper Spec Demo",
      startTime: "2026-04-23T20:04:00.000Z",
      endTime: "2026-04-23T20:26:00.000Z",
      durationSeconds: 1320,
      wordsTyped: 1322,
      charsTyped: 6815,
      wpm: 60.1,
      accuracy: 95.9,
    },
    {
      id: 3,
      bookId: 1,
      bookTitle: "BookTyper Spec Demo",
      startTime: "2026-04-22T17:20:00.000Z",
      endTime: "2026-04-22T17:40:00.000Z",
      durationSeconds: 1200,
      wordsTyped: 1185,
      charsTyped: 6120,
      wpm: 58.4,
      accuracy: 95.1,
    },
    {
      id: 4,
      bookId: 1,
      bookTitle: "BookTyper Spec Demo",
      startTime: "2026-04-21T11:00:00.000Z",
      endTime: "2026-04-21T11:23:00.000Z",
      durationSeconds: 1380,
      wordsTyped: 1260,
      charsTyped: 6450,
      wpm: 59.7,
      accuracy: 96.1,
    },
    {
      id: 5,
      bookId: 1,
      bookTitle: "BookTyper Spec Demo",
      startTime: "2026-04-20T09:28:00.000Z",
      endTime: "2026-04-20T09:47:00.000Z",
      durationSeconds: 1140,
      wordsTyped: 980,
      charsTyped: 5180,
      wpm: 55.3,
      accuracy: 94.8,
    },
  ],
};
