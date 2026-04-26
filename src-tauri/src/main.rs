mod analytics;
mod db;
mod models;
mod parser;
mod welcome;

use welcome::WELCOME_BOOK_CONTENT;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use analytics::{FinalizedAnalytics, LiveSessionAnalytics};
use anyhow::{Context, Result};
use db::Database;
use models::{
    AnalyticsSummary, AppSettings, DeepAnalytics, KeyboardLayoutDefinition, ParsedBook,
    ProcessKeystrokeBatchInput, ProcessKeystrokeBatchResult, SessionContext, TransitionGroups,
    TypingSessionInput,
};
use parser::parse_file;
use tauri::Manager;

#[derive(Clone)]
struct AppState {
    db: Database,
    covers_dir: std::path::PathBuf,
    app_data_dir: std::path::PathBuf,
    live_sessions: Arc<Mutex<HashMap<String, LiveSessionAnalytics>>>,
}

#[tauri::command]
fn import_books(state: tauri::State<'_, AppState>) -> Result<Vec<models::BookRecord>, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Books", &["epub", "md", "txt"])
        .pick_files()
        .unwrap_or_default();

    import_book_files(files, &state)
}

#[tauri::command]
fn import_book_paths(
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<models::BookRecord>, String> {
    let resolved = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    import_book_files(resolved, &state)
}

#[tauri::command]
fn list_books(state: tauri::State<'_, AppState>) -> Result<Vec<models::BookRecord>, String> {
    state.db.list_books().map_err(to_message)
}

#[tauri::command]
fn load_book(book_id: i64, state: tauri::State<'_, AppState>) -> Result<ParsedBook, String> {
    let record = state
        .db
        .get_book(book_id)
        .map_err(to_message)?
        .ok_or_else(|| "Book not found.".to_string())?;
    let parsed =
        parse_file(std::path::Path::new(&record.path), &state.covers_dir).map_err(to_message)?;
    Ok(ParsedBook {
        record,
        chapters: parsed.chapters,
    })
}

#[tauri::command]
fn update_progress(
    book_id: i64,
    current_index: i64,
    current_chapter: i64,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .update_progress(book_id, current_index, current_chapter)
        .map_err(to_message)
}

#[tauri::command]
fn update_read_progress(
    book_id: i64,
    read_index: i64,
    read_chapter: i64,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .update_read_progress(book_id, read_index, read_chapter)
        .map_err(to_message)
}

#[tauri::command]
fn rename_book(
    book_id: i64,
    title: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("Book title cannot be empty.".to_string());
    }
    state.db.rename_book(book_id, &title).map_err(to_message)
}

#[tauri::command]
fn set_book_pinned(
    book_id: i64,
    pinned: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .set_book_pinned(book_id, pinned)
        .map_err(to_message)
}

#[tauri::command]
fn delete_book(book_id: i64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.delete_book(book_id).map_err(to_message)?;
    let _ = ensure_default_book(&state, &state.app_data_dir);
    Ok(())
}

#[tauri::command]
fn save_session(
    session: TypingSessionInput,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let fallback_context = SessionContext {
        book_id: session.book_id,
        source: session.source.clone(),
        source_label: session.source_label.clone(),
        keyboard_layout: KeyboardLayoutDefinition {
            id: "qwerty-us".to_string(),
            name: "QWERTY (US)".to_string(),
            rows: vec![
                "1234567890-=".to_string(),
                "qwertyuiop[]\\".to_string(),
                "asdfghjkl;'".to_string(),
                "zxcvbnm,./".to_string(),
            ],
        },
    };
    let fallback_finalized = FinalizedAnalytics {
        deep_analytics: DeepAnalytics {
            macro_wpm: Vec::new(),
            macro_accuracy: Vec::new(),
            recent_wpm: Vec::new(),
            confusion_pairs: Vec::new(),
            transitions: TransitionGroups::default(),
            rhythm_score: 0.0,
            cadence_cv: 0.0,
            focus_score: 100.0,
            active_typing_seconds: session.duration_seconds,
        },
        transition_stats: Vec::new(),
        endurance_segments: 0,
    };
    state
        .db
        .finalize_session(&session, &fallback_context, &fallback_finalized)
        .map(|_| ())
        .map_err(to_message)
}

