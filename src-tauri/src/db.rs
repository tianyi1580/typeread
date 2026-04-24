use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection};

use crate::models::{AnalyticsSummary, AppSettings, BookRecord, DailyMetric, TypingSessionInput};

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

    fn connection(&self) -> Result<Connection> {
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
                focus_mode INTEGER NOT NULL DEFAULT 1
            );

            INSERT INTO settings (id, theme, type_font, read_font, reader_mode, interaction_mode, focus_mode)
            VALUES (1, 'catppuccin-macchiato', 'jetbrains-mono', 'inter', 'scroll', 'type', 1)
            ON CONFLICT(id) DO NOTHING;
            "#,
        )
        .context("failed to initialize database schema")?;

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
            SELECT id, title, author, path, format, cover_path, current_index, current_chapter, total_chars, added_at
            FROM books
            ORDER BY added_at DESC
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
            SELECT id, title, author, path, format, cover_path, current_index, current_chapter, total_chars, added_at
            FROM books WHERE id = ?1
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

        Ok(AnalyticsSummary {
            total_words_typed,
            total_chars_typed,
            total_time_seconds,
            average_wpm,
            average_accuracy,
            sessions,
            history,
        })
    }

    pub fn get_settings(&self) -> Result<AppSettings> {
        let conn = self.connection()?;
        conn.query_row(
            "SELECT theme, type_font, read_font, reader_mode, interaction_mode, focus_mode FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(AppSettings {
                    theme: row.get(0)?,
                    type_font: row.get(1)?,
                    read_font: row.get(2)?,
                    reader_mode: row.get(3)?,
                    interaction_mode: row.get(4)?,
                    focus_mode: row.get::<_, i64>(5)? == 1,
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
            SET theme = ?1, type_font = ?2, read_font = ?3, reader_mode = ?4, interaction_mode = ?5, focus_mode = ?6
            WHERE id = 1
            "#,
            params![
                settings.theme,
                settings.type_font,
                settings.read_font,
                settings.reader_mode,
                settings.interaction_mode,
                if settings.focus_mode { 1 } else { 0 }
            ],
        )
        .context("failed to save settings")?;
        self.get_settings()
    }

    fn get_book_by_path(&self, book_path: &str) -> Result<Option<BookRecord>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, title, author, path, format, cover_path, current_index, current_chapter, total_chars, added_at
            FROM books WHERE path = ?1
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
        added_at: row.get(9)?,
    })
}
