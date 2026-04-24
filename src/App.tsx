import { startTransition, useEffect, useState } from "react";
import { AnalyticsView } from "./components/AnalyticsView";
import { LibraryView } from "./components/LibraryView";
import { ReaderView } from "./components/ReaderView";
import { SettingsView } from "./components/SettingsView";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { demoAnalytics, demoBook, demoSettings } from "./lib/demo";
import { api } from "./lib/tauri";
import { applyTheme, themeMap } from "./theme";
import { useAppStore } from "./store/app-store";
import type { AppSettings, InteractionMode, ParsedBook, TypingSessionInput } from "./types";

export default function App() {
  const {
    activeTab,
    books,
    currentBook,
    selectedBookId,
    selectedChapterIndex,
    readerMode,
    interactionMode,
    settings,
    analytics,
    desktopReady,
    setDesktopReady,
    setActiveTab,
    setBooks,
    setCurrentBook,
    setSelectedBookId,
    setSelectedChapterIndex,
    setReaderMode,
    setInteractionMode,
    setSettings,
    setAnalytics,
  } = useAppStore();

  const [loadingBook, setLoadingBook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ready = api.isDesktop();
    setDesktopReady(ready);

    if (!ready) {
      setBooks([demoBook]);
      setCurrentBook(demoBook);
      setSelectedBookId(demoBook.id);
      setSelectedChapterIndex(demoBook.currentChapter);
      setSettings(demoSettings);
      setAnalytics(demoAnalytics);
      return;
    }

    void refreshAll();
  }, []);

  useEffect(() => {
    if (settings) {
      applyTheme(settings);
    }
  }, [settings]);

  async function refreshAll() {
    try {
      const [bookList, nextSettings, nextAnalytics] = await Promise.all([
        api.listBooks(),
        api.getSettings(),
        api.getAnalytics(),
      ]);
      startTransition(() => {
        setBooks(bookList);
        setSettings(nextSettings);
        setAnalytics(nextAnalytics);
      });

      const bookToLoad = selectedBookId ?? bookList[0]?.id;
      if (bookToLoad) {
        await loadBook(bookToLoad);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load application state.");
    }
  }

  async function loadBook(bookId: number) {
    if (!desktopReady) {
      const demo = bookId === demoBook.id ? demoBook : null;
      if (demo) {
        setCurrentBook(demo);
        setSelectedBookId(demo.id);
        setSelectedChapterIndex(demo.currentChapter);
      }
      return;
    }

    try {
      setLoadingBook(true);
      const book = await api.loadBook(bookId);
      startTransition(() => {
        setCurrentBook(book as ParsedBook);
        setSelectedBookId(book.id);
        setSelectedChapterIndex(book.currentChapter);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load book.");
    } finally {
      setLoadingBook(false);
    }
  }

  async function handleImportBooks() {
    try {
      setError(null);
      if (!desktopReady) {
        return;
      }
      await api.importBooks();
      await refreshAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to import books.");
    }
  }

  async function handleSettingsChange(nextSettings: AppSettings) {
    setSettings(nextSettings);
    if (!desktopReady) {
      return;
    }
    try {
      const saved = await api.saveSettings(nextSettings);
      setSettings(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save settings.");
    }
  }

  async function handleProgress(bookId: number, currentIndex: number, currentChapter: number) {
    if (!desktopReady) {
      return;
    }
    try {
      await api.updateProgress(bookId, currentIndex, currentChapter);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save progress.");
    }
  }

  async function handleSaveSession(session: TypingSessionInput) {
    if (!desktopReady) {
      return;
    }
    try {
      await api.saveSession(session);
      const refreshed = await api.getAnalytics();
      setAnalytics(refreshed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save typing session.");
    }
  }

  function handleStartMode(mode: InteractionMode) {
    setActiveTab("library");
    setInteractionMode(mode);
  }

  const theme = settings ? themeMap[settings.theme] : themeMap["catppuccin-macchiato"];

  return (
    <div
      className="min-h-screen bg-[var(--bg)] px-4 py-4 text-[var(--text)] md:px-6 md:py-6"
      style={{
        backgroundImage: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 28%), radial-gradient(circle at bottom right, ${theme.panelSoft}, transparent 24%)`,
      }}
    >
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <Card className="overflow-hidden p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">BookTyper</p>
            <h1 className="mt-4 text-4xl font-semibold">A deliberate typing and reading workstation.</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              Import long-form text, choose a chapter, and either read it cleanly or type through it with loose anchors,
              live analytics, and persistent progress.
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <TabButton active={activeTab === "library"} onClick={() => setActiveTab("library")}>
                  Library
                </TabButton>
                <TabButton active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")}>
                  Analytics
                </TabButton>
                <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
                  Settings
                </TabButton>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => handleStartMode("read")} disabled={!currentBook}>
                  Read
                </Button>
                <Button onClick={() => handleStartMode("type")} disabled={!currentBook}>
                  Type
                </Button>
              </div>
            </div>
          </Card>
        </header>

        {error && (
          <Card className="border-[var(--danger)] bg-[color-mix(in_oklab,var(--panel)_90%,var(--danger))] px-4 py-3">
            <p className="text-sm text-white">{error}</p>
          </Card>
        )}

        {activeTab === "library" && (
          <div className="space-y-6">
            <LibraryView
              books={books}
              currentBook={currentBook}
              selectedBookId={selectedBookId}
              loadingBook={loadingBook}
              desktopReady={desktopReady}
              onImportBooks={handleImportBooks}
              onSelectBook={(bookId) => {
                setError(null);
                void loadBook(bookId);
              }}
              onStartMode={handleStartMode}
              onSelectChapter={setSelectedChapterIndex}
              selectedChapterIndex={selectedChapterIndex}
            />

            {currentBook && settings && (
              <ReaderView
                book={currentBook}
                chapterIndex={selectedChapterIndex}
                readerMode={readerMode}
                interactionMode={interactionMode}
                settings={settings}
                desktopReady={desktopReady}
                onChapterChange={setSelectedChapterIndex}
                onReaderModeChange={setReaderMode}
                onInteractionModeChange={setInteractionMode}
                onProgress={handleProgress}
                onSaveSession={handleSaveSession}
              />
            )}
          </div>
        )}

        {activeTab === "analytics" && <AnalyticsView analytics={analytics} />}
        {activeTab === "settings" && settings && <SettingsView settings={settings} onChange={handleSettingsChange} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-[var(--accent)] text-black" : "bg-[var(--panel-soft)] text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}
