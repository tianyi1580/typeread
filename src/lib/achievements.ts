export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  category: "speed" | "endurance" | "volume" | "precision";
}

const speedThresholds = [30, 50, 70, 100, 130, 160, 200];
const durationThresholds = [1, 2, 5, 10, 15, 20, 30, 45, 60];
const totalWordThresholds = [100, 500, 1000, 5000, 10000, 50000, 100000];

export const achievementDefinitions: AchievementDefinition[] = [
  ...speedThresholds.map((threshold) => ({
    key: `speed-${threshold}`,
    name: `${threshold} WPM`,
    description: `Finish a session with an average speed of at least ${threshold} WPM.`,
    category: "speed" as const,
  })),
  ...durationThresholds.map((minutes) => ({
    key: `duration-${minutes}`,
    name: `${minutes} Minute Session`,
    description: `Stay in a single session for at least ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    category: "endurance" as const,
  })),
  ...totalWordThresholds.map((words) => ({
    key: `words-${words}`,
    name: `${words.toLocaleString()} Words`,
    description: `Type ${words.toLocaleString()} words across all sessions.`,
    category: "volume" as const,
  })),
  {
    key: "accuracy-100",
    name: "Flawless",
    description: "Finish a session with 100% accuracy.",
    category: "precision",
  },
];
