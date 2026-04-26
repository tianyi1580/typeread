import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  AnalyticsSummary,
  AppSettings,
  BookRecord,
  ParsedBook,
  ProcessKeystrokeBatchInput,
  ProcessKeystrokeBatchResult,
  TypingSessionInput,
} from "../types";

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
  assetUrl: (path: string | null) => (path && isDesktop() ? convertFileSrc(path) : null),
  importBooks: () => call<BookRecord[]>("import_books"),
  importBookPaths: (paths: string[]) => call<BookRecord[]>("import_book_paths", { paths }),
  listBooks: () => call<BookRecord[]>("list_books"),
  loadBook: (bookId: number) => call<ParsedBook>("load_book", { bookId }),
  updateProgress: (bookId: number, currentIndex: number, currentChapter: number) =>
    call<void>("update_progress", { bookId, currentIndex, currentChapter }),
  renameBook: (bookId: number, title: string) => call<void>("rename_book", { bookId, title }),
  setBookPinned: (bookId: number, pinned: boolean) => call<void>("set_book_pinned", { bookId, pinned }),
  deleteBook: (bookId: number) => call<void>("delete_book", { bookId }),
  saveSession: (session: TypingSessionInput) => call<void>("save_session", { session }),
  processKeystrokeBatch: (payload: ProcessKeystrokeBatchInput) =>
    call<ProcessKeystrokeBatchResult>("process_keystroke_batch", { payload }),
  getAnalytics: () => call<AnalyticsSummary>("get_analytics"),
  getSettings: () => call<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => call<AppSettings>("save_settings", { settings }),
  exportDatabase: () => call<void>("export_database"),
  importDatabase: () => call<void>("import_database"),
  clearSessionHistory: () => call<void>("clear_session_history"),
  deleteLibrary: () => call<void>("delete_library"),
  gainOneLevel: () => call<void>("gain_one_level"),
};
