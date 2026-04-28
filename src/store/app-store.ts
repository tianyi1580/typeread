import { create } from "zustand";
import {
  APP_FONTS,
  INTERACTION_MODES,
  KEYBOARD_LAYOUT_IDS,
  PRACTICE_WORD_BANK_TYPES,
  READER_MODES,
  THEME_NAMES,
  TYPE_TEST_DURATIONS,
} from "../types";
import type { ActiveTab, AnalyticsSummary, AppSettings, BookRecord, InteractionMode, ParsedBook, ReaderMode } from "../types";

interface AppState {
  activeTab: ActiveTab;
  books: BookRecord[];
  currentBook: ParsedBook | null;
  selectedBookId: number | null;
  selectedChapterIndex: number;
  readerMode: ReaderMode;
  interactionMode: InteractionMode;
  settings: AppSettings;
  analytics: AnalyticsSummary | null;
  chapterProgress: Record<string, number>;
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
  setChapterProgress: (bookId: number, chapterIndex: number, index: number) => void;
  clearChapterProgress: () => void;
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
  successColor: "#a6da95",
};

function isOneOf<T extends string | number>(value: unknown, allowedValues: readonly T[]): value is T {
  return allowedValues.some((allowedValue) => allowedValue === value);
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const s = settings || defaultSettings;

  return {
    ...defaultSettings,
    ...s,
    theme: isOneOf(s.theme, THEME_NAMES) ? s.theme : defaultSettings.theme,
    font: isOneOf(s.font, APP_FONTS) ? s.font : defaultSettings.font,
    readerMode: isOneOf(s.readerMode, READER_MODES) ? s.readerMode : defaultSettings.readerMode,
    interactionMode: isOneOf(s.interactionMode, INTERACTION_MODES) ? s.interactionMode : defaultSettings.interactionMode,
    keyboardLayout: isOneOf(s.keyboardLayout, KEYBOARD_LAYOUT_IDS) ? s.keyboardLayout : defaultSettings.keyboardLayout,
    typeTestDuration: isOneOf(s.typeTestDuration, TYPE_TEST_DURATIONS)
      ? s.typeTestDuration
      : defaultSettings.typeTestDuration,
    practiceWordBankType: isOneOf(s.practiceWordBankType, PRACTICE_WORD_BANK_TYPES)
      ? s.practiceWordBankType
      : defaultSettings.practiceWordBankType,

    // Numeric bounds and types
    baseFontSize: typeof s.baseFontSize === "number" && s.baseFontSize >= 8 && s.baseFontSize <= 72
      ? s.baseFontSize
      : defaultSettings.baseFontSize,
    lineHeight: typeof s.lineHeight === "number" && s.lineHeight >= 1 && s.lineHeight <= 3
      ? s.lineHeight
      : defaultSettings.lineHeight,
    versusBotCpm: typeof s.versusBotCpm === "number" && s.versusBotCpm >= 10 && s.versusBotCpm <= 2000
      ? s.versusBotCpm
      : defaultSettings.versusBotCpm,

    // Boolean flags
    tabToSkip: typeof s.tabToSkip === "boolean" ? s.tabToSkip : defaultSettings.tabToSkip,
    ignoreQuotationMarks:
      typeof s.ignoreQuotationMarks === "boolean" ? s.ignoreQuotationMarks : defaultSettings.ignoreQuotationMarks,
    focusMode: typeof s.focusMode === "boolean" ? s.focusMode : defaultSettings.focusMode,
    smoothCaret: typeof s.smoothCaret === "boolean" ? s.smoothCaret : defaultSettings.smoothCaret,

    // String fields
    customKeyboardLayout: typeof s.customKeyboardLayout === "string" ? s.customKeyboardLayout : defaultSettings.customKeyboardLayout,
    ignoredCharacters: typeof s.ignoredCharacters === "string" ? s.ignoredCharacters : defaultSettings.ignoredCharacters,
    errorColor:
      typeof s.errorColor === "string" && /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(s.errorColor)
        ? s.errorColor
        : defaultSettings.errorColor,
    successColor:
      typeof s.successColor === "string" && /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(s.successColor)
        ? s.successColor
        : defaultSettings.successColor,
  };
}

const initialSettings = normalizeAppSettings(defaultSettings);

export const useAppStore = create<AppState>((set) => ({
  activeTab: "library",
  books: [],
  currentBook: null,
  selectedBookId: null,
  selectedChapterIndex: 0,
  readerMode: initialSettings.readerMode,
  interactionMode: initialSettings.interactionMode,
  settings: initialSettings,
  analytics: null,
  chapterProgress: {},
  desktopReady: false,
  setDesktopReady: (desktopReady) => set({ desktopReady }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setBooks: (books) => set({ books }),
  setCurrentBook: (currentBook) => set({ currentBook }),
  setSelectedBookId: (selectedBookId) => set({ selectedBookId }),
  setSelectedChapterIndex: (selectedChapterIndex) => set({ selectedChapterIndex: Math.max(0, selectedChapterIndex) }),
  setReaderMode: (readerMode) =>
    set((state) => {
      const validMode = isOneOf(readerMode, READER_MODES) ? readerMode : defaultSettings.readerMode;
      return {
        readerMode: validMode,
        settings: {
          ...state.settings,
          readerMode: validMode,
        },
      };
    }),
  setInteractionMode: (interactionMode) =>
    set((state) => {
      const validMode = isOneOf(interactionMode, INTERACTION_MODES) ? interactionMode : defaultSettings.interactionMode;
      return {
        interactionMode: validMode,
        settings: {
          ...state.settings,
          interactionMode: validMode,
        },
      };
    }),
  setSettings: (settings) => {
    const normalizedSettings = normalizeAppSettings(settings);
    return set({
      settings: normalizedSettings,
      readerMode: normalizedSettings.readerMode,
      interactionMode: normalizedSettings.interactionMode,
    });
  },
  setAnalytics: (analytics) => set({ analytics }),
  setChapterProgress: (bookId, chapterIndex, index) =>
    set((state) => ({
      chapterProgress: {
        ...state.chapterProgress,
        [`${bookId}-${Math.max(0, chapterIndex)}`]: Math.max(0, index),
      },
    })),
  clearChapterProgress: () => set({ chapterProgress: {} }),
}));
