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
    AnalyticsSummary, AppSettings, DeepAnalytics, KeyboardLayoutDefinition,
    ProcessKeystrokeBatchInput, ProcessKeystrokeBatchResult, SessionContext, TransitionGroups,
    TypingSessionInput,
};
use parser::parse_file;
use tauri::{Emitter, Manager};

#[derive(Clone)]
struct AppState {
    db: Database,
    covers_dir: std::path::PathBuf,
    app_data_dir: std::path::PathBuf,
    live_sessions: Arc<Mutex<HashMap<String, LiveSessionAnalytics>>>,
    parsed_cache: Arc<Mutex<HashMap<std::path::PathBuf, models::ParsedImport>>>,
}

#[tauri::command]
async fn import_books(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<models::BookRecord>, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Books", &["epub", "md", "txt", "pdf"])
        .pick_files()
        .unwrap_or_default();

    import_book_files(Some(window), files, state.inner().clone()).await
}

#[tauri::command]
async fn import_book_paths(
    window: tauri::Window,
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<models::BookRecord>, String> {
    let resolved = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    import_book_files(Some(window), resolved, state.inner().clone()).await
}

#[tauri::command]
async fn list_books(state: tauri::State<'_, AppState>) -> Result<Vec<models::BookRecord>, String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.list_books().map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn load_book(
    book_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<models::ParsedBook, String> {
    let state_inner = state.inner().clone();
    let record = tauri::async_runtime::spawn_blocking(move || {
        state_inner
            .db
            .get_book(book_id)
            .map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())??
    .ok_or_else(|| "Book not found.".to_string())?;

    let path = PathBuf::from(&record.path);

    // Check cache first
    {
        let cache = state.parsed_cache.lock().unwrap();
        if let Some(parsed) = cache.get(&path) {
            return Ok(models::ParsedBook {
                record,
                chapters: parsed.chapters.clone(),
            });
        }
    }

    // Parse in background if not cached
    let state_inner = state.inner().clone();
    let path_clone = path.clone();
    let parsed = tauri::async_runtime::spawn_blocking(move || {
        parser::parse_file(&path_clone, &state_inner.covers_dir)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(to_message)?;

    // Cache the result
    {
        let mut cache = state.parsed_cache.lock().unwrap();
        cache.insert(path, parsed.clone());
    }

    Ok(models::ParsedBook {
        record,
        chapters: parsed.chapters,
    })
}

#[tauri::command]
async fn update_progress(
    book_id: i64,
    current_index: i64,
    current_chapter: i64,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner
            .db
            .update_progress(book_id, current_index, current_chapter)
            .map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_read_progress(
    book_id: i64,
    read_index: i64,
    read_chapter: i64,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner
            .db
            .update_read_progress(book_id, read_index, read_chapter)
            .map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn rename_book(
    book_id: i64,
    title: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("Book title cannot be empty.".to_string());
    }
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.rename_book(book_id, &title).map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_book_pinned(
    book_id: i64,
    pinned: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner
            .db
            .set_book_pinned(book_id, pinned)
            .map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_book(book_id: i64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let state_inner = state.inner().clone();
    let db_clone = state_inner.db.clone();
    
    let book = tauri::async_runtime::spawn_blocking(move || {
        db_clone.get_book(book_id).map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())??;

    let db_clone = state_inner.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db_clone.delete_book(book_id).map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Some(record) = book {
        let path = PathBuf::from(&record.path);
        let mut cache = state_inner.parsed_cache.lock().unwrap();
        cache.remove(&path);
    }

    ensure_default_book(&state_inner, &state_inner.app_data_dir)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn save_session(
    session: TypingSessionInput,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
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
        state_inner
            .db
            .finalize_session(&session, &fallback_context, &fallback_finalized)
            .map(|_| ())
            .map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_analytics(state: tauri::State<'_, AppState>) -> Result<AnalyticsSummary, String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.analytics().map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn process_keystroke_batch(
    payload: ProcessKeystrokeBatchInput,
    state: tauri::State<'_, AppState>,
) -> Result<ProcessKeystrokeBatchResult, String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        process_keystroke_batch_inner(&state_inner.live_sessions, &state_inner.db, payload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.get_settings().map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_settings(
    settings: AppSettings,
    state: tauri::State<'_, AppState>,
) -> Result<AppSettings, String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.save_settings(&settings).map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("SQLite", &["sqlite", "db"])
        .set_file_name("typeread-backup.sqlite")
        .save_file()
    else {
        return Ok(());
    };

    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.export_to(&path).map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_database(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("SQLite", &["sqlite", "db"])
        .pick_file()
    else {
        return Ok(());
    };

    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.import_from(&path).map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clear_session_history(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.clear_session_history().map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_library(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let state_inner = state.inner().clone();
    let db_clone = state_inner.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db_clone.delete_library().map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())??;

    {
        let mut cache = state_inner.parsed_cache.lock().unwrap();
        cache.clear();
    }

    ensure_default_book(&state_inner, &state_inner.app_data_dir)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn gain_one_level(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.gain_one_level().map_err(to_message)
    })
    .await
    .map_err(|e| e.to_string())?
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
        parsed_cache: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::async_runtime::block_on(ensure_default_book(&state, &app_data_dir))?;

    Ok(state)
}

async fn ensure_default_book(state: &AppState, app_data_dir: &std::path::Path) -> Result<()> {
    let existing = state.db.list_books()?;
    if existing.is_empty() {
        let welcome_path = app_data_dir.join("Welcome to TypeRead.md");
        // Always overwrite the default file to ensure content updates in welcome.rs are reflected
        fs::write(&welcome_path, WELCOME_BOOK_CONTENT)
            .context("failed to write default welcome book")?;
        import_book_files(None, vec![welcome_path], state.clone())
            .await
            .map_err(|e| anyhow::anyhow!(e))?;
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

async fn import_book_files(
    window: Option<tauri::Window>,
    paths: Vec<PathBuf>,
    state: AppState,
) -> Result<Vec<models::BookRecord>, String> {
    let state_inner = state.clone();
    let existing = tauri::async_runtime::spawn_blocking(move || {
        state_inner.db.list_books()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(to_message)?;

    if existing.len() >= 10 {
        return Err(
            "The library is capped at 10 active books. Remove something before importing more."
                .to_string(),
        );
    }

    let mut imported = Vec::new();
    let remaining_slots = 10usize.saturating_sub(existing.len());
    
    for path in paths.into_iter().take(remaining_slots) {
        let path_str = path.to_string_lossy().to_string();
        if let Some(ref w) = window {
            let _ = w.emit("import-started", &path_str);
        }
        
        let state_clone = state.clone();
        let path_clone = path.clone();
        
        let result = tauri::async_runtime::spawn_blocking(move || {
            let mut final_path = path_clone.clone();
            
            let extension = path_clone
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase());
                
            if extension.as_deref() == Some("pdf") {
                let bytes = fs::read(&path_clone).with_context(|| format!("failed to read PDF {}", path_clone.display()))?;
                let text = pdf_extract::extract_text_from_mem(&bytes)
                    .with_context(|| format!("failed to extract text from PDF {}", path_clone.display()))?;
                
                let fixed_text = parser::fix_separated_words(&text);
                    
                let extracted_dir = state_clone.app_data_dir.join("extracted_books");
                fs::create_dir_all(&extracted_dir).context("failed to create extracted books dir")?;
                
                let mut hasher = std::collections::hash_map::DefaultHasher::new();
                use std::hash::{Hash, Hasher};
                path_clone.hash(&mut hasher);
                let hash = hasher.finish();
                
                let txt_name = format!("{}_{}.txt", path_clone.file_stem().unwrap_or_default().to_string_lossy(), hash);
                let txt_path = extracted_dir.join(txt_name);
                
                fs::write(&txt_path, &fixed_text).with_context(|| format!("failed to write extracted text to {}", txt_path.display()))?;
                final_path = txt_path;
            }

            let mut parsed = parse_file(&final_path, &state_clone.covers_dir)?;
            
            if extension.as_deref() == Some("pdf") {
                let original_stem = path_clone.file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Untitled")
                    .replace(['_', '-'], " ");
                parsed.title = original_stem;
                parsed.author = Some("Unknown".to_string());
            }
            
            // Populate cache during import to speed up initial open
            {
                let mut cache = state_clone.parsed_cache.lock().unwrap();
                cache.insert(final_path.clone(), parsed.clone());
            }

            let record = state_clone.db.upsert_book(
                &parsed.title,
                parsed.author.as_deref(),
                &final_path.to_string_lossy(),
                &parsed.format,
                parsed.cover_path.as_deref(),
                parsed.total_chars,
            )?;
            Ok::<models::BookRecord, anyhow::Error>(record)
        }).await.map_err(|e| e.to_string())?;

        match result {
            Ok(record) => {
                imported.push(record);
                if let Some(ref w) = window {
                    let _ = w.emit("import-finished", &path_str);
                }
            }
            Err(e) => {
                if let Some(ref w) = window {
                    let _ = w.emit("import-finished", &path_str);
                }
                return Err(to_message(e));
            }
        }
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
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
            gain_one_level,
            update_book_cover,
            get_book_cover
        ])
        .run(tauri::generate_context!())
        .expect("failed to run application");
}

#[tauri::command]
async fn update_book_cover(
    book_id: i64,
    image_data_base64: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::io::Write;

    let state_inner = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if image_data_base64.is_empty() {
            state_inner.db.update_book_cover(book_id, None).map_err(to_message)?;
            return Ok(());
        }

        let data = general_purpose::STANDARD
            .decode(image_data_base64)
            .map_err(|e| format!("Failed to decode base64: {}", e))?;

        let file_name = format!("cover_{}_{}.png", book_id, chrono::Utc::now().timestamp());
        let cover_path = state_inner.covers_dir.join(&file_name);

        let mut file = std::fs::File::create(&cover_path)
            .map_err(|e| format!("Failed to create cover file: {}", e))?;
        file.write_all(&data)
            .map_err(|e| format!("Failed to write cover data: {}", e))?;

        state_inner
            .db
            .update_book_cover(book_id, Some(&cover_path.to_string_lossy()))
            .map_err(to_message)?;

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_book_cover(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

        Ok::<String, String>(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(buffer)))
    })
    .await
    .map_err(|e| e.to_string())?
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
                chapter_index: None,
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
