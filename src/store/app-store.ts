import { create } from "zustand";
import type { ActiveTab, AnalyticsSummary, AppSettings, BookRecord, InteractionMode, ParsedBook, ReaderMode } from "../types";

interface AppState {
  activeTab: ActiveTab;
  books: BookRecord[];
  currentBook: ParsedBook | null;
  selectedBookId: number | null;
  selectedChapterIndex: number;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  settings: AppSettings | null;
  analytics: AnalyticsSummary | null;
  desktopReady: boolean;
  setDesktopReady: (ready: boolean) => void;
  setActiveTab: (tab: AppState["activeTab"]) => void;
  setBooks: (books: BookRecord[]) => void;
  setCurrentBook: (book: ParsedBook | null) => void;
  setSelectedBookId: (bookId: number | null) => void;
  setSelectedChapterIndex: (index: number) => void;
  setReaderMode: (mode: ReaderMode) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setSettings: (settings: AppSettings) => void;
  setAnalytics: (analytics: AnalyticsSummary | null) => void;
}

export const defaultSettings: AppSettings = {
  theme: "catppuccin-macchiato",
  font: "jetbrains-mono",
  readerMode: "scroll",
  interactionMode: "type",
  baseFontSize: 18,
  lineHeight: 1.7,
  tabToSkip: true,
  ignoreQuotationMarks: false,
  ignoredCharacters: `"\"", "'", "“", "”", "‘", "’"`,
  focusMode: true,
  keyboardLayout: "qwerty-us",
  customKeyboardLayout: "",
  smoothCaret: false,
  typeTestDuration: 60,
  versusBotCpm: 300,
  practiceWordBankType: "easy",
  errorColor: "#ed8796",
};

export const useAppStore = create<AppState>((set) => ({
  activeTab: "library",
  books: [],
  currentBook: null,
  selectedBookId: null,
  selectedChapterIndex: 0,
  readerMode: defaultSettings.readerMode,
  interactionMode: defaultSettings.interactionMode,
  settings: defaultSettings,
  analytics: null,
  desktopReady: false,
  setDesktopReady: (desktopReady) => set({ desktopReady }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setBooks: (books) => set({ books }),
  setCurrentBook: (currentBook) => set({ currentBook }),
  setSelectedBookId: (selectedBookId) => set({ selectedBookId }),
  setSelectedChapterIndex: (selectedChapterIndex) => set({ selectedChapterIndex }),
  setReaderMode: (readerMode) => set({ readerMode }),
  setInteractionMode: (interactionMode) => set({ interactionMode }),
  setSettings: (settings) =>
    set({
      settings,
      readerMode: settings.readerMode,
      interactionMode: settings.interactionMode,
    }),
  setAnalytics: (analytics) => set({ analytics }),
}));
