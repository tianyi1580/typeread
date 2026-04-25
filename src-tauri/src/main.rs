mod analytics;
mod db;
mod models;
mod parser;

use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use analytics::{FinalizedAnalytics, LiveSessionAnalytics};
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
fn import_book_paths(paths: Vec<String>, state: tauri::State<'_, AppState>) -> Result<Vec<models::BookRecord>, String> {
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
    let parsed = parse_file(std::path::Path::new(&record.path), &state.covers_dir).map_err(to_message)?;
    Ok(ParsedBook {
        record,
        chapters: parsed.chapters,
    })
}

#[tauri::command]
fn update_progress(book_id: i64, current_index: i64, current_chapter: i64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .update_progress(book_id, current_index, current_chapter)
        .map_err(to_message)
}

#[tauri::command]
fn rename_book(book_id: i64, title: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("Book title cannot be empty.".to_string());
    }
    state.db.rename_book(book_id, &title).map_err(to_message)
}

#[tauri::command]
fn set_book_pinned(book_id: i64, pinned: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.set_book_pinned(book_id, pinned).map_err(to_message)
}

#[tauri::command]
fn delete_book(book_id: i64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.db.delete_book(book_id).map_err(to_message)
}

#[tauri::command]
fn save_session(session: TypingSessionInput, state: tauri::State<'_, AppState>) -> Result<(), String> {
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
    let mut sessions = state
        .live_sessions
        .lock()
        .map_err(|_| "failed to lock live analytics sessions".to_string())?;

    let mut live = sessions
        .remove(&payload.session_key)
        .unwrap_or_else(|| LiveSessionAnalytics::new(payload.context.clone()));

    let buffered_events = live.push_events(&payload.events);

    if let Some(finalize_session) = payload.finalize_session {
        drop(sessions);
        let finalized = live.finalize(&finalize_session);
        let saved = state
            .db
            .finalize_session(&finalize_session, &payload.context, &finalized)
            .map_err(to_message)?;
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

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.get_settings().map_err(to_message)
}

#[tauri::command]
fn save_settings(settings: AppSettings, state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
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
    state.db.delete_library().map_err(to_message)
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
    Ok(AppState {
        db,
        covers_dir,
        live_sessions: Arc::new(Mutex::new(HashMap::new())),
    })
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

fn import_book_files(paths: Vec<PathBuf>, state: &AppState) -> Result<Vec<models::BookRecord>, String> {
    let existing = state.db.list_books().map_err(to_message)?;
    if existing.len() >= 10 {
        return Err("The library is capped at 10 active books. Remove something before importing more.".to_string());
    }

    let mut imported = Vec::new();
    for path in paths.into_iter().take(10usize.saturating_sub(existing.len())) {
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
            delete_library
        ])
        .run(tauri::generate_context!())
        .expect("failed to run application");
}
