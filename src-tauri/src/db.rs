use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{AnalyticsSummary, AppSettings, BookRecord, DailyMetric, SessionPoint, TypingSessionInput};

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let database = Self {
            path: path.as_ref().to_path_buf(),
        };
        database.init()?;
        Ok(database)
    }

    pub fn connection(&self) -> Result<Connection> {
        Connection::open(&self.path).with_context(|| format!("failed to open database at {}", self.path.display()))
    }

    fn init(&self) -> Result<()> {
        let conn = self.connection()?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT,
                path TEXT NOT NULL UNIQUE,
                format TEXT NOT NULL,
                cover_path TEXT,
                current_index INTEGER NOT NULL DEFAULT 0,
                current_chapter INTEGER NOT NULL DEFAULT 0,
                total_chars INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                added_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS typing_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                words_typed INTEGER NOT NULL DEFAULT 0,
                chars_typed INTEGER NOT NULL DEFAULT 0,
                errors INTEGER NOT NULL DEFAULT 0,
                wpm REAL NOT NULL DEFAULT 0,
                accuracy REAL NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(book_id) REFERENCES books(id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT NOT NULL,
                type_font TEXT NOT NULL,
                read_font TEXT NOT NULL,
                reader_mode TEXT NOT NULL,
                interaction_mode TEXT NOT NULL,
                base_font_size INTEGER NOT NULL DEFAULT 18,
                line_height REAL NOT NULL DEFAULT 1.7,
                enter_to_skip INTEGER NOT NULL DEFAULT 1,
                ignore_quotation_marks INTEGER NOT NULL DEFAULT 0,
                ignored_characters TEXT NOT NULL DEFAULT '',
                focus_mode INTEGER NOT NULL DEFAULT 1
            );
            "#,
        )
        .context("failed to initialize database schema")?;

        self.ensure_columns(&conn)?;

        conn.execute(
            r#"
            INSERT INTO settings (
                id,
                theme,
                type_font,
                read_font,
                reader_mode,
                interaction_mode,
                base_font_size,
                line_height,
                enter_to_skip,
                ignore_quotation_marks,
                ignored_characters,
                focus_mode
            )
            VALUES (1, 'catppuccin-macchiato', 'jetbrains-mono', 'inter', 'scroll', 'type', 18, 1.7, 1, 0, '', 1)
            ON CONFLICT(id) DO NOTHING;
            "#,
            [],
        )
        .context("failed to insert default settings")?;

        Ok(())
    }

    fn ensure_columns(&self, conn: &Connection) -> Result<()> {
        // The app already shipped a smaller schema, so migrations must be additive and idempotent.
        ensure_column(conn, "books", "pinned", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "settings", "base_font_size", "INTEGER NOT NULL DEFAULT 18")?;
        ensure_column(conn, "settings", "line_height", "REAL NOT NULL DEFAULT 1.7")?;
        ensure_column(conn, "settings", "enter_to_skip", "INTEGER NOT NULL DEFAULT 1")?;
        ensure_column(conn, "settings", "ignore_quotation_marks", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "settings", "ignored_characters", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "settings", "focus_mode", "INTEGER NOT NULL DEFAULT 1")?;
        Ok(())
    }

    pub fn upsert_book(
        &self,
        title: &str,
        author: Option<&str>,
        path: &str,
        format: &str,
        cover_path: Option<&str>,
        total_chars: i64,
    ) -> Result<BookRecord> {
        let conn = self.connection()?;
        let now = Utc::now().to_rfc3339();

        conn.execute(
            r#"
            INSERT INTO books (title, author, path, format, cover_path, total_chars, added_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                author = excluded.author,
                format = excluded.format,
                cover_path = excluded.cover_path,
                total_chars = excluded.total_chars
            "#,
            params![title, author, path, format, cover_path, total_chars, now],
        )
        .context("failed to upsert imported book")?;

        self.get_book_by_path(path)?
            .context("failed to load imported book row")
    }

    pub fn list_books(&self) -> Result<Vec<BookRecord>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT
                books.id,
                books.title,
                books.author,
                books.path,
                books.format,
                books.cover_path,
                books.current_index,
                books.current_chapter,
                books.total_chars,
                books.pinned,
                COALESCE(book_sessions.average_wpm, 0),
                books.added_at
            FROM books
            LEFT JOIN (
                SELECT book_id, AVG(wpm) AS average_wpm
                FROM typing_sessions
                GROUP BY book_id
            ) AS book_sessions ON book_sessions.book_id = books.id
            ORDER BY books.pinned DESC, books.added_at DESC
            "#,
        )?;
        let rows = stmt.query_map([], map_book_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .context("failed to list library books")
    }

    pub fn get_book(&self, id: i64) -> Result<Option<BookRecord>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT
                books.id,
                books.title,
                books.author,
                books.path,
                books.format,
                books.cover_path,
                books.current_index,
                books.current_chapter,
                books.total_chars,
                books.pinned,
                COALESCE(book_sessions.average_wpm, 0),
                books.added_at
            FROM books
            LEFT JOIN (
                SELECT book_id, AVG(wpm) AS average_wpm
                FROM typing_sessions
                GROUP BY book_id
            ) AS book_sessions ON book_sessions.book_id = books.id
            WHERE books.id = ?1
            "#,
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(map_book(row)?))
        } else {
            Ok(None)
        }
    }

    pub fn update_progress(&self, book_id: i64, current_index: i64, current_chapter: i64) -> Result<()> {
        let conn = self.connection()?;
        conn.execute(
            "UPDATE books SET current_index = ?2, current_chapter = ?3 WHERE id = ?1",
            params![book_id, current_index, current_chapter],
        )
        .context("failed to update reading progress")?;
        Ok(())
    }

    pub fn rename_book(&self, book_id: i64, title: &str) -> Result<()> {
        let conn = self.connection()?;
        conn.execute("UPDATE books SET title = ?2 WHERE id = ?1", params![book_id, title.trim()])?;
        Ok(())
    }

    pub fn set_book_pinned(&self, book_id: i64, pinned: bool) -> Result<()> {
        let conn = self.connection()?;
        conn.execute(
            "UPDATE books SET pinned = ?2 WHERE id = ?1",
            params![book_id, if pinned { 1 } else { 0 }],
        )?;
        Ok(())
    }

    pub fn delete_book(&self, book_id: i64) -> Result<()> {
        let conn = self.connection()?;
        let cover_path: Option<String> = conn
            .query_row("SELECT cover_path FROM books WHERE id = ?1", params![book_id], |row| row.get(0))
            .optional()
            .context("failed to read book cover before deletion")?
            .flatten();

        conn.execute("DELETE FROM typing_sessions WHERE book_id = ?1", params![book_id])?;
        conn.execute("DELETE FROM books WHERE id = ?1", params![book_id])?;

        if let Some(path) = cover_path {
            let cover = PathBuf::from(path);
            if cover.exists() {
                let _ = fs::remove_file(cover);
            }
        }

        Ok(())
    }

    pub fn clear_session_history(&self) -> Result<()> {
        let conn = self.connection()?;
        conn.execute("DELETE FROM typing_sessions", [])?;
        Ok(())
    }

    pub fn delete_library(&self) -> Result<()> {
        let books = self.list_books()?;
        let conn = self.connection()?;
        conn.execute("DELETE FROM typing_sessions", [])?;
        conn.execute("DELETE FROM books", [])?;

        for book in books {
            if let Some(path) = book.cover_path {
                let cover = PathBuf::from(path);
                if cover.exists() {
                    let _ = fs::remove_file(cover);
                }
            }
        }

        Ok(())
    }

    pub fn save_session(&self, session: &TypingSessionInput) -> Result<()> {
        let conn = self.connection()?;
        conn.execute(
            r#"
            INSERT INTO typing_sessions
            (book_id, start_time, end_time, words_typed, chars_typed, errors, wpm, accuracy, duration_seconds)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                session.book_id,
                session.start_time,
                session.end_time,
                session.words_typed,
                session.chars_typed,
                session.errors,
                session.wpm,
                session.accuracy,
                session.duration_seconds
            ],
        )
        .context("failed to persist typing session")?;
        Ok(())
    }

    pub fn analytics(&self) -> Result<AnalyticsSummary> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT
                COALESCE(SUM(words_typed), 0),
                COALESCE(SUM(chars_typed), 0),
                COALESCE(SUM(duration_seconds), 0),
                COALESCE(AVG(wpm), 0),
                COALESCE(AVG(accuracy), 0),
                COUNT(*)
            FROM typing_sessions
            "#,
        )?;

        let (total_words_typed, total_chars_typed, total_time_seconds, average_wpm, average_accuracy, sessions) =
            stmt.query_row([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })?;

        let mut history_stmt = conn.prepare(
            r#"
            SELECT
                substr(start_time, 1, 10) AS day,
                AVG(wpm),
                AVG(accuracy),
                COUNT(*)
            FROM typing_sessions
            GROUP BY substr(start_time, 1, 10)
            ORDER BY day ASC
            "#,
        )?;

        let history = history_stmt
            .query_map([], |row| {
                Ok(DailyMetric {
                    day: row.get(0)?,
                    wpm: row.get(1)?,
                    accuracy: row.get(2)?,
                    sessions: row.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut session_stmt = conn.prepare(
            r#"
            SELECT
                typing_sessions.id,
                typing_sessions.book_id,
                books.title,
                typing_sessions.start_time,
                typing_sessions.end_time,
                typing_sessions.duration_seconds,
                typing_sessions.words_typed,
                typing_sessions.chars_typed,
                typing_sessions.wpm,
                typing_sessions.accuracy
            FROM typing_sessions
            INNER JOIN books ON books.id = typing_sessions.book_id
            ORDER BY typing_sessions.start_time DESC
            "#,
        )?;

        let session_points = session_stmt
            .query_map([], |row| {
                Ok(SessionPoint {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    book_title: row.get(2)?,
                    start_time: row.get(3)?,
                    end_time: row.get(4)?,
                    duration_seconds: row.get(5)?,
                    words_typed: row.get(6)?,
                    chars_typed: row.get(7)?,
                    wpm: row.get(8)?,
                    accuracy: row.get(9)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(AnalyticsSummary {
            total_words_typed,
            total_chars_typed,
            total_time_seconds,
            average_wpm,
            average_accuracy,
            sessions,
            history,
            session_points,
        })
    }

    pub fn get_settings(&self) -> Result<AppSettings> {
        let conn = self.connection()?;
        conn.query_row(
            r#"
            SELECT
                theme,
                type_font,
                reader_mode,
                interaction_mode,
                base_font_size,
                line_height,
                enter_to_skip,
                ignore_quotation_marks,
                ignored_characters,
                focus_mode
            FROM settings
            WHERE id = 1
            "#,
            [],
            |row| {
                let ignored_characters: String = row.get(8)?;
                let ignore_quotation_marks = row.get::<_, i64>(7)? == 1;
                Ok(AppSettings {
                    theme: row.get(0)?,
                    font: row.get(1)?,
                    reader_mode: row.get(2)?,
                    interaction_mode: row.get(3)?,
                    base_font_size: row.get(4)?,
                    line_height: row.get(5)?,
                    enter_to_skip: row.get::<_, i64>(6)? == 1,
                    ignored_characters: if ignored_characters.trim().is_empty() && ignore_quotation_marks {
                        r#""\"", "'", "“", "”", "‘", "’""#.to_string()
                    } else {
                        ignored_characters
                    },
                    focus_mode: row.get::<_, i64>(9)? == 1,
                })
            },
        )
        .context("failed to load settings")
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<AppSettings> {
        let conn = self.connection()?;
        conn.execute(
            r#"
            UPDATE settings
            SET theme = ?1,
                type_font = ?2,
                reader_mode = ?3,
                interaction_mode = ?4,
                base_font_size = ?5,
                line_height = ?6,
                enter_to_skip = ?7,
                ignore_quotation_marks = ?8,
                ignored_characters = ?9,
                focus_mode = ?10
            WHERE id = 1
            "#,
            params![
                settings.theme,
                settings.font,
                settings.reader_mode,
                settings.interaction_mode,
                settings.base_font_size,
                settings.line_height,
                if settings.enter_to_skip { 1 } else { 0 },
                if settings.ignored_characters.trim().is_empty() { 0 } else { 1 },
                settings.ignored_characters,
                if settings.focus_mode { 1 } else { 0 }
            ],
        )
        .context("failed to save settings")?;
        self.get_settings()
    }

    pub fn export_to(&self, destination: &Path) -> Result<()> {
        if destination.exists() {
            fs::remove_file(destination)
                .with_context(|| format!("failed to replace {}", destination.display()))?;
        }

        let conn = self.connection()?;
        let quoted = destination.to_string_lossy().replace('\'', "''");
        conn.execute_batch(&format!("VACUUM INTO '{quoted}'"))
            .with_context(|| format!("failed to export database to {}", destination.display()))?;
        Ok(())
    }

    pub fn import_from(&self, source: &Path) -> Result<()> {
        if !source.exists() {
            anyhow::bail!("database import source does not exist");
        }

        let wal_path = self.path.with_extension("sqlite-wal");
        let shm_path = self.path.with_extension("sqlite-shm");
        let _ = fs::remove_file(&wal_path);
        let _ = fs::remove_file(&shm_path);
        if self.path.exists() {
            fs::remove_file(&self.path)
                .with_context(|| format!("failed to replace {}", self.path.display()))?;
        }
        fs::copy(source, &self.path)
            .with_context(|| format!("failed to import database from {}", source.display()))?;
        self.init()?;
        Ok(())
    }

    fn get_book_by_path(&self, book_path: &str) -> Result<Option<BookRecord>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT
                books.id,
                books.title,
                books.author,
                books.path,
                books.format,
                books.cover_path,
                books.current_index,
                books.current_chapter,
                books.total_chars,
                books.pinned,
                COALESCE(book_sessions.average_wpm, 0),
                books.added_at
            FROM books
            LEFT JOIN (
                SELECT book_id, AVG(wpm) AS average_wpm
                FROM typing_sessions
                GROUP BY book_id
            ) AS book_sessions ON book_sessions.book_id = books.id
            WHERE books.path = ?1
            "#,
        )?;
        let mut rows = stmt.query(params![book_path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(map_book(row)?))
        } else {
            Ok(None)
        }
    }
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    if columns.iter().any(|existing| existing == column) {
        return Ok(());
    }

    conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        .with_context(|| format!("failed to add {column} to {table}"))?;
    Ok(())
}

fn map_book_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BookRecord> {
    map_book(row)
}

fn map_book(row: &rusqlite::Row<'_>) -> rusqlite::Result<BookRecord> {
    Ok(BookRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        path: row.get(3)?,
        format: row.get(4)?,
        cover_path: row.get(5)?,
        current_index: row.get(6)?,
        current_chapter: row.get(7)?,
        total_chars: row.get(8)?,
        pinned: row.get::<_, i64>(9)? == 1,
        average_wpm: row.get(10)?,
        added_at: row.get(11)?,
    })
}
