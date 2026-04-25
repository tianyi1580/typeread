import { type MouseEvent, type ReactNode, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { api } from "../lib/tauri";
import { themeMap } from "../theme";
import { cn } from "../lib/utils";
import type { BookRecord, InteractionMode, ThemeName } from "../types";

interface LibraryViewProps {
  books: BookRecord[];
  selectedBookId: number | null;
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
  selectedBookId,
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
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [draftTitle, setDraftTitle] = useState("");


  const emptyState = books.length === 0 && !searchQuery;

  async function submitRename() {
    if (!editingBook) {
      return;
    }

    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === editingBook.title) {
      setEditingBook(null);
      return;
    }

    await onRenameBook(editingBook.id, nextTitle);
    setEditingBook(null);
  }

  return (
    <>
      <div>
        <Card className="overflow-hidden p-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Library</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight">
                The app opens as a library now, because users manage books before they type them.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
                Search, pin, rename, and delete from one grid. Click a book and the reader opens directly on the saved chapter instead of forcing a dead-end tab workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={onImportBooks} disabled={!desktopReady}>
                Import Books
              </Button>
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
          <EmptyLibraryState draggingFiles={draggingFiles} desktopReady={desktopReady} onImportBooks={onImportBooks} />
        ) : books.length === 0 && searchQuery ? (
          <EmptySearchState query={searchQuery} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {books.map((book) => {
              const selected = selectedBookId === book.id;
              const progress = progressForBook(book);
              const assetUrl = api.assetUrl(book.coverPath);

              return (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => onOpenBook(book.id)}
                  className={cn(
                    "group relative overflow-hidden rounded-[30px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-[var(--accent)]",
                    selected && "border-[var(--accent)] shadow-[0_26px_80px_var(--shadow)]",
                  )}
                >
                  <div className="relative h-[240px] overflow-hidden">
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
                        <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[var(--text)]">
                          Pinned
                        </span>
                      )}
                    </div>
                    <div className="absolute right-4 top-4">
                      <button
                        type="button"
                        aria-label="Book actions"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuBookId((current) => (current === book.id ? null : book.id));
                        }}
                        className="opacity-0 transition group-hover:opacity-100 rounded-full border border-[var(--border)] bg-[var(--panel)]/90 px-3 py-2 text-sm text-[var(--text)] backdrop-blur-lg"
                      >
                        ...
                      </button>
                      {menuBookId === book.id && (
                        <>
                          <button
                            type="button"
                            aria-label="Close book actions"
                            className="fixed inset-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuBookId(null);
                            }}
                          />
                          <div className="absolute right-0 top-12 z-20 min-w-[180px] rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-2 shadow-panel backdrop-blur-2xl">
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
                                setMenuBookId(null);
                                await onDeleteBook(book.id);
                              }}
                            >
                              Delete
                            </BookActionButton>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-xl font-semibold">{book.title}</p>
                        <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{book.author ?? fileNameFromPath(book.path)}</p>
                      </div>
                      <div className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--text)]">
                        {book.averageWpm > 0 ? `${Math.round(book.averageWpm)} WPM` : "No WPM"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      <span>{book.format}</span>
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${progress * 100}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {loadingBook && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">Loading book…</p>
        )}
      </div>

      {editingBook && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4">
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

function EmptyLibraryState({
  draggingFiles,
  desktopReady,
  onImportBooks,
}: {
  draggingFiles: boolean;
  desktopReady: boolean;
  onImportBooks: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex min-h-[62vh] flex-col items-center justify-center border-dashed p-10 text-center transition",
        draggingFiles && "border-[var(--accent)] bg-[var(--accent-soft)]",
      )}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Dropzone</p>
      <h2 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight">Drag and drop EPUB, Markdown, or TXT here.</h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
        The empty library turns the whole workspace into an intake surface. If you do nothing else, at least make the first-run state obvious and useful.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={onImportBooks} disabled={!desktopReady}>
          Choose Files
        </Button>
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
        <p className="mt-3 text-sm text-[var(--text-muted)]">Your search is too narrow or your library is empty. Those are the only two honest explanations.</p>
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

function progressForBook(book: BookRecord) {
  if (book.totalChars <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, book.currentIndex / book.totalChars));
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}
