import type { ProfileProgress, UnlockState } from "../types";

export const LEVEL_REWARDS = [
  { level: 5, label: "Dracula and Nord themes unlocked" },
  { level: 10, label: "Smooth caret unlocked" },
  { level: 15, label: "Premium typography unlocked" },
  { level: 25, label: "Ghost pacer unlocked" },
  { level: 50, label: "Custom error colors unlocked" },
] as const;

export function xpThresholdForLevel(level: number) {
  if (level <= 1) {
    return 0;
  }

  return Math.round(1000 * Math.pow(level, 1.5));
}

export function levelFromXp(totalXp: number) {
  let level = 1;
  while (xpThresholdForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

export function titleForLevel(level: number) {
  if (level >= 100) {
    return "Grandmaster";
  }
  if (level >= 50) {
    return "Lexicon";
  }
  if (level >= 25) {
    return "Archivist";
  }
  if (level >= 10) {
    return "Scribe";
  }
  return "Initiate";
}

export function unlocksForLevel(level: number): UnlockState {
  return {
    draculaTheme: level >= 5,
    nordTheme: level >= 5,
    smoothCaret: level >= 10,
    premiumTypography: level >= 15,
    ghostPacer: level >= 25,
    customErrorColors: level >= 50,
  };
}

export function buildProfileProgress(totalXp: number, streakDays: number, restedWordsAvailable: number): ProfileProgress {
  const level = levelFromXp(totalXp);
  const currentLevelXp = xpThresholdForLevel(level);
  const nextLevelXp = xpThresholdForLevel(level + 1);

  return {
    totalXp,
    level,
    title: titleForLevel(level),
    currentLevelXp,
    nextLevelXp,
    progressToNextLevel: nextLevelXp <= currentLevelXp ? 1 : (totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp),
    streakDays,
    restedWordsAvailable,
    unlocks: unlocksForLevel(level),
  };
}

export function rewardMessagesForLevelRange(levelBefore: number, levelAfter: number) {
  return LEVEL_REWARDS.filter((reward) => reward.level > levelBefore && reward.level <= levelAfter).map((reward) => reward.label);
}