#[tauri::command]
fn get_analytics(state: tauri::State<'_, AppState>) -> Result<AnalyticsSummary, String> {
    state.db.analytics().map_err(to_message)
}

#[tauri::command]
fn process_keystroke_batch(
    payload: ProcessKeystrokeBatchInput,
    state: tauri::State<'_, AppState>,
) -> Result<ProcessKeystrokeBatchResult, String> {
    process_keystroke_batch_inner(&state.live_sessions, &state.db, payload)
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.get_settings().map_err(to_message)
}

#[tauri::command]
fn save_settings(
    settings: AppSettings,
    state: tauri::State<'_, AppState>,
) -> Result<AppSettings, String> {
    state.db.save_settings(&settings).map_err(to_message)
}

#[tauri::command]
fn export_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("SQLite", &["sqlite", "db"])
        .set_file_name("typeread-backup.sqlite")
        .save_file()
    else {
        return Ok(());
    };

    state.db.export_to(&path).map_err(to_message)
}

#[tauri::command]
fn import_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("SQLite", &["sqlite", "db"])
        .pick_file()
    else {
        return Ok(());
    };

    state.db.import_from(&path).map_err(to_message)
}

#[tauri::command]
fn clear_session_history(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.clear_session_history().map_err(to_message)
}

#[tauri::command]
fn delete_library(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.delete_library().map_err(to_message)?;
    let _ = ensure_default_book(&state, &state.app_data_dir);
    Ok(())
}

#[tauri::command]
fn gain_one_level(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.gain_one_level().map_err(to_message)
}

fn prepare_state(app: &tauri::AppHandle) -> Result<AppState> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data directory")?;
    let covers_dir = app_data_dir.join("covers");
    fs::create_dir_all(&covers_dir).context("failed to create covers directory")?;
    let database_path = app_data_dir.join("typeread.sqlite");
    let db = Database::new(database_path)?;
    let state = AppState {
        db,
        covers_dir,
        app_data_dir: app_data_dir.clone(),
        live_sessions: Arc::new(Mutex::new(HashMap::new())),
    };

    ensure_default_book(&state, &app_data_dir)?;

    Ok(state)
}

fn ensure_default_book(state: &AppState, app_data_dir: &std::path::Path) -> Result<()> {
    let existing = state.db.list_books()?;
    if existing.is_empty() {
        let welcome_path = app_data_dir.join("Welcome to TypeRead.md");
        // Always overwrite the default file to ensure content updates in welcome.rs are reflected
        fs::write(&welcome_path, WELCOME_BOOK_CONTENT)
            .context("failed to write default welcome book")?;
        import_book_files(vec![welcome_path], state).map_err(|e| anyhow::anyhow!(e))?;
    }
    Ok(())
}

fn to_message(error: anyhow::Error) -> String {
    let mut message = error.to_string();
    let mut current = error.source();
    while let Some(source) = current {
        message.push_str(": ");
        message.push_str(&source.to_string());
        current = source.source();
    }
    println!("API Error: {}", message);
    message
}

fn import_book_files(
    paths: Vec<PathBuf>,
    state: &AppState,
) -> Result<Vec<models::BookRecord>, String> {
    let existing = state.db.list_books().map_err(to_message)?;
    if existing.len() >= 10 {
        return Err(
            "The library is capped at 10 active books. Remove something before importing more."
                .to_string(),
        );
    }

    let mut imported = Vec::new();
    for path in paths
        .into_iter()
        .take(10usize.saturating_sub(existing.len()))
    {
        let parsed = parse_file(&path, &state.covers_dir).map_err(to_message)?;
        let record = state
            .db
            .upsert_book(
                &parsed.title,
                parsed.author.as_deref(),
                &path.to_string_lossy(),
                &parsed.format,
                parsed.cover_path.as_deref(),
                parsed.total_chars,
            )
            .map_err(to_message)?;
        imported.push(record);
    }

    Ok(imported)
}

