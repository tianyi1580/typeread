mod db;
mod models;
mod parser;

use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use db::Database;
use models::{AnalyticsSummary, AppSettings, ParsedBook, TypingSessionInput};
use parser::parse_file;
use tauri::Manager;

#[derive(Clone)]
struct AppState {
    db: Database,
    covers_dir: std::path::PathBuf,
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
    state.db.save_session(&session).map_err(to_message)
}

#[tauri::command]
fn get_analytics(state: tauri::State<'_, AppState>) -> Result<AnalyticsSummary, String> {
    state.db.analytics().map_err(to_message)
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
        .set_file_name("booktyper-backup.sqlite")
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
    let database_path = app_data_dir.join("booktyper.sqlite");
    let db = Database::new(database_path)?;
    Ok(AppState { db, covers_dir })
}

fn to_message(error: anyhow::Error) -> String {
    error.to_string()
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
