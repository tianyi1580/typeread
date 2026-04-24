use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookRecord {
    pub id: i64,
    pub title: String,
    pub author: Option<String>,
    pub path: String,
    pub format: String,
    pub cover_path: Option<String>,
    pub current_index: i64,
    pub current_chapter: i64,
    pub total_chars: i64,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookChunk {
    pub id: String,
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookChapter {
    pub id: String,
    pub title: String,
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub chunks: Vec<BookChunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBook {
    #[serde(flatten)]
    pub record: BookRecord,
    pub chapters: Vec<BookChapter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingSessionInput {
    pub book_id: i64,
    pub start_time: String,
    pub end_time: String,
    pub words_typed: i64,
    pub chars_typed: i64,
    pub errors: i64,
    pub wpm: f64,
    pub accuracy: f64,
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyMetric {
    pub day: String,
    pub wpm: f64,
    pub accuracy: f64,
    pub sessions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSummary {
    pub total_words_typed: i64,
    pub total_chars_typed: i64,
    pub total_time_seconds: i64,
    pub average_wpm: f64,
    pub average_accuracy: f64,
    pub sessions: i64,
    pub history: Vec<DailyMetric>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub type_font: String,
    pub read_font: String,
    pub reader_mode: String,
    pub interaction_mode: String,
    pub focus_mode: bool,
}

#[derive(Debug, Clone)]
pub struct ParsedImport {
    pub title: String,
    pub author: Option<String>,
    pub format: String,
    pub cover_path: Option<String>,
    pub total_chars: i64,
    pub chapters: Vec<BookChapter>,
}
