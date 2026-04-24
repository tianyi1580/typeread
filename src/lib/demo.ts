import type { AnalyticsSummary, AppSettings, ParsedBook } from "../types";

export const demoSettings: AppSettings = {
  theme: "sepia",
  typeFont: "jetbrains-mono",
  readFont: "literata",
  readerMode: "scroll",
  interactionMode: "type",
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
};
