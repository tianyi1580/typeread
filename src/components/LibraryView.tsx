import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { api } from "../lib/tauri";
import { themeMap } from "../theme";
import { cn } from "../lib/utils";
import type { BookRecord, ThemeName } from "../types";

/**
 * Properties for the LibraryView component.
 */
interface LibraryViewProps {
  /** List of books in the library. */
  books: BookRecord[];
  /** ID of the book currently loading. */
  loadingBookId: number | null;
  /** Whether the desktop environment is ready. */
  desktopReady: boolean;
  /** Whether files are being dragged over the window. */
  draggingFiles: boolean;
  /** List of file paths currently being imported. */
  pendingImports: string[];
  /** Current search query filter. */
  searchQuery: string;
  /** Name of the active theme. */
  themeName: ThemeName;
  /** Callback to trigger book import. */
  onImportBooks: () => void;
  /** Callback to open a book. */
  onOpenBook: (bookId: number) => void;
  /** Callback to rename a book. */
  onRenameBook: (bookId: number, title: string) => Promise<void>;
  /** Callback to update a book's cover image. */
  onUpdateCover: (bookId: number, imageDataBase64: string) => Promise<void>;
  /** Callback to pin/unpin a book. */
  onTogglePinned: (bookId: number, pinned: boolean) => Promise<void>;
  /** Callback to delete a book. */
  onDeleteBook: (bookId: number) => Promise<void>;
}


