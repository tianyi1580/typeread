import type { ProfileProgress, UnlockState } from "../types";

export const LEVEL_REWARDS = [
  { level: 2, label: "Custom correct colors unlocked" },
  { level: 5, label: "Smooth caret unlocked" },
  { level: 10, label: "Dracula and Rosewood themes unlocked" },
  { level: 10, label: "Custom error colors unlocked" },
  { level: 15, label: "Nord and Mocha Blush themes unlocked" },
  { level: 15, label: "Premium typography unlocked" },
] as const;

/**
 * Calculates the total XP required to reach a specific level.
 * 
 * @param level - The level.
 * @returns The XP threshold.
 */
export function xpThresholdForLevel(level: number) {
  if (level <= 1) {
    return 0;
  }

  return Math.round(1000 * Math.pow(level, 1.5));
}

/**
 * Calculates the level from total XP.
 * 
 * @param totalXp - The total XP.
 * @returns The calculated level.
 */
export function levelFromXp(totalXp: number) {
  let level = 1;
  while (level < 10000 && xpThresholdForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

/**
 * Gets the title associated with a level.
 * 
 * @param level - The level.
 * @returns The title string.
 */
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

/**
 * Determines the features unlocked at a specific level.
 * 
 * @param level - The level.
 * @returns The UnlockState.
 */
export function unlocksForLevel(level: number): UnlockState {
  return {
    draculaTheme: level >= 10,
    nordTheme: level >= 15,
    rosewoodTheme: level >= 10,
    mochaBlushTheme: level >= 15,
    smoothCaret: level >= 5,
    premiumTypography: level >= 15,
    customSuccessColors: level >= 2,
    customErrorColors: level >= 10,
  };
}

/**
 * Builds the ProfileProgress object from raw data.
 * 
 * @param totalXp - Total XP.
 * @param streakDays - Current streak in days.
 * @param restedWordsAvailable - Rested words available.
 * @returns The ProfileProgress.
 */
export function buildProfileProgress(totalXp: number, streakDays: number, restedWordsAvailable: number): ProfileProgress {
  const level = levelFromXp(totalXp);
  const currentLevelXp = xpThresholdForLevel(level);
  const nextLevelXp = xpThresholdForLevel(level + 1);
  const progressToNextLevel =
    nextLevelXp <= currentLevelXp
      ? 1
      : Math.min(1, Math.max(0, (totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)));

  return {
    totalXp,
    level,
    title: titleForLevel(level),
    currentLevelXp,
    nextLevelXp,
    progressToNextLevel,
    streakDays,
    restedWordsAvailable,
    unlocks: unlocksForLevel(level),
  };
}

/**
 * Gets reward messages for levels gained.
 * 
 * @param levelBefore - Level before update.
 * @param levelAfter - Level after update.
 * @returns Array of reward strings.
 */
export function rewardMessagesForLevelRange(levelBefore: number, levelAfter: number) {
  return LEVEL_REWARDS.filter((reward) => reward.level > levelBefore && reward.level <= levelAfter).map((reward) => reward.label);
}

