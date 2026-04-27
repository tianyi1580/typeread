import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { api } from "../lib/tauri";
import { themeMap } from "../theme";
import { cn } from "../lib/utils";
import type { BookRecord, ThemeName } from "../types";

interface LibraryViewProps {
  books: BookRecord[];
  loadingBook: boolean;
  desktopReady: boolean;
  draggingFiles: boolean;
  searchQuery: string;
  themeName: ThemeName;
  onImportBooks: () => void;
  onOpenBook: (bookId: number) => void;
  onRenameBook: (bookId: number, title: string) => Promise<void>;
  onTogglePinned: (bookId: number, pinned: boolean) => Promise<void>;
  onDeleteBook: (bookId: number) => Promise<void>;
}

export function LibraryView({
  books,
  loadingBook,
  desktopReady,
  draggingFiles,
  searchQuery,
  themeName,
  onImportBooks,
  onOpenBook,
  onRenameBook,
  onTogglePinned,
  onDeleteBook,
}: LibraryViewProps) {
  const theme = themeMap[themeName];
  const [menuBookId, setMenuBookId] = useState<number | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
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
              const assetUrl = api.assetUrl(book.coverPath);

              return (
                <article
                  key={book.id}
                  className="group relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-[var(--accent)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--bg)]"
                >
                  {/* Keep the primary open action separate from the action menu to avoid nested buttons. */}
                  <button
                    type="button"
                    aria-label={`Open ${book.title}`}
                    onClick={() => onOpenBook(book.id)}
                    className="absolute inset-0 z-0 rounded-[22px] focus-visible:outline-none"
                  />

                  <div className="pointer-events-none relative z-10">
                    <div className="relative h-[160px] overflow-hidden">
                      {assetUrl ? (
                        <img src={assetUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div
                          className="h-full w-full"
                          style={{
                            background: `linear-gradient(145deg, ${theme.accentSoft}, ${theme.panelSoft})`,
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.38))]" />
                      <div className="absolute left-4 top-4 flex gap-2">
                        {book.pinned && (
                          <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--text)]">
                            Pinned
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight">{book.title}</p>
                          <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{book.author ?? fileNameFromPath(book.path)}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        <span className="truncate">{book.format}</span>
                        <div className="flex gap-1.5 shrink-0">
                          <span title="Typing Progress">{Math.round(typeProgress * 100)}%</span>
                          {readProgress > typeProgress && (
                            <span title="Reading Progress" className="text-[var(--accent)] font-bold">
                              {Math.round(readProgress * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 bg-white/10">
                    <div
                      className="absolute inset-y-0 left-0 bg-[var(--accent)] opacity-25 transition-all duration-500"
                      style={{ width: `${readProgress * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${typeProgress * 100}%` }}
                    />
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
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
          </div>
        )}

        {loadingBook && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">Loading book…</p>
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
    </>
  );
}

function LibraryTipsModal({ onClose }: { onClose: () => void }) {
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
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <div className="space-y-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] font-bold">Resources</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">Library Tips</h2>
          </div>

          <div className="space-y-8">
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-[var(--text)]">Need a book to type?</h3>
              <p className="text-sm leading-7 text-[var(--text-muted)]">
                This app runs locally and requires <strong className="text-[var(--text)]">DRM-free</strong> files to parse your text correctly. Books purchased directly through Kindle or Apple Books are encrypted and will not work.
              </p>
            </section>

            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-[var(--text)]">Where to find high-quality, free books:</h3>
              <ul className="space-y-5">
                <li className="flex items-start gap-4">
                  <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <div className="text-sm leading-7">
                    <a href="https://standardebooks.org/" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2">Standard Ebooks</a>
                    <p className="text-[var(--text-muted)] mt-1">The absolute best source. They take public domain classics and professionally format them into pristine <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">.epub</code> files.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <div className="text-sm leading-7">
                    <a href="https://www.gutenberg.org/" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2">Project Gutenberg</a>
                    <p className="text-[var(--text-muted)] mt-1">A massive library of over 70,000 free, public domain books available in both <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">.epub</code> and <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">.txt</code>.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <div className="text-sm leading-7">
                    <strong className="text-[var(--text)]">Indie Platforms</strong>
                    <p className="text-[var(--text-muted)] mt-1">Stores like Smashwords, Itch.io, and Gumroad allow authors to sell their books completely DRM-free.</p>
                  </div>
                </li>
              </ul>
            </section>

            <section className="space-y-5">
              <h3 className="text-lg font-semibold text-[var(--text)]">Have a PDF?</h3>
              <p className="text-sm leading-7 text-[var(--text-muted)]">
                PDFs are built for visual printing, not text extraction. To get the best typing experience, convert your PDFs to <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">.epub</code> or <code className="rounded bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text)] font-mono">.txt</code> first:
              </p>
              <ul className="space-y-5">
                <li className="flex items-start gap-4">
                  <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <div className="text-sm leading-7">
                    <a href="https://calibre-ebook.com/" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2">Calibre (Recommended)</a>
                    <p className="text-[var(--text-muted)] mt-1">A free, open-source desktop application that handles offline conversions perfectly.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <div className="text-sm leading-7">
                    <a href="https://cloudconvert.com/" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors underline decoration-[var(--accent-soft)] underline-offset-4 decoration-2">CloudConvert</a>
                    <p className="text-[var(--text-muted)] mt-1">A quick web-based tool if you don't want to install software, though local conversion yields cleaner text formatting.</p>
                  </div>
                </li>
              </ul>
            </section>
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
        Drag and drop EPUB, Markdown, or TXT files to start building your library.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={onImportBooks} disabled={!desktopReady}>
          Choose Files
        </Button>
        <button
          type="button"
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

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}