export function LibraryView({
  books,
  loadingBookId,
  desktopReady,
  draggingFiles,
  pendingImports,
  searchQuery,
  themeName,
  onImportBooks,
  onOpenBook,
  onRenameBook,
  onUpdateCover,
  onTogglePinned,
  onDeleteBook,
}: LibraryViewProps) {
  const theme = themeMap[themeName];
  const [menuBookId, setMenuBookId] = useState<number | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [coverEditingBook, setCoverEditingBook] = useState<BookRecord | null>(null);
  const [showCoverManager, setShowCoverManager] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const normalizedSearchQuery = searchQuery.trim();

  useEffect(() => {
    if (menuBookId === null) {
      return;
    }

    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuBookId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuBookId(null);
      }
    };

    const timeout = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuBookId]);

  const emptyState = books.length === 0 && normalizedSearchQuery.length === 0;

  async function submitRename() {
    if (!editingBook) {
      return;
    }

    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === editingBook.title) {
      setEditingBook(null);
      return;
    }

    try {
      await onRenameBook(editingBook.id, nextTitle);
      setEditingBook(null);
    } catch {
      // App already surfaces the failure; keep the modal open so the user can retry.
    }
  }

  return (
    <>
      <div>
        <Card className="overflow-hidden p-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Library</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight">
                Manage your books and track your progress.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
                Search, pin, and organize your collection. Click a book to resume typing exactly where you left off.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={onImportBooks} disabled={!desktopReady}>
                Import Books
              </Button>
              <button
                type="button"
                id="tutorial-tips-btn-header"
                onClick={() => setShowTips(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                title="Library Tips"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </button>
            </div>
          </div>
        </Card>
      </div>

      {!desktopReady && (
        <Card className="mt-5 border-[var(--border)] px-5 py-4">
          <p className="text-sm text-[var(--text-muted)]">
            Browser preview mode can show the redesigned shell, but import dialogs, drag and drop, and persistence only work in the Tauri app.
          </p>
        </Card>
      )}

      <div className="mt-5">
        {emptyState ? (
          <EmptyLibraryState
            draggingFiles={draggingFiles}
            desktopReady={desktopReady}
            onImportBooks={onImportBooks}
            onShowTips={() => setShowTips(true)}
          />
        ) : books.length === 0 && normalizedSearchQuery ? (
          <EmptySearchState query={normalizedSearchQuery} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {books.map((book) => {
              const typeProgress = progressForBook(book, "type");
              const readProgress = progressForBook(book, "read");

              return (
                <article
                  key={book.id}
                  className="group relative isolate overflow-hidden rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-[var(--accent)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--bg)] [transform:translateZ(0)] [-webkit-mask-image:-webkit-radial-gradient(white,black)]"
                >
                  {/* Keep the primary open action separate from the action menu to avoid nested buttons. */}
                  <button
                    type="button"
                    aria-label={`Open ${book.title}`}
                    onClick={() => onOpenBook(book.id)}
                    className="absolute inset-0 z-0 rounded-[22px] focus-visible:outline-none"
                  />

                  <div className="pointer-events-none relative flex h-full flex-col overflow-hidden rounded-[22px]">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[22px] [transform:translateZ(0)] [-webkit-mask-image:-webkit-radial-gradient(white,black)]">
                      {book.coverPath ? (
                        <CoverImage path={book.coverPath} />
                      ) : (
                        <div className="relative h-full w-full overflow-hidden bg-[var(--panel-soft)]">
                          {/* Mesh Gradient Background */}
                          <div
                            className="absolute inset-0 opacity-40"
                            style={{
                              background: `
                                radial-gradient(at 0% 0%, ${theme.accent} 0px, transparent 50%),
                                radial-gradient(at 100% 0%, ${theme.accentSoft} 0px, transparent 50%),
                                radial-gradient(at 100% 100%, ${theme.accent} 0px, transparent 50%),
                                radial-gradient(at 0% 100%, ${theme.accentSoft} 0px, transparent 50%)
                              `,
                              filter: "blur(40px)",
                            }}
                          />

                          {/* Elegant Initial */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className="text-[120px] font-black leading-none opacity-10 transition-transform duration-700 group-hover:scale-110 group-hover:opacity-20"
                              style={{ color: theme.accent }}
                            >
                              {book.title.charAt(0).toUpperCase()}
                            </span>
                          </div>

                          {/* Grain Texture Overlay */}
                          <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.4))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      {loadingBookId === book.id && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg)]/50 backdrop-blur-sm">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent-soft)] border-t-[var(--accent)]" />
                        </div>
                      )}

                      <div className="absolute left-4 top-4 flex gap-2">
                        {book.pinned && (
                          <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white backdrop-blur-md">
                            Pinned
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 z-10 p-1">
                      <div className="space-y-3 rounded-[18px] border border-white/10 bg-[var(--panel)]/60 p-4 shadow-xl backdrop-blur-xl transition-transform duration-300 group-hover:-translate-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold leading-tight tracking-tight text-[var(--text)]">{book.title}</p>
                            <p className="mt-1 truncate text-[10px] font-medium text-[var(--text-muted)]">{book.author ?? fileNameFromPath(book.path)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          <span className="truncate">{book.format}</span>
                          <div className="flex gap-2 shrink-0">
                            <span title="Typing Progress">{Math.round(typeProgress * 100)}%</span>
                            {readProgress > typeProgress && (
                              <span title="Reading Progress" className="text-[var(--accent)]">
                                {Math.round(readProgress * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 h-1 px-5">
                    <div className="relative h-full w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="absolute inset-y-0 left-0 bg-[var(--accent)] opacity-25 transition-all duration-500"
                        style={{ width: `${readProgress * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-[var(--accent)] transition-all duration-500 shadow-[0_0_8px_var(--accent)]"
                        style={{ width: `${typeProgress * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="absolute right-4 top-4 z-20">
                    <button
                      type="button"
                      aria-label="Book actions"
                      aria-expanded={menuBookId === book.id}
                      aria-haspopup="menu"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuBookId((current) => (current === book.id ? null : book.id));
                      }}
                      className="rounded-full border border-[var(--border)] bg-[var(--panel)]/90 px-2 py-1.5 text-xs text-[var(--text)] opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 backdrop-blur-lg"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                    </button>
                    {menuBookId === book.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-12 z-20 min-w-[180px] rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-2 shadow-panel backdrop-blur-2xl"
                      >
                        <BookActionButton
                          onClick={async (event) => {
                            event.stopPropagation();
                            setMenuBookId(null);
                            await onTogglePinned(book.id, !book.pinned);
                          }}
                        >
                          {book.pinned ? "Unpin" : "Pin"}
                        </BookActionButton>
                        <BookActionButton
                          onClick={(event) => {
                            event.stopPropagation();
                            setDraftTitle(book.title);
                            setEditingBook(book);
                            setMenuBookId(null);
                          }}
                        >
                          Edit Name
                        </BookActionButton>
                        <BookActionButton
                          onClick={(e) => {
                            e.stopPropagation();
                            setCoverEditingBook(book);
                            setShowCoverManager(true);
                            setMenuBookId(null);
                          }}
                        >
                          Edit Cover
                        </BookActionButton>
                        <BookActionButton
                          danger
                          onClick={async (event) => {
                            event.stopPropagation();
                            await onDeleteBook(book.id);
                            setMenuBookId(null);
                          }}
                        >
                          Delete
                        </BookActionButton>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {pendingImports.map((path) => (
              <article
                key={path}
                className="group relative isolate overflow-hidden rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--panel-soft)]/30 text-left shadow-sm"
              >
                <div className="relative flex h-full flex-col overflow-hidden rounded-[22px]">
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[22px] bg-[var(--panel-soft)]/50">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent-soft)] border-t-[var(--accent)]" />
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 z-10 p-1">
                    <div className="space-y-3 rounded-[18px] border border-white/5 bg-[var(--panel)]/40 p-4 shadow-xl backdrop-blur-md">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight tracking-tight text-[var(--text)]">
                          {fileNameFromPath(path)}
                        </p>
                        <p className="mt-1 animate-pulse text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider">
                          Processing file...
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showTips && (
        <LibraryTipsModal onClose={() => setShowTips(false)} />
      )}

      {editingBook && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditingBook(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-[30px] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-panel backdrop-blur-2xl">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Rename Book</p>
            <h2 className="mt-4 text-2xl font-semibold">{editingBook.title}</h2>
            <input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitRename();
                } else if (event.key === "Escape") {
                  setEditingBook(null);
                }
              }}
              className="mt-5 w-full rounded-[20px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 outline-none focus:border-[var(--accent)]"
            />
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditingBook(null)}>
                Cancel
              </Button>
              <Button onClick={() => void submitRename()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              setImageToCrop(reader.result as string);
            };
            reader.readAsDataURL(file);
          }
          // Reset input value to allow selecting the same file again
          event.target.value = "";
        }}
      />

      {coverEditingBook && showCoverManager && (
        <CoverManagementModal
          book={coverEditingBook}
          onClose={() => {
            setCoverEditingBook(null);
            setShowCoverManager(false);
          }}
          onUpload={() => {
            setShowCoverManager(false);
            fileInputRef.current?.click();
          }}
          onAdjust={async () => {
            if (coverEditingBook.coverPath) {
              try {
                const base64 = await api.getBookCover(coverEditingBook.coverPath);
                setImageToCrop(base64);
                setShowCoverManager(false);
              } catch (e) {
                console.error("Failed to load current cover for adjustment", e);
              }
            }
          }}
          onRemove={async () => {
            await onUpdateCover(coverEditingBook.id, "");
            setCoverEditingBook(null);
            setShowCoverManager(false);
          }}
        />
      )}

      {coverEditingBook && imageToCrop && (
        <CoverEditorModal
          image={imageToCrop}
          onClose={() => {
            setImageToCrop(null);
            setCoverEditingBook(null);
          }}
          onSave={async (base64) => {
            await onUpdateCover(coverEditingBook.id, base64);
            setImageToCrop(null);
            setCoverEditingBook(null);
          }}
        />
      )}
    </>
  );
}

function LibraryTipsModal({ onClose }: { onClose: () => void }) {
  const [expandedSection, setExpandedSection] = useState<string | null>("resources");

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-[var(--border)] bg-[var(--panel)] p-8 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200 no-scrollbar">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>

        <div className="space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] font-bold">Resources</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">Library Tips</h2>
          </div>

          <div className="space-y-2 mt-4">
            {/* Section 1: Need a Book */}
            <div className="border-b border-white/5 py-3">
              <button
                onClick={() => toggleSection("need_book")}
                className="flex w-full items-center justify-between text-left font-bold text-[var(--text)] py-2 text-base hover:text-[var(--accent)] transition-colors"
              >
                <span>Need a book to type?</span>
                <span className="text-xs transition-transform duration-200 text-[var(--text-muted)]">
                  {expandedSection === "need_book" ? "▲" : "▼"}
                </span>
              </button>
              <AnimatePresence>
                {expandedSection === "need_book" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pb-2 text-sm leading-7 text-[var(--text-muted)]">
                      This app runs locally and requires <strong className="text-[var(--text)]">DRM-free</strong> files to parse your text correctly. Books purchased directly through Kindle or Apple Books are encrypted and will not work.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section 2: Filetypes */}
            <div className="border-b border-white/5 py-3">
              <button
                onClick={() => toggleSection("filetypes")}
                className="flex w-full items-center justify-between text-left font-bold text-[var(--text)] py-2 text-base hover:text-[var(--accent)] transition-colors"
              >
                <span>Supported Filetypes & Formats</span>
                <span className="text-xs transition-transform duration-200 text-[var(--text-muted)]">
                  {expandedSection === "filetypes" ? "▲" : "▼"}
                </span>
              </button>
              <AnimatePresence>
                {expandedSection === "filetypes" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pb-2 text-sm leading-7 text-[var(--text-muted)] space-y-4">
                      <p>The system seamlessly accepts the following standard offline file types:</p>
                      <ul className="grid grid-cols-2 gap-3 text-xs">
                        <li className="rounded-[16px] border border-white/5 bg-white/[0.02] p-3">
                          <strong className="block text-[var(--text)] mb-1 font-mono text-[11px] text-[var(--accent)]">.epub</strong>
                          Full ebooks with structural chapters and layout logic.
                        </li>
                        <li className="rounded-[16px] border border-white/5 bg-white/[0.02] p-3">
                          <strong className="block text-[var(--text)] mb-1 font-mono text-[11px] text-[var(--accent)]">.pdf</strong>
                          Converted to .txt on upload. Results may vary.
                        </li>
                        <li className="rounded-[16px] border border-white/5 bg-white/[0.02] p-3">
                          <strong className="block text-[var(--text)] mb-1 font-mono text-[11px] text-[var(--accent)]">.txt</strong>
                          Simplistic raw texts stripped clean of metadata rules.
                        </li>
                        <li className="rounded-[16px] border border-white/5 bg-white/[0.02] p-3">
                          <strong className="block text-[var(--text)] mb-1 font-mono text-[11px] text-[var(--accent)]">.md</strong>
                          Standard Markdown configurations and headers.
                        </li>
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section 3: Where to Find */}
            <div className="border-b border-white/5 py-3">
              <button
                onClick={() => toggleSection("resources")}
                className="flex w-full items-center justify-between text-left font-bold text-[var(--text)] py-2 text-base hover:text-[var(--accent)] transition-colors"
              >
                <span>Where to find high-quality, free books</span>
                <span className="text-xs transition-transform duration-200 text-[var(--text-muted)]">
                  {expandedSection === "resources" ? "▲" : "▼"}
                </span>
              </button>
              <AnimatePresence>
                {expandedSection === "resources" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pb-2">
                      <ul className="space-y-4">
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://standardebooks.org/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://standardebooks.org/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              Standard Ebooks
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">Take public domain classics professionally formatted into pristine EPUBs.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://www.gutenberg.org/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://www.gutenberg.org/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              Project Gutenberg
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">A massive public archive library of over 70,000 files.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://archive.org/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://archive.org/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              Internet Archive
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">Vast indices of digital cultural media.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://openlibrary.org/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://openlibrary.org/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              Open Library
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">A unified repository mapping open data files.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://google.com/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://google.com/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              Google Search
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">
                              You can books by searching for them on Google or appending <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">filetype:epub</code> or <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">filetype:txt</code> to your search. Be careful when downloading from suspicious websites.
                            </p>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section 4: Converters */}
            <div className="border-b border-white/5 py-3">
              <button
                onClick={() => toggleSection("converters")}
                className="flex w-full items-center justify-between text-left font-bold text-[var(--text)] py-2 text-base hover:text-[var(--accent)] transition-colors"
              >
                <span>Need to convert file formats?</span>
                <span className="text-xs transition-transform duration-200 text-[var(--text-muted)]">
                  {expandedSection === "converters" ? "▲" : "▼"}
                </span>
              </button>
              <AnimatePresence>
                {expandedSection === "converters" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pb-2 text-sm leading-7 text-[var(--text-muted)] space-y-4">
                      <p>
                        If you need to convert formats or deal with severe nested outlines:
                      </p>
                      <ul className="space-y-4">
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://calibre-ebook.com/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://calibre-ebook.com/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              Calibre
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">The standard desktop software solution offline.</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-4">
                          <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                          <div className="text-sm leading-7">
                            <a
                              href="https://cloudconvert.com/"
                              onClick={(e) => { e.preventDefault(); api.openUrl("https://cloudconvert.com/"); }}
                              className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2"
                            >
                              CloudConvert
                            </a>
                            <p className="text-[var(--text-muted)] mt-1">Lightweight rapid converter tools on browser URLs.</p>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="pt-2">
            <Button className="w-full h-12 rounded-2xl text-sm font-bold tracking-wide" onClick={onClose}>Got it</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


function EmptyLibraryState({
  draggingFiles,
  desktopReady,
  onImportBooks,
  onShowTips,
}: {
  draggingFiles: boolean;
  desktopReady: boolean;
  onImportBooks: () => void;
  onShowTips: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex min-h-[62vh] flex-col items-center justify-center border-dashed p-10 text-center transition",
        draggingFiles && "border-[var(--accent)] bg-[var(--accent-soft)]",
      )}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Dropzone</p>
      <h2 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight">Drop your books here.</h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
        Drag and drop EPUB, PDF, Markdown, or TXT files to start building your library.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={onImportBooks} disabled={!desktopReady}>
          Choose Files
        </Button>
        <button
          type="button"
          id="tutorial-tips-btn-empty"
          onClick={onShowTips}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
          title="Library Tips"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </button>
        <div className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)]">
          {desktopReady ? "Or drop files anywhere in the window" : "Drag and drop requires the desktop app"}
        </div>
      </div>
    </Card>
  );
}

function EmptySearchState({ query }: { query: string }) {
  return (
    <Card className="flex min-h-[40vh] items-center justify-center p-10 text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">No Results</p>
        <h2 className="mt-4 text-3xl font-semibold">Nothing matched “{query}”.</h2>
        <p className="mt-3 text-sm text-[var(--text-muted)]">Check your spelling or try clearing your search filters.</p>
      </div>
    </Card>
  );
}


function BookActionButton({
  children,
  danger = false,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-[16px] px-3 py-2.5 text-left text-sm transition hover:bg-[var(--accent-soft)]",
        danger && "text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
      )}
    >
      {children}
    </button>
  );
}

function progressForBook(book: BookRecord, type: "type" | "read" = "type") {
  if (book.totalChars <= 0) {
    return 0;
  }

  const index = type === "type" ? book.currentIndex : book.readIndex;
  return Math.max(0, Math.min(1, index / book.totalChars));
}

function CoverManagementModal({
  book,
  onClose,
  onUpload,
  onAdjust,
  onRemove,
}: {
  book: BookRecord;
  onClose: () => void;
  onUpload: () => void;
  onAdjust: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--panel)] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] font-bold">Customize</p>
          <h2 className="mt-1 text-2xl font-semibold">Book Cover</h2>
        </div>

        <div className="mb-8 flex justify-center">
          <div className="h-48 w-32 overflow-hidden rounded-xl border border-[var(--border)] bg-black/20 shadow-inner">
            {book.coverPath ? (
              <CoverImage path={book.coverPath} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={onUpload} className="h-12 w-full rounded-2xl font-bold">
            Upload New Cover
          </Button>

          {book.coverPath && (
            <Button variant="ghost" onClick={onAdjust} className="h-12 w-full rounded-2xl">
              Adjust Current Crop
            </Button>
          )}

          {book.coverPath && (
            <Button variant="ghost" onClick={onRemove} className="h-12 w-full rounded-2xl text-red-400 hover:text-red-300">
              Remove Custom Cover
            </Button>
          )}

          <Button variant="ghost" onClick={onClose} className="h-12 w-full rounded-2xl text-[var(--text-muted)]">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function CoverImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!path) return;
    if (path.startsWith("http") || path.startsWith("data:")) {
      setUrl(path);
    } else {
      api.getBookCover(path).then((result) => {
        if (active) setUrl(result);
      }).catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) return <div className="h-full w-full animate-pulse bg-white/5" />;
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function CoverEditorModal({
  image,
  onClose,
  onSave,
}: {
  image: string;
  onClose: () => void;
  onSave: (base64: string) => Promise<void>;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      // getCroppedImg returns a base64 string without the prefix if we want, 
      // but the Rust side expects standard base64 without prefix usually, or we can strip it.
      // My Rust side decodes standard base64.
      const base64Data = croppedImage.split(",")[1];
      await onSave(base64Data);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
      <div className="relative flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-8 py-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] font-bold">Customize</p>
            <h2 className="text-2xl font-semibold">Edit Book Cover</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="relative flex-1 bg-[#111]">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={2 / 3}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className="border-t border-[var(--border)] p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-4">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Zoom</span>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)]"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose} className="px-8 h-12 rounded-2xl">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="px-12 h-12 rounded-2xl font-bold shadow-lg shadow-[var(--accent-soft)]">
                {saving ? "Saving..." : "Apply Cover"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return "";
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL("image/png");
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}
