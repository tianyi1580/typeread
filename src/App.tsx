import { startTransition, type ReactNode, useEffect, useMemo, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AchievementsView } from "./components/AchievementsView";
import { AnalyticsView } from "./components/AnalyticsView";
import { LibraryView } from "./components/LibraryView";
import { PracticeView } from "./components/PracticeView";
import { ReaderView } from "./components/ReaderView";
import { SettingsView } from "./components/SettingsView";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { demoAnalytics, demoBook, demoSettings } from "./lib/demo";
import { api } from "./lib/tauri";
import { cn } from "./lib/utils";
import { applyTheme, themeMap } from "./theme";
import { useAppStore } from "./store/app-store";
import type { ActiveTab, AppSettings, ParsedBook, ProcessKeystrokeBatchInput, ProcessKeystrokeBatchResult } from "./types";

export default function App() {
  const activeTab = useAppStore((state) => state.activeTab);
  const books = useAppStore((state) => state.books);
  const currentBook = useAppStore((state) => state.currentBook);
  const selectedBookId = useAppStore((state) => state.selectedBookId);
  const selectedChapterIndex = useAppStore((state) => state.selectedChapterIndex);
  const readerMode = useAppStore((state) => state.readerMode);
  const interactionMode = useAppStore((state) => state.interactionMode);
  const settings = useAppStore((state) => state.settings);
  const analytics = useAppStore((state) => state.analytics);
  const desktopReady = useAppStore((state) => state.desktopReady);

  const setDesktopReady = useAppStore((state) => state.setDesktopReady);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setBooks = useAppStore((state) => state.setBooks);
  const setCurrentBook = useAppStore((state) => state.setCurrentBook);
  const setSelectedBookId = useAppStore((state) => state.setSelectedBookId);
  const setSelectedChapterIndex = useAppStore((state) => state.setSelectedChapterIndex);
  const setInteractionMode = useAppStore((state) => state.setInteractionMode);
  const setSettings = useAppStore((state) => state.setSettings);
  const setAnalytics = useAppStore((state) => state.setAnalytics);

  const [loadingBook, setLoadingBook] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingFiles, setDraggingFiles] = useState(false);
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

  useEffect(() => {
    if (!desktopReady) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled) {
          return;
        }

        if (event.payload.type === "over") {
          setDraggingFiles(true);
          return;
        }

        if (event.payload.type === "drop") {
          setDraggingFiles(false);
          void handleImportBookPaths(event.payload.paths);
          return;
        }

        setDraggingFiles(false);
      })
      .then((listener) => {
        unlisten = listener;
      })
      .catch(() => {
        setDraggingFiles(false);
      });

    return () => {
      cancelled = true;
      setDraggingFiles(false);
      unlisten?.();
    };
  }, [desktopReady]);

  const theme = settings ? themeMap[settings.theme] : themeMap["catppuccin-macchiato"];
  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return books;
    }

    return books.filter((book) =>
      [book.title, book.author ?? "", book.path, book.format].some((value) => value.toLowerCase().includes(query)),
    );
  }, [books, searchQuery]);

  async function refreshAll(preferredBookId?: number | null) {
    try {
      setError(null);
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

      const bookToLoad = preferredBookId ?? selectedBookId ?? bookList[0]?.id ?? null;
      if (bookToLoad) {
        await loadBook(bookToLoad, false);
      } else {
        setCurrentBook(null);
        setSelectedBookId(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load application state.");
    }
  }

  async function loadBook(bookId: number, switchToReader = true) {
    setSelectedBookId(bookId);
    if (switchToReader) {
      setActiveTab("reader");
    }

    if (!desktopReady) {
      if (bookId === demoBook.id) {
        setCurrentBook(demoBook);
        setSelectedChapterIndex(demoBook.currentChapter);
      }
      return;
    }

    try {
      setError(null);
      setLoadingBook(true);
      const book = await api.loadBook(bookId);
      startTransition(() => {
        setCurrentBook(book as ParsedBook);
        setSelectedBookId(book.id);
        setSelectedChapterIndex(book.currentChapter);
      });
    } catch (caught) {
      setActiveTab("library");
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
      setBusyAction("Importing books…");
      await api.importBooks();
      await refreshAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to import books.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportBookPaths(paths: string[]) {
    try {
      setError(null);
      if (!desktopReady || paths.length === 0) {
        return;
      }
      setBusyAction("Importing dropped books…");
      await api.importBookPaths(paths);
      await refreshAll();
      setActiveTab("library");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to import dropped books.");
    } finally {
      setBusyAction(null);
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

  async function handleProcessBatch(payload: ProcessKeystrokeBatchInput): Promise<ProcessKeystrokeBatchResult> {
    if (!desktopReady) {
      return {
        bufferedEvents: payload.events.length,
      };
    }

    try {
      const result = await api.processKeystrokeBatch(payload);
      if (result.savedSession) {
        const [bookList, nextAnalytics] = await Promise.all([api.listBooks(), api.getAnalytics()]);
        startTransition(() => {
          setBooks(bookList);
          setAnalytics(nextAnalytics);
        });
      }
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to process typing analytics.";
      setError(message);
      throw caught;
    }
  }

  async function handleRenameBook(bookId: number, title: string) {
    try {
      setError(null);
      await api.renameBook(bookId, title);
      await refreshAll(bookId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to rename book.");
    }
  }

  async function handleTogglePinned(bookId: number, pinned: boolean) {
    try {
      setError(null);
      await api.setBookPinned(bookId, pinned);
      await refreshAll(bookId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update pinned state.");
    }
  }

  async function handleDeleteBook(bookId: number) {
    const book = books.find((item) => item.id === bookId);
    if (!book || !window.confirm(`Delete "${book.title}" from the library? This also removes its typing sessions.`)) {
      return;
    }

    try {
      setError(null);
      await api.deleteBook(bookId);
      const nextSelected = selectedBookId === bookId ? null : selectedBookId;
      if (selectedBookId === bookId) {
        setCurrentBook(null);
        setActiveTab("library");
      }
      await refreshAll(nextSelected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete book.");
    }
  }

  async function handleExportDatabase() {
    try {
      setError(null);
      setBusyAction("Exporting database…");
      await api.exportDatabase();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to export the database.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportDatabase() {
    try {
      setError(null);
      setBusyAction("Importing database…");
      await api.importDatabase();
      await refreshAll();
      setActiveTab("library");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to import the database.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClearSessionHistory() {
    if (!window.confirm("Clear all typing session history while keeping the library intact?")) {
      return;
    }

    try {
      setError(null);
      setBusyAction("Clearing session history…");
      await api.clearSessionHistory();
      await refreshAll(selectedBookId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to clear session history.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteLibrary() {
    if (!window.confirm("Delete the full library and all session history? This is destructive.")) {
      return;
    }

    try {
      setError(null);
      setBusyAction("Deleting library…");
      await api.deleteLibrary();
      setCurrentBook(null);
      setSelectedBookId(null);
      setSelectedChapterIndex(0);
      setActiveTab("library");
      await refreshAll(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete the library.");
    } finally {
      setBusyAction(null);
    }
  }


  const showWindowShell = activeTab !== "reader";

  return (
    <div
      className={cn(
        "bg-[var(--bg)] text-[var(--text)] transition-colors duration-500",
        activeTab === "reader" && readerMode === "spread" ? "flex h-screen flex-col overflow-hidden" : "min-h-screen",
      )}
      style={{
        backgroundImage: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 26%), radial-gradient(circle at bottom right, ${theme.panelSoft}, transparent 22%)`,
      }}
    >
      <div
        className={cn(
          activeTab === "reader" && readerMode === "spread"
            ? "flex h-full flex-col overflow-hidden"
            : "min-h-screen px-4 py-4 md:px-6 md:py-6",
        )}
      >
        {showWindowShell && (
          <WindowShell
            activeTab={activeTab}
            busyAction={busyAction}
            error={error}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen((current) => !current)}
            onCloseMenu={() => setMenuOpen(false)}
            onOpenTab={(tab) => {
              setActiveTab(tab);
              setMenuOpen(false);
            }}
            onOpenSettings={() => {
              setSettingsOpen(true);
              setMenuOpen(false);
            }}
            onBackToLibrary={() => {
              setActiveTab("library");
              setSearchQuery("");
            }}
          />
        )}

        <main className={cn("relative", showWindowShell || readerMode === "scroll" ? "mx-auto mt-5 max-w-[1480px]" : "flex h-full flex-col overflow-hidden")}>
          {activeTab === "library" && (
            <LibraryView
              books={filteredBooks}
              loadingBook={loadingBook}
              desktopReady={desktopReady}
              draggingFiles={draggingFiles}
              searchQuery={searchQuery}
              themeName={settings?.theme ?? "catppuccin-macchiato"}
              onImportBooks={handleImportBooks}
              onOpenBook={(bookId) => void loadBook(bookId, true)}
              onRenameBook={handleRenameBook}
              onTogglePinned={handleTogglePinned}
              onDeleteBook={handleDeleteBook}
            />
          )}

          {activeTab === "analytics" && <AnalyticsView analytics={analytics} settings={settings} />}

          {activeTab === "achievements" && <AchievementsView earnedAwards={analytics?.achievements ?? []} />}

          {(activeTab === "type-test" || activeTab === "versus") && settings && (
            <PracticeView
              mode={activeTab}
              settings={settings}
              analytics={analytics}
              desktopReady={desktopReady}
              processBatch={handleProcessBatch}
              onSettingsChange={handleSettingsChange}
              onOpenSettings={() => setSettingsOpen(true)}
              onBackToLibrary={() => setActiveTab("library")}
              onError={(message) => setError(message)}
            />
          )}

          {activeTab === "reader" && currentBook && settings && (
            <ReaderView
              book={currentBook}
              chapterIndex={selectedChapterIndex}
              readerMode={readerMode}
              interactionMode={interactionMode}
              settings={settings}
              analytics={analytics}
              desktopReady={desktopReady}
              loadingBook={loadingBook}
              onBackToLibrary={() => setActiveTab("library")}
              onChapterChange={setSelectedChapterIndex}
              onInteractionModeChange={setInteractionMode}
              onOpenSettings={() => setSettingsOpen(true)}
              onProgress={handleProgress}
              onProcessBatch={handleProcessBatch}
              onError={(message) => setError(message)}
            />
          )}

          {activeTab === "reader" && !currentBook && (
            <Card className="mx-auto max-w-3xl p-10 text-center">
              <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-muted)]">Reader</p>
              <h2 className="mt-4 text-3xl font-semibold">Pick a book from the library first.</h2>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                The reader no longer pretends it can exist without actual content. Start in the library, then open a book.
              </p>
              <Button className="mt-6" onClick={() => setActiveTab("library")}>
                Back to Library
              </Button>
            </Card>
          )}
        </main>
      </div>

      {settings && (
        <SettingsView
          isOpen={settingsOpen}
          settings={settings}
          profile={analytics?.profile ?? null}
          desktopReady={desktopReady}
          onClose={() => setSettingsOpen(false)}
          onChange={handleSettingsChange}
          onExportDatabase={() => void handleExportDatabase()}
          onImportDatabase={() => void handleImportDatabase()}
          onClearSessionHistory={() => void handleClearSessionHistory()}
          onDeleteLibrary={() => void handleDeleteLibrary()}
        />
      )}
    </div>
  );
}

interface WindowShellProps {
  activeTab: ActiveTab;
  busyAction: string | null;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenTab: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  onBackToLibrary: () => void;
}

function WindowShell({
  activeTab,
  busyAction,
  error,
  searchQuery,
  setSearchQuery,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenTab,
  onOpenSettings,
  onBackToLibrary,
}: WindowShellProps) {
  const labelMap: Record<Exclude<ActiveTab, "library">, string> = {
    reader: "Reader",
    analytics: "Profile & Analytics",
    achievements: "Achievements",
    "type-test": "Type Test",
    versus: "Versus Mode",
  };

  return (
    <div className="mx-auto max-w-[1480px] space-y-4">
      <div className="relative z-20 rounded-[30px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_86%,transparent)] px-4 py-3 shadow-panel backdrop-blur-2xl">
        <div data-tauri-drag-region className="absolute inset-0" />
        <div className="relative z-10 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_220px] md:items-center">
          <div className="flex items-center gap-3">
            {activeTab !== "library" ? (
              <Button variant="ghost" className="rounded-full px-3 py-2" onClick={onBackToLibrary}>
                Back to Library
              </Button>
            ) : (
              <div className="pl-3 text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">TypeRead</div>
            )}
          </div>

          {activeTab === "library" ? (
            <label className="mx-auto flex w-full max-w-[640px] items-center gap-3 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_78%,transparent)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <span className="text-[var(--text-muted)]">Search</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find books by title, author, or file type"
                className="w-full bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
          ) : (
            <div className="flex items-center justify-center">
              <p className="text-sm font-medium text-[var(--text-muted)]">{labelMap[activeTab]}</p>
            </div>
          )}

          <div className="relative flex items-center justify-end gap-2">
            {busyAction && <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{busyAction}</span>}
            <button
              type="button"
              onClick={onToggleMenu}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_80%,transparent)] text-lg text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              ≡
            </button>

            {menuOpen && (
              <>
                <button type="button" aria-label="Close menu" className="fixed inset-0" onClick={onCloseMenu} />
                <div className="absolute right-0 top-12 z-30 min-w-[240px] rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-2 shadow-panel backdrop-blur-xl">
                  <MenuButton onClick={() => onOpenTab("library")}>Library</MenuButton>
                  <MenuButton onClick={() => onOpenTab("analytics")}>Profile & Analytics</MenuButton>
                  <MenuButton onClick={() => onOpenTab("achievements")}>Achievements</MenuButton>
                  <MenuButton onClick={() => onOpenTab("type-test")}>Type Test</MenuButton>
                  <MenuButton onClick={() => onOpenTab("versus")}>Versus Mode</MenuButton>
                  <MenuButton onClick={onOpenSettings}>Settings</MenuButton>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-[var(--danger)] bg-[color-mix(in_srgb,var(--panel)_90%,var(--danger)_10%)] px-4 py-3">
          <p className="text-sm text-[var(--text)]">{error}</p>
        </Card>
      )}
    </div>
  );
}

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center rounded-[18px] px-4 py-3 text-left text-sm text-[var(--text)] transition hover:bg-[var(--accent-soft)]"
    >
      {children}
    </button>
  );
}
