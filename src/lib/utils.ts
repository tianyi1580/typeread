import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * 
 * @param inputs - Class names or conditional class objects.
 * @returns The merged class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats seconds into a HH:MM:SS or MM:SS string.
 * 
 * @param totalSeconds - Total seconds.
 * @returns Formatted time string.
 */
export function formatDuration(totalSeconds: number) {
  const roundedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Formats a number as a percentage string.
 * 
 * @param value - The value.
 * @returns Formatted percentage string.
 */
export function formatPercent(value: number) {
  if (isNaN(value)) {
    return "0.0%";
  }
  return `${value.toFixed(1)}%`;
}

/**
 * Clamps a number between a minimum and maximum value.
 * 
 * @param value - The value to clamp.
 * @param min - The minimum allowed value.
 * @param max - The maximum allowed value.
 * @returns The clamped value.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

