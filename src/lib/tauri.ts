import { invoke } from "@tauri-apps/api/core";
import type { AnalyticsSummary, AppSettings, ParsedBook, BookRecord, TypingSessionInput } from "../types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isDesktop() {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__ !== "undefined";
}

async function call<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new Error("Desktop backend is unavailable. Run the application through Tauri to access local files.");
  }
  return invoke<T>(command, payload);
}

export const api = {
  isDesktop,
  importBooks: () => call<BookRecord[]>("import_books"),
  listBooks: () => call<BookRecord[]>("list_books"),
  loadBook: (bookId: number) => call<ParsedBook>("load_book", { bookId }),
  updateProgress: (bookId: number, currentIndex: number, currentChapter: number) =>
    call<void>("update_progress", { bookId, currentIndex, currentChapter }),
  saveSession: (session: TypingSessionInput) => call<void>("save_session", { session }),
  getAnalytics: () => call<AnalyticsSummary>("get_analytics"),
  getSettings: () => call<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => call<AppSettings>("save_settings", { settings }),
};
