import type { ParsedBook, BookRecord, InteractionMode } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface LibraryViewProps {
  books: BookRecord[];
  currentBook: ParsedBook | null;
  selectedBookId: number | null;
  loadingBook: boolean;
  desktopReady: boolean;
  onImportBooks: () => void;
  onSelectBook: (bookId: number) => void;
  onStartMode: (mode: InteractionMode) => void;
  onSelectChapter: (index: number) => void;
  selectedChapterIndex: number;
}

export function LibraryView({
  books,
  currentBook,
  selectedBookId,
  loadingBook,
  desktopReady,
  onImportBooks,
  onSelectBook,
  onStartMode,
  onSelectChapter,
  selectedChapterIndex,
}: LibraryViewProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card className="flex h-full flex-col p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Library</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{books.length}/10 active books</h2>
          </div>
          <Button onClick={onImportBooks} disabled={!desktopReady || books.length >= 10}>
            Import
          </Button>
        </div>
        {!desktopReady && (
          <p className="mb-4 rounded-3xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            Running in browser preview mode. Import, persistence, and system dialogs are only available inside Tauri.
          </p>
        )}
        <div className="space-y-3 overflow-y-auto">
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => onSelectBook(book.id)}
              className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                selectedBookId === book.id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--panel-soft)] hover:border-[var(--accent)]/50"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">{book.format}</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{book.title}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{book.author ?? "Unknown author"}</p>
            </button>
          ))}
          {books.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Import EPUB, Markdown, or plain text to start.
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <Card className="p-6">
          {!currentBook ? (
            <EmptyBookState />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Selected Book</p>
                  <h2 className="mt-2 text-3xl font-semibold text-[var(--text)]">{currentBook.title}</h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {currentBook.author ?? "Unknown author"} • {currentBook.chapters.length} chapters • {currentBook.totalChars.toLocaleString()} characters
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => onStartMode("read")}>
                    Start Reading
                  </Button>
                  <Button onClick={() => onStartMode("type")}>Start Typing</Button>
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel-soft)] p-6">
                <p className="text-sm leading-7 text-[var(--text-muted)]">
                  {currentBook.chapters[selectedChapterIndex]?.text.slice(0, 420) ?? "Select a chapter to continue."}
                  {(currentBook.chapters[selectedChapterIndex]?.text.length ?? 0) > 420 ? "..." : ""}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Chapters</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">{currentBook?.chapters.length ?? 0}</h3>
            </div>
            {loadingBook && <span className="text-sm text-[var(--text-muted)]">Loading…</span>}
          </div>
          <div className="space-y-2 overflow-y-auto">
            {currentBook?.chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => onSelectChapter(index)}
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  selectedChapterIndex === index
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "bg-[var(--panel-soft)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <p className="font-medium">{chapter.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em]">{chapter.text.length.toLocaleString()} chars</p>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function EmptyBookState() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel-soft)] p-8 text-center">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Workflow</p>
      <h3 className="mt-4 text-3xl font-semibold text-[var(--text)]">Select Book → Select Chapter → Start Typing or Reading</h3>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
        The app keeps progress at character level, chunks chapters for performance, and records only valid typing work in analytics. Skips are excluded. Idle tails are discarded.
      </p>
    </div>
  );
}
