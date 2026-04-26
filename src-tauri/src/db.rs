use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::{NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::analytics::{group_transition_stats, FinalizedAnalytics};
use crate::models::{
    AchievementAward, AnalyticsSummary, AppSettings, BookRecord, ConfusionPair, DeepAnalytics,
    ProfileProgress, SessionContext, SessionPoint, SessionSummaryResponse, TransitionStat,
    TypingSessionInput, UnlockState,
};

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

#[derive(Default)]
struct StoredProfile {
    total_xp: i64,
    streak_days: i64,
    last_active_day: Option<String>,
    rested_words_available: i64,
}

#[derive(Default)]
struct TransitionAggregate {
    count: i64,
    mean: f64,
    m2: f64,
    error_count: i64,
}

impl TransitionAggregate {
    fn merge_stat(&mut self, stat: &TransitionStat) {
        if stat.samples <= 0 {
            return;
        }

        let stat_variance = stat.deviation_ms * stat.deviation_ms;
        let stat_m2 = stat_variance * (stat.samples as f64 - 1.0).max(0.0);
        if self.count == 0 {
            self.count = stat.samples;
            self.mean = stat.average_ms;
            self.m2 = stat_m2;
            self.error_count = (stat.error_rate * stat.samples as f64).round() as i64;
            return;
        }

        let combined_count = self.count + stat.samples;
        let delta = stat.average_ms - self.mean;
        self.mean += delta * stat.samples as f64 / combined_count as f64;
        self.m2 += stat_m2 + delta * delta * self.count as f64 * stat.samples as f64 / combined_count as f64;
        self.error_count += (stat.error_rate * stat.samples as f64).round() as i64;
        self.count = combined_count;
    }

    fn to_stat(&self, combo: String) -> TransitionStat {
        let variance = if self.count > 1 {
            self.m2 / (self.count as f64 - 1.0)
        } else {
            0.0
        };

        TransitionStat {
            combo,
            samples: self.count,
            average_ms: self.mean,
            deviation_ms: variance.max(0.0).sqrt(),
            error_rate: if self.count <= 0 {
                0.0
            } else {
                self.error_count as f64 / self.count as f64
            },
        }
    }
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
                book_id INTEGER,
                source TEXT NOT NULL DEFAULT 'book',
                source_label TEXT NOT NULL DEFAULT '',
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                words_typed INTEGER NOT NULL DEFAULT 0,
                chars_typed INTEGER NOT NULL DEFAULT 0,
                errors INTEGER NOT NULL DEFAULT 0,
                wpm REAL NOT NULL DEFAULT 0,
                accuracy REAL NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                xp_gained INTEGER NOT NULL DEFAULT 0,
                rhythm_score REAL NOT NULL DEFAULT 0,
                focus_score REAL NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS session_analytics (
                session_id INTEGER PRIMARY KEY,
                keyboard_layout_id TEXT NOT NULL DEFAULT 'qwerty-us',
                keyboard_layout_name TEXT NOT NULL DEFAULT 'QWERTY (US)',
                keyboard_layout_rows_json TEXT NOT NULL DEFAULT '[]',
                macro_wpm_json TEXT NOT NULL DEFAULT '[]',
                recent_wpm_json TEXT NOT NULL DEFAULT '[]',
                confusion_json TEXT NOT NULL DEFAULT '[]',
                transition_stats_json TEXT NOT NULL DEFAULT '[]',
                cadence_cv REAL NOT NULL DEFAULT 0,
                active_typing_seconds INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(session_id) REFERENCES typing_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS profile_progress (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                total_xp INTEGER NOT NULL DEFAULT 0,
                streak_days INTEGER NOT NULL DEFAULT 0,
                last_active_day TEXT,
                rested_words_available INTEGER NOT NULL DEFAULT 100
            );

            CREATE TABLE IF NOT EXISTS achievements (
                achievement_key TEXT PRIMARY KEY,
                earned_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT NOT NULL,
                type_font TEXT NOT NULL,
                reader_mode TEXT NOT NULL,
                interaction_mode TEXT NOT NULL,
                base_font_size INTEGER NOT NULL DEFAULT 18,
                line_height REAL NOT NULL DEFAULT 1.7,
                tab_to_skip INTEGER NOT NULL DEFAULT 1,
                ignore_quotation_marks INTEGER NOT NULL DEFAULT 0,
                ignored_characters TEXT NOT NULL DEFAULT '',
                focus_mode INTEGER NOT NULL DEFAULT 1,
                keyboard_layout TEXT NOT NULL DEFAULT 'qwerty-us',
                custom_keyboard_layout TEXT NOT NULL DEFAULT '',
                smooth_caret INTEGER NOT NULL DEFAULT 0,
                type_test_duration INTEGER NOT NULL DEFAULT 60,
                versus_bot_cpm INTEGER NOT NULL DEFAULT 300,
                practice_word_bank_type TEXT NOT NULL DEFAULT 'easy',
                error_color TEXT NOT NULL DEFAULT '#ed8796'
            );
            "#,
        )
        .context("failed to initialize database schema")?;

        self.ensure_columns(&conn)?;
        self.cleanup_corrupted_data(&conn)?;

        conn.execute(
            r#"
            INSERT INTO settings (
                id,
                theme,
                type_font,
                reader_mode,
                interaction_mode,
                base_font_size,
                line_height,
                tab_to_skip,
                ignore_quotation_marks,
                ignored_characters,
                focus_mode,
                keyboard_layout,
                custom_keyboard_layout,
                smooth_caret,
                type_test_duration,
                versus_bot_cpm,
                practice_word_bank_type,
                error_color
            )
            VALUES (
                1,
                'catppuccin-macchiato',
                'jetbrains-mono',
                'scroll',
                'type',
                18,
                1.7,
                1,
                0,
                '',
                1,
                'qwerty-us',
                '',
                0,
                60,
                300,
                'easy',
                '#ed8796'
            )
            ON CONFLICT(id) DO NOTHING;
            "#,
            [],
        )
        .context("failed to insert default settings")?;

        conn.execute(
            r#"
            INSERT INTO profile_progress (id, total_xp, streak_days, last_active_day, rested_words_available)
            VALUES (1, 0, 0, NULL, 100)
            ON CONFLICT(id) DO NOTHING;
            "#,
            [],
        )
        .context("failed to insert default profile progress")?;

        Ok(())
    }

    fn ensure_columns(&self, conn: &Connection) -> Result<()> {
        ensure_column(conn, "books", "pinned", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "settings", "theme", "TEXT NOT NULL DEFAULT 'catppuccin-macchiato'")?;
        ensure_column(conn, "settings", "type_font", "TEXT NOT NULL DEFAULT 'jetbrains-mono'")?;
        ensure_column(conn, "settings", "reader_mode", "TEXT NOT NULL DEFAULT 'scroll'")?;
        ensure_column(conn, "settings", "interaction_mode", "TEXT NOT NULL DEFAULT 'type'")?;
        ensure_column(conn, "settings", "base_font_size", "INTEGER NOT NULL DEFAULT 18")?;
        ensure_column(conn, "settings", "line_height", "REAL NOT NULL DEFAULT 1.7")?;
        ensure_column(conn, "settings", "tab_to_skip", "INTEGER NOT NULL DEFAULT 1")?;
        ensure_column(conn, "settings", "ignore_quotation_marks", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "settings", "ignored_characters", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "settings", "focus_mode", "INTEGER NOT NULL DEFAULT 1")?;
        ensure_column(conn, "settings", "keyboard_layout", "TEXT NOT NULL DEFAULT 'qwerty-us'")?;
        ensure_column(conn, "settings", "custom_keyboard_layout", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "settings", "smooth_caret", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "settings", "type_test_duration", "INTEGER NOT NULL DEFAULT 60")?;
        ensure_column(conn, "settings", "versus_bot_cpm", "INTEGER NOT NULL DEFAULT 300")?;
        ensure_column(conn, "settings", "practice_word_bank_type", "TEXT NOT NULL DEFAULT 'easy'")?;
        ensure_column(conn, "settings", "error_color", "TEXT NOT NULL DEFAULT '#ed8796'")?;
        
        // Migration: Rename enter_to_skip to tab_to_skip if it exists
        let has_enter_to_skip = {
            let mut stmt = conn.prepare("PRAGMA table_info(settings)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "enter_to_skip" {
                    found = true;
                    break;
                }
            }
            found
        };
        if has_enter_to_skip {
            conn.execute_batch(
                r#"
                UPDATE settings SET tab_to_skip = enter_to_skip;
                ALTER TABLE settings DROP COLUMN enter_to_skip;
                "#,
            )?;
        }

        ensure_column(conn, "session_analytics", "keyboard_layout_id", "TEXT NOT NULL DEFAULT 'qwerty-us'")?;
        ensure_column(conn, "session_analytics", "keyboard_layout_name", "TEXT NOT NULL DEFAULT 'QWERTY (US)'")?;
        ensure_column(conn, "session_analytics", "keyboard_layout_rows_json", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(conn, "session_analytics", "macro_wpm_json", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(conn, "session_analytics", "macro_accuracy_json", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(conn, "session_analytics", "recent_wpm_json", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(conn, "session_analytics", "confusion_json", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(conn, "session_analytics", "transition_stats_json", "TEXT NOT NULL DEFAULT '[]'")?;
        ensure_column(conn, "session_analytics", "cadence_cv", "REAL NOT NULL DEFAULT 0")?;
        ensure_column(conn, "session_analytics", "active_typing_seconds", "INTEGER NOT NULL DEFAULT 0")?;

        // Drop legacy column that causes panics if it exists (NOT NULL without default)
        let has_read_font = {
            let mut stmt = conn.prepare("PRAGMA table_info(settings)")?;
            let mut rows = stmt.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "read_font" {
                    found = true;
                    break;
                }
            }
            found
        };
        if has_read_font {
            conn.execute_batch("ALTER TABLE settings DROP COLUMN read_font")?;
        }

        ensure_column(conn, "typing_sessions", "source", "TEXT NOT NULL DEFAULT 'book'")?;
        ensure_column(conn, "typing_sessions", "source_label", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "typing_sessions", "start_time", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "typing_sessions", "end_time", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "typing_sessions", "words_typed", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "chars_typed", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "errors", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "wpm", "REAL NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "accuracy", "REAL NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "duration_seconds", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "xp_gained", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "rhythm_score", "REAL NOT NULL DEFAULT 0")?;
        ensure_column(conn, "typing_sessions", "focus_score", "REAL NOT NULL DEFAULT 0")?;

        // Migration: Make book_id nullable and remove FK constraint if it exists
        let is_book_id_nullable = {
            let mut stmt = conn.prepare("PRAGMA table_info(typing_sessions)")?;
            let mut rows = stmt.query([])?;
            let mut nullable = true;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "book_id" {
                    let notnull: i32 = row.get(3)?;
                    nullable = notnull == 0;
                    break;
                }
            }
            nullable
        };

        let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version < 2 || !is_book_id_nullable {
            conn.execute("PRAGMA foreign_keys = OFF", [])?;
            conn.execute_batch(
                r#"
                CREATE TABLE typing_sessions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    book_id INTEGER,
                    source TEXT NOT NULL DEFAULT 'book',
                    source_label TEXT NOT NULL DEFAULT '',
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    words_typed INTEGER NOT NULL DEFAULT 0,
                    chars_typed INTEGER NOT NULL DEFAULT 0,
                    errors INTEGER NOT NULL DEFAULT 0,
                    wpm REAL NOT NULL DEFAULT 0,
                    accuracy REAL NOT NULL DEFAULT 0,
                    duration_seconds INTEGER NOT NULL DEFAULT 0,
                    xp_gained INTEGER NOT NULL DEFAULT 0,
                    rhythm_score REAL NOT NULL DEFAULT 0,
                    focus_score REAL NOT NULL DEFAULT 0
                );
                INSERT INTO typing_sessions_new (id, book_id, source, source_label, start_time, end_time, words_typed, chars_typed, errors, wpm, accuracy, duration_seconds, xp_gained, rhythm_score, focus_score)
                SELECT 
                    id, 
                    CASE WHEN book_id = -1 THEN NULL ELSE CAST(book_id AS INTEGER) END, 
                    source, 
                    source_label, 
                    start_time, 
                    end_time, 
                    CAST(words_typed AS INTEGER), 
                    CAST(chars_typed AS INTEGER), 
                    CAST(errors AS INTEGER), 
                    CAST(wpm AS REAL), 
                    CAST(accuracy AS REAL), 
                    CAST(duration_seconds AS INTEGER), 
                    CAST(xp_gained AS INTEGER), 
                    CAST(rhythm_score AS REAL), 
                    CAST(focus_score AS REAL) 
                FROM typing_sessions;
                DROP TABLE typing_sessions;
                ALTER TABLE typing_sessions_new RENAME TO typing_sessions;
                "#,
            )?;
            conn.execute("PRAGMA foreign_keys = ON", [])?;
            conn.execute("PRAGMA user_version = 2", [])?;
        }

        ensure_column(conn, "profile_progress", "total_xp", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "profile_progress", "streak_days", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(conn, "profile_progress", "last_active_day", "TEXT")?;
        ensure_column(conn, "profile_progress", "rested_words_available", "INTEGER NOT NULL DEFAULT 100")?;

        Ok(())
    }

    fn cleanup_corrupted_data(&self, conn: &Connection) -> Result<()> {
        // Fix for "shifted columns" bug where timestamps leaked into source/label columns
        // and numbers leaked into start_time. We identify these by checking the length 
        // of start_time (ISO strings are ~24 chars, corrupted ones are small integers).
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM typing_sessions WHERE length(start_time) < 10",
            [],
            |r| r.get(0)
        )?;

        if count > 0 {
            println!("Cleaning up {} corrupted typing sessions...", count);
            conn.execute(
                "DELETE FROM typing_sessions WHERE length(start_time) < 10",
                []
            )?;
        }

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
                COALESCE(book_sessions.average_wpm, 0.0),
                books.added_at
            FROM books
            LEFT JOIN (
                SELECT book_id, AVG(wpm) AS average_wpm
                FROM typing_sessions
                WHERE book_id > 0
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
                COALESCE(book_sessions.average_wpm, 0.0),
                books.added_at
            FROM books
            LEFT JOIN (
                SELECT book_id, AVG(wpm) AS average_wpm
                FROM typing_sessions
                WHERE book_id > 0
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

        let mut session_stmt = conn.prepare("SELECT id FROM typing_sessions WHERE book_id = ?1")?;
        let session_ids = session_stmt
            .query_map(params![book_id], |row| row.get::<_, i64>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for session_id in session_ids {
            conn.execute("DELETE FROM session_analytics WHERE session_id = ?1", params![session_id])?;
        }

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
        conn.execute("DELETE FROM session_analytics", [])?;
        conn.execute("DELETE FROM typing_sessions", [])?;
        conn.execute(
            "UPDATE profile_progress SET total_xp = 0, streak_days = 0, last_active_day = NULL, rested_words_available = 100 WHERE id = 1",
            [],
        )?;
        conn.execute("DELETE FROM achievements", [])?;
        Ok(())
    }

    pub fn gain_one_level(&self) -> Result<()> {
        let conn = self.connection()?;
        let current_xp: i64 = conn.query_row(
            "SELECT total_xp FROM profile_progress WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        
        let current_level = level_from_xp(current_xp).max(1);
        let next_level = current_level + 1;
        let next_xp = xp_threshold_for_level(next_level);

        conn.execute(
            "UPDATE profile_progress SET total_xp = ? WHERE id = 1",
            [next_xp],
        )?;
        Ok(())
    }

    pub fn delete_library(&self) -> Result<()> {
        let books = self.list_books()?;
        let conn = self.connection()?;
        conn.execute("DELETE FROM session_analytics", [])?;
        conn.execute("DELETE FROM typing_sessions", [])?;
        conn.execute("DELETE FROM books", [])?;
        conn.execute(
            "UPDATE profile_progress SET total_xp = 0, streak_days = 0, last_active_day = NULL, rested_words_available = 100 WHERE id = 1",
            [],
        )?;
        conn.execute("DELETE FROM achievements", [])?;

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

    pub fn finalize_session(
        &self,
        session: &TypingSessionInput,
        context: &SessionContext,
        finalized: &FinalizedAnalytics,
    ) -> Result<SessionSummaryResponse> {
        let mut conn = self.connection()?;
        let tx = conn.transaction()?;

        let before = load_profile(&tx).context("failed to load profile during session finalization")?;
        let day = session
            .end_time
            .get(..10)
            .unwrap_or("")
            .to_string();
        let same_day = before.last_active_day.as_deref() == Some(day.as_str());
        let streak_days = if same_day {
            before.streak_days.max(1)
        } else {
            next_streak_days(before.last_active_day.as_deref(), &day, before.streak_days)
        };
        let rested_words_available = if same_day {
            before.rested_words_available
        } else {
            100
        };

        let accuracy_multiplier = accuracy_multiplier(session.accuracy);
        let cadence_multiplier = if finalized.deep_analytics.rhythm_score >= 90.0 { 1.15 } else { 1.0 };
        let endurance_multiplier = 1.0 + finalized.endurance_segments as f64 * 0.05;
        let base_xp = (session.words_typed as f64 * accuracy_multiplier * cadence_multiplier * endurance_multiplier).round() as i64;
        let rested_words_consumed = rested_words_available.min(session.words_typed.max(0));
        let rested_bonus_xp = (rested_words_consumed as f64 * accuracy_multiplier * cadence_multiplier * endurance_multiplier).round() as i64;
        let is_practice_session = session.source == "test" || session.source == "practice" || session.book_id.is_none();
        let xp_gained = if is_practice_session { 0 } else { base_xp + rested_bonus_xp };
        let total_xp = before.total_xp + xp_gained;
        let level_before = level_from_xp(before.total_xp);
        let level_after = level_from_xp(total_xp);
        let remaining_rested_words = if is_practice_session { rested_words_available } else { (rested_words_available - rested_words_consumed).max(0) };

        tx.execute(
            r#"
            UPDATE profile_progress
            SET total_xp = ?1,
                streak_days = ?2,
                last_active_day = ?3,
                rested_words_available = ?4
            WHERE id = 1
            "#,
            params![total_xp, streak_days, day, remaining_rested_words],
        )?;

        tx.execute(
            r#"
            INSERT INTO typing_sessions
            (
                book_id,
                source,
                source_label,
                start_time,
                end_time,
                words_typed,
                chars_typed,
                errors,
                wpm,
                accuracy,
                duration_seconds,
                xp_gained,
                rhythm_score,
                focus_score
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            "#,
            params![
                if is_practice_session { None } else { session.book_id },
                session.source,
                session.source_label,
                session.start_time,
                session.end_time,
                session.words_typed,
                session.chars_typed,
                session.errors,
                session.wpm,
                session.accuracy,
                session.duration_seconds,
                xp_gained,
                finalized.deep_analytics.rhythm_score,
                finalized.deep_analytics.focus_score
            ],
        )
        .context("failed to persist typing session")?;
        let session_id = tx.last_insert_rowid();

        let layout_rows_json = serde_json::to_string(&context.keyboard_layout.rows).context("failed to serialize layout rows")?;
        let macro_wpm_json = serde_json::to_string(&finalized.deep_analytics.macro_wpm).context("failed to serialize macro wpm")?;
        let macro_accuracy_json = serde_json::to_string(&finalized.deep_analytics.macro_accuracy).context("failed to serialize macro accuracy")?;
        let recent_wpm_json = serde_json::to_string(&finalized.deep_analytics.recent_wpm).context("failed to serialize recent wpm")?;
        let confusion_json = serde_json::to_string(&finalized.deep_analytics.confusion_pairs).context("failed to serialize confusion pairs")?;
        let transition_stats_json = serde_json::to_string(&finalized.transition_stats).context("failed to serialize transition stats")?;

        tx.execute(
            r#"
            INSERT INTO session_analytics
            (
                session_id,
                keyboard_layout_id,
                keyboard_layout_name,
                keyboard_layout_rows_json,
                macro_wpm_json,
                macro_accuracy_json,
                recent_wpm_json,
                confusion_json,
                transition_stats_json,
                cadence_cv,
                active_typing_seconds
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                session_id,
                context.keyboard_layout.id,
                context.keyboard_layout.name,
                layout_rows_json,
                macro_wpm_json,
                macro_accuracy_json,
                recent_wpm_json,
                confusion_json,
                transition_stats_json,
                finalized.deep_analytics.cadence_cv,
                finalized.deep_analytics.active_typing_seconds
            ],
        ).context("failed to persist session analytics")?;

        let total_words_after: i64 = tx.query_row(
            "SELECT CAST(COALESCE(SUM(words_typed), 0) AS INTEGER) FROM typing_sessions",
            [],
            |row| row.get(0),
        )?;
        let existing_achievements = load_achievement_keys(&tx)?;
        let newly_earned_achievements = build_new_achievements(
            session,
            total_words_after,
            &existing_achievements,
            &session.end_time,
        );
        for award in &newly_earned_achievements {
            tx.execute(
                "INSERT OR IGNORE INTO achievements (achievement_key, earned_at) VALUES (?1, ?2)",
                params![award.key, award.earned_at],
            )?;
        }

        tx.commit()?;

        let profile = build_profile_progress(total_xp, streak_days, remaining_rested_words);
        Ok(SessionSummaryResponse {
            session_id,
            xp_gained,
            rested_bonus_xp,
            accuracy_multiplier,
            cadence_multiplier,
            endurance_multiplier,
            level_before,
            level_after,
            unlocked_rewards: reward_messages(level_before, level_after),
            newly_earned_achievements,
            profile,
            deep_analytics: finalized.deep_analytics.clone(),
            session_point: SessionPoint {
                id: session_id,
                book_id: session.book_id,
                title: session.source_label.clone(),
                source: session.source.clone(),
                start_time: session.start_time.clone(),
                end_time: session.end_time.clone(),
                duration_seconds: session.duration_seconds,
                words_typed: session.words_typed,
                chars_typed: session.chars_typed,
                wpm: session.wpm,
                accuracy: session.accuracy,
                xp_gained,
                rhythm_score: finalized.deep_analytics.rhythm_score,
                focus_score: finalized.deep_analytics.focus_score,
            },
        })
    }

    pub fn analytics(&self) -> Result<AnalyticsSummary> {
        let conn = self.connection()?;
        let (total_words_typed, total_chars_typed, total_time_seconds, average_wpm, average_accuracy, sessions) = conn.query_row(
            r#"
            SELECT 
                CAST(COALESCE(SUM(words_typed), 0) AS INTEGER), 
                CAST(COALESCE(SUM(chars_typed), 0) AS INTEGER), 
                CAST(COALESCE(SUM(duration_seconds), 0) AS INTEGER), 
                COALESCE(AVG(wpm), 0.0), 
                COALESCE(AVG(accuracy), 100.0), 
                COUNT(*) 
            FROM typing_sessions
            WHERE words_typed >= 5 AND source NOT IN ('read', 'reader')
            "#,
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            },
        )?;

        let mut history_stmt = conn.prepare(
            r#"
            SELECT
                substr(start_time, 1, 10) AS day,
                AVG(wpm),
                AVG(accuracy),
                COUNT(*)
            FROM typing_sessions
            WHERE words_typed >= 5 AND source NOT IN ('read', 'reader')
            GROUP BY substr(start_time, 1, 10)
            ORDER BY day ASC
            "#,
        )?;
        let history = history_stmt
            .query_map([], |row| {
                Ok(crate::models::DailyMetric {
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
                CASE WHEN typing_sessions.book_id > 0 THEN CAST(typing_sessions.book_id AS INTEGER) ELSE NULL END,
                CASE
                    WHEN typing_sessions.source = 'book' THEN COALESCE(books.title, typing_sessions.source_label)
                    ELSE typing_sessions.source_label
                END AS title,
                typing_sessions.source,
                typing_sessions.start_time,
                typing_sessions.end_time,
                CAST(typing_sessions.duration_seconds AS INTEGER),
                CAST(typing_sessions.words_typed AS INTEGER),
                CAST(typing_sessions.chars_typed AS INTEGER),
                CAST(typing_sessions.wpm AS REAL),
                CAST(typing_sessions.accuracy AS REAL),
                CAST(typing_sessions.xp_gained AS INTEGER),
                CAST(typing_sessions.rhythm_score AS REAL),
                CAST(typing_sessions.focus_score AS REAL)
            FROM typing_sessions
            LEFT JOIN books ON books.id = typing_sessions.book_id
            WHERE typing_sessions.words_typed >= 5 AND typing_sessions.source NOT IN ('read', 'reader')
            ORDER BY typing_sessions.start_time DESC
            LIMIT 100
            "#,
        )?;
        let session_points = session_stmt
            .query_map([], |row| {
                Ok(SessionPoint {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    title: row.get(2)?,
                    source: row.get(3)?,
                    start_time: row.get(4)?,
                    end_time: row.get(5)?,
                    duration_seconds: row.get(6)?,
                    words_typed: row.get(7)?,
                    chars_typed: row.get(8)?,
                    wpm: row.get(9)?,
                    accuracy: row.get(10)?,
                    xp_gained: row.get(11)?,
                    rhythm_score: row.get(12)?,
                    focus_score: row.get(13)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let profile_row = load_profile(&conn)?;
        let profile = build_profile_progress(
            profile_row.total_xp,
            profile_row.streak_days,
            profile_row.rested_words_available,
        );

        let mut achievement_stmt = conn.prepare(
            "SELECT achievement_key, earned_at FROM achievements ORDER BY earned_at ASC",
        )?;
        let achievements = achievement_stmt
            .query_map([], |row| {
                Ok(AchievementAward {
                    key: row.get(0)?,
                    earned_at: row.get(1)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let latest_deep_analytics = self.latest_deep_analytics(&conn)?;
        let (aggregate_confusions, aggregate_transitions) = self.aggregate_deep_analytics(&conn)?;

        Ok(AnalyticsSummary {
            total_words_typed,
            total_chars_typed,
            total_time_seconds,
            average_wpm,
            average_accuracy,
            sessions,
            history,
            session_points,
            profile,
            achievements,
            latest_deep_analytics,
            aggregate_confusions,
            aggregate_transitions,
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
                tab_to_skip,
                ignore_quotation_marks,
                ignored_characters,
                focus_mode,
                keyboard_layout,
                custom_keyboard_layout,
                smooth_caret,
                type_test_duration,
                versus_bot_cpm,
                practice_word_bank_type,
                error_color
            FROM settings
            WHERE id = 1
            "#,
            [],
            |row| {
                Ok(AppSettings {
                    theme: row.get(0)?,
                    font: row.get(1)?,
                    reader_mode: row.get(2)?,
                    interaction_mode: row.get(3)?,
                    base_font_size: row.get(4)?,
                    line_height: row.get(5)?,
                    tab_to_skip: row.get::<_, i64>(6)? == 1,
                    ignore_quotation_marks: row.get::<_, i64>(7)? == 1,
                    ignored_characters: row.get(8)?,
                    focus_mode: row.get::<_, i64>(9)? == 1,
                    keyboard_layout: row.get(10)?,
                    custom_keyboard_layout: row.get(11)?,
                    smooth_caret: row.get::<_, i64>(12)? == 1,
                    type_test_duration: row.get(13)?,
                    versus_bot_cpm: row.get(14)?,
                    practice_word_bank_type: row.get(15)?,
                    error_color: row.get(16)?,
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
                tab_to_skip = ?7,
                ignore_quotation_marks = ?8,
                ignored_characters = ?9,
                focus_mode = ?10,
                keyboard_layout = ?11,
                custom_keyboard_layout = ?12,
                smooth_caret = ?13,
                type_test_duration = ?14,
                versus_bot_cpm = ?15,
                practice_word_bank_type = ?16,
                error_color = ?17
            WHERE id = 1
            "#,
            params![
                settings.theme,
                settings.font,
                settings.reader_mode,
                settings.interaction_mode,
                settings.base_font_size,
                settings.line_height,
                if settings.tab_to_skip { 1 } else { 0 },
                if settings.ignore_quotation_marks { 1 } else { 0 },
                settings.ignored_characters,
                if settings.focus_mode { 1 } else { 0 },
                settings.keyboard_layout,
                settings.custom_keyboard_layout,
                if settings.smooth_caret { 1 } else { 0 },
                settings.type_test_duration,
                settings.versus_bot_cpm,
                settings.practice_word_bank_type.clone(),
                settings.error_color.clone()
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
                COALESCE(book_sessions.average_wpm, 0.0),
                books.added_at
            FROM books
            LEFT JOIN (
                SELECT book_id, AVG(wpm) AS average_wpm
                FROM typing_sessions
                WHERE book_id > 0
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

    fn latest_deep_analytics(&self, conn: &Connection) -> Result<Option<DeepAnalytics>> {
        let row = conn
            .query_row(
                r#"
                SELECT
                    session_analytics.macro_wpm_json,
                    session_analytics.macro_accuracy_json,
                    session_analytics.recent_wpm_json,
                    session_analytics.confusion_json,
                    session_analytics.transition_stats_json,
                    typing_sessions.rhythm_score,
                    session_analytics.cadence_cv,
                    typing_sessions.focus_score,
                    session_analytics.active_typing_seconds
                FROM session_analytics
                INNER JOIN typing_sessions ON typing_sessions.id = session_analytics.session_id
                ORDER BY typing_sessions.start_time DESC
                LIMIT 1
                "#,
                [],
                |row| {
                    Ok(DeepAnalytics {
                        macro_wpm: serde_json::from_str::<Vec<crate::models::WpmSample>>(&row.get::<_, String>(0)?)
                            .unwrap_or_default(),
                        macro_accuracy: serde_json::from_str::<Vec<crate::models::WpmSample>>(&row.get::<_, String>(1)?)
                            .unwrap_or_default(),
                        recent_wpm: serde_json::from_str::<Vec<crate::models::WpmSample>>(&row.get::<_, String>(2)?)
                            .unwrap_or_default(),
                        confusion_pairs: serde_json::from_str::<Vec<ConfusionPair>>(&row.get::<_, String>(3)?)
                            .unwrap_or_default(),
                        transitions: group_transition_stats(
                            &serde_json::from_str::<Vec<TransitionStat>>(&row.get::<_, String>(4)?).unwrap_or_default(),
                        ),
                        rhythm_score: row.get(5)?,
                        cadence_cv: row.get(6)?,
                        focus_score: row.get(7)?,
                        active_typing_seconds: row.get(8)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    fn aggregate_deep_analytics(&self, conn: &Connection) -> Result<(Vec<ConfusionPair>, crate::models::TransitionGroups)> {
        let mut stmt = conn.prepare(
            "SELECT confusion_json, transition_stats_json FROM session_analytics",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut confusion_map = HashMap::<(String, String), i64>::new();
        let mut transition_map = HashMap::<String, TransitionAggregate>::new();

        for row in rows {
            let (confusion_json, transition_json) = row?;
            for pair in serde_json::from_str::<Vec<ConfusionPair>>(&confusion_json).unwrap_or_default() {
                *confusion_map
                    .entry((pair.expected.clone(), pair.typed.clone()))
                    .or_default() += pair.count;
            }
            for stat in serde_json::from_str::<Vec<TransitionStat>>(&transition_json).unwrap_or_default() {
                transition_map
                    .entry(stat.combo.clone())
                    .or_default()
                    .merge_stat(&stat);
            }
        }

        let mut confusions = confusion_map
            .into_iter()
            .map(|((expected, typed), count)| ConfusionPair { expected, typed, count })
            .collect::<Vec<_>>();
        confusions.sort_by(|left, right| right.count.cmp(&left.count));
        confusions.truncate(96);

        let transition_stats = transition_map
            .into_iter()
            .map(|(combo, aggregate)| aggregate.to_stat(combo))
            .collect::<Vec<_>>();

        Ok((confusions, group_transition_stats(&transition_stats)))
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

fn load_profile(conn: &Connection) -> Result<StoredProfile> {
    conn.query_row(
        "SELECT total_xp, streak_days, last_active_day, rested_words_available FROM profile_progress WHERE id = 1",
        [],
        |row| {
            Ok(StoredProfile {
                total_xp: row.get(0)?,
                streak_days: row.get(1)?,
                last_active_day: row.get(2)?,
                rested_words_available: row.get(3)?,
            })
        },
    )
    .context("failed to load profile progress")
}

fn load_achievement_keys(conn: &Connection) -> Result<HashSet<String>> {
    let mut stmt = conn.prepare("SELECT achievement_key FROM achievements")?;
    let keys = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<HashSet<_>, _>>()?;
    Ok(keys)
}

fn build_new_achievements(
    session: &TypingSessionInput,
    total_words_after: i64,
    existing: &HashSet<String>,
    earned_at: &str,
) -> Vec<AchievementAward> {
    let speed_thresholds = [30, 50, 70, 100, 130, 160, 200];
    let duration_thresholds = [1, 2, 5, 10, 15, 20, 30, 45, 60];
    let total_word_thresholds = [100, 500, 1000, 5000, 10_000, 50_000, 100_000];

    let mut keys = Vec::<String>::new();
    for threshold in speed_thresholds {
        if session.wpm >= threshold as f64 {
            keys.push(format!("speed-{threshold}"));
        }
    }
    for minutes in duration_thresholds {
        if session.duration_seconds >= minutes * 60 {
            keys.push(format!("duration-{minutes}"));
        }
    }
    for threshold in total_word_thresholds {
        if total_words_after >= threshold {
            keys.push(format!("words-{threshold}"));
        }
    }
    if (session.accuracy - 100.0).abs() <= f64::EPSILON {
        keys.push("accuracy-100".to_string());
    }

    keys.into_iter()
        .filter(|key| !existing.contains(key))
        .map(|key| AchievementAward {
            key,
            earned_at: earned_at.to_string(),
        })
        .collect()
}

fn next_streak_days(previous_day: Option<&str>, current_day: &str, current_streak: i64) -> i64 {
    let Some(previous_day) = previous_day else {
        return 1;
    };
    let Ok(previous) = NaiveDate::parse_from_str(previous_day, "%Y-%m-%d") else {
        return 1;
    };
    let Ok(current) = NaiveDate::parse_from_str(current_day, "%Y-%m-%d") else {
        return 1;
    };

    match current.signed_duration_since(previous).num_days() {
        0 => current_streak.max(1),
        1 => current_streak.max(1) + 1,
        _ => 1,
    }
}

fn accuracy_multiplier(accuracy: f64) -> f64 {
    if (accuracy - 100.0).abs() <= f64::EPSILON {
        2.0
    } else if accuracy >= 98.0 {
        1.5
    } else if accuracy >= 95.0 {
        1.2
    } else {
        1.0
    }
}

fn build_profile_progress(total_xp: i64, streak_days: i64, rested_words_available: i64) -> ProfileProgress {
    let level = level_from_xp(total_xp);
    let current_level_xp = xp_threshold_for_level(level);
    let next_level_xp = xp_threshold_for_level(level + 1);
    ProfileProgress {
        total_xp,
        level,
        title: title_for_level(level),
        current_level_xp,
        next_level_xp,
        progress_to_next_level: if next_level_xp <= current_level_xp {
            1.0
        } else {
            ((total_xp - current_level_xp) as f64 / (next_level_xp - current_level_xp) as f64).clamp(0.0, 1.0)
        },
        streak_days,
        rested_words_available,
        unlocks: unlocks_for_level(level),
    }
}

fn level_from_xp(total_xp: i64) -> i64 {
    let mut level = 1_i64;
    while xp_threshold_for_level(level + 1) <= total_xp {
        level += 1;
    }
    level
}

fn xp_threshold_for_level(level: i64) -> i64 {
    if level <= 1 {
        0
    } else {
        (1000.0 * (level as f64).powf(1.5)).round() as i64
    }
}

fn title_for_level(level: i64) -> String {
    if level >= 100 {
        "Grandmaster".to_string()
    } else if level >= 50 {
        "Lexicon".to_string()
    } else if level >= 25 {
        "Archivist".to_string()
    } else if level >= 10 {
        "Scribe".to_string()
    } else {
        "Initiate".to_string()
    }
}

fn unlocks_for_level(level: i64) -> UnlockState {
    UnlockState {
        dracula_theme: level >= 5,
        nord_theme: level >= 5,
        smooth_caret: level >= 10,
        premium_typography: level >= 15,
        ghost_pacer: level >= 25,
        custom_error_colors: level >= 50,
    }
}

fn reward_messages(level_before: i64, level_after: i64) -> Vec<String> {
    let rewards = [
        (5, "Dracula and Nord themes unlocked"),
        (10, "Smooth caret unlocked"),
        (15, "Premium typography unlocked"),
        (25, "Ghost pacer unlocked"),
        (50, "Custom error colors unlocked"),
    ];

    rewards
        .into_iter()
        .filter(|(level, _)| *level > level_before && *level <= level_after)
        .map(|(_, label)| label.to_string())
        .collect()
}