fn process_keystroke_batch_inner(
    live_sessions: &Mutex<HashMap<String, LiveSessionAnalytics>>,
    db: &Database,
    payload: ProcessKeystrokeBatchInput,
) -> Result<ProcessKeystrokeBatchResult, String> {
    let mut sessions = live_sessions
        .lock()
        .map_err(|_| "failed to lock live analytics sessions".to_string())?;

    let mut live = sessions
        .remove(&payload.session_key)
        .unwrap_or_else(|| LiveSessionAnalytics::new(payload.context.clone()));

    let buffered_events = live.push_events(&payload.events);

    if let Some(finalize_session) = payload.finalize_session {
        drop(sessions);
        // Keep the session in memory on failure so buffered analytics are not
        // discarded by a transient database error during finalization.
        let finalized = live.clone().finalize(&finalize_session);
        let saved = match db.finalize_session(&finalize_session, &payload.context, &finalized) {
            Ok(saved) => saved,
            Err(error) => {
                let mut sessions = live_sessions
                    .lock()
                    .map_err(|_| "failed to lock live analytics sessions".to_string())?;
                sessions.insert(payload.session_key, live);
                return Err(to_message(error));
            }
        };

        return Ok(ProcessKeystrokeBatchResult {
            buffered_events,
            saved_session: Some(saved),
        });
    }

    sessions.insert(payload.session_key, live);
    Ok(ProcessKeystrokeBatchResult {
        buffered_events,
        saved_session: None,
    })
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let state = prepare_state(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_books,
            list_books,
            load_book,
            update_progress,
            update_read_progress,
            rename_book,
            set_book_pinned,
            delete_book,
            save_session,
            process_keystroke_batch,
            get_analytics,
            get_settings,
            save_settings,
            import_book_paths,
            export_database,
            import_database,
            clear_session_history,
            delete_library,
            gain_one_level
        ])
        .run(tauri::generate_context!())
        .expect("failed to run application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Context;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_db_path(label: &str) -> Result<PathBuf> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .context("system clock is before unix epoch")?
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("typeread-main-{label}-{timestamp}"));
        fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;
        Ok(dir.join("typeread.sqlite"))
    }

    fn test_context() -> SessionContext {
        SessionContext {
            book_id: Some(1),
            source: "book".to_string(),
            source_label: "Test Book".to_string(),
            keyboard_layout: KeyboardLayoutDefinition {
                id: "qwerty-us".to_string(),
                name: "QWERTY (US)".to_string(),
                rows: vec![
                    "1234567890-=".to_string(),
                    "qwertyuiop[]\\".to_string(),
                    "asdfghjkl;'".to_string(),
                    "zxcvbnm,./".to_string(),
                ],
            },
        }
    }

    fn test_payload() -> ProcessKeystrokeBatchInput {
        ProcessKeystrokeBatchInput {
            session_key: "session-key".to_string(),
            context: test_context(),
            events: vec![models::KeystrokeEvent {
                at: 1_000,
                r#type: "char".to_string(),
                char: Some("a".to_string()),
                expected: Some("a".to_string()),
                is_correct: Some(true),
                layout: Some("qwerty-us".to_string()),
                cursor_index: Some(0),
                skipped_word: Some(false),
                correct_chars: Some(1),
                typed_chars: Some(1),
                errors: Some(0),
            }],
            finalize_session: Some(TypingSessionInput {
                book_id: Some(1),
                source: "book".to_string(),
                source_label: "Test Book".to_string(),
                start_time: "2026-04-26T12:00:00Z".to_string(),
                end_time: "2026-04-26T12:00:10Z".to_string(),
                words_typed: 10,
                chars_typed: 50,
                errors: 0,
                wpm: 60.0,
                accuracy: 100.0,
                duration_seconds: 10,
            }),
        }
    }

    #[test]
    fn failed_session_finalization_keeps_live_session_state() -> Result<()> {
        let db_path = test_db_path("finalize-failure")?;
        let db = Database::new(&db_path)?;
        let conn = db.connection()?;
        conn.execute("DROP TABLE profile_progress", [])
            .context("failed to break database for test")?;

        let live_sessions = Mutex::new(HashMap::new());
        let result = process_keystroke_batch_inner(&live_sessions, &db, test_payload());
        assert!(result.is_err());
        assert!(live_sessions
            .lock()
            .expect("live sessions lock")
            .contains_key("session-key"));

        let _ = fs::remove_file(&db_path);
        let _ = fs::remove_dir_all(
            db_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        );
        Ok(())
    }
}
