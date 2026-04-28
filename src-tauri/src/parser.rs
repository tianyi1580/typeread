use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::OnceLock,
};

use anyhow::{anyhow, bail, Context, Result};
use pulldown_cmark::{Event, Parser};
use regex::Regex;
use roxmltree::Document;
use scraper::{Html, Selector};
use zip::ZipArchive;

use crate::models::{BookChapter, BookChunk, ParsedImport};

const CHUNK_TARGET: usize = 2000;

pub fn parse_file(path: &Path, covers_dir: &Path) -> Result<ParsedImport> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| anyhow!("unsupported file without extension"))?;

    match extension.as_str() {
        "txt" => parse_txt(path),
        "md" => parse_markdown(path),
        "epub" => parse_epub(path, covers_dir),
        "pdf" => parse_pdf(path),
        other => bail!("unsupported file type: {other}"),
    }
}

fn parse_txt(path: &Path) -> Result<ParsedImport> {
    let source =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let title = fallback_title(path);
    let chapters = chapters_from_text(&source, &title);
    Ok(ParsedImport {
        title,
        author: None,
        format: "txt".to_string(),
        cover_path: None,
        total_chars: chapters
            .iter()
            .map(|chapter| chapter.text.len() as i64)
            .sum(),
        chapters,
    })
}

fn parse_markdown(path: &Path) -> Result<ParsedImport> {
    let source =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let fallback = fallback_title(path);
    let mut sections: Vec<(String, String)> = Vec::new();
    let mut current_title = fallback.clone();
    let mut current_body = String::new();

    for line in source.lines() {
        if let Some(title) = line
            .strip_prefix("# ")
            .or_else(|| line.strip_prefix("## "))
            .or_else(|| line.strip_prefix("### "))
        {
            if !current_body.trim().is_empty() {
                sections.push((current_title.clone(), current_body.trim().to_string()));
                current_body.clear();
            }
            current_title = title.trim().to_string();
        } else {
            current_body.push_str(line);
            current_body.push('\n');
        }
    }

    if !current_body.trim().is_empty() {
        sections.push((current_title.clone(), current_body.trim().to_string()));
    }

    if sections.is_empty() {
        sections.push((fallback.clone(), source.clone()));
    }

    let chapters = if sections.len() > 1 {
        build_chapters(
            sections
                .into_iter()
                .enumerate()
                .filter_map(|(index, (title, body))| {
                    let text = markdown_to_text(&body);
                    if text.trim().is_empty() {
                        None
                    } else {
                        Some((index, title.clone(), prepend_heading(&title, &text)))
                    }
                })
                .collect(),
        )
    } else {
        chapters_from_text(&markdown_to_text(&source), &fallback)
    };

    Ok(ParsedImport {
        title: fallback,
        author: None,
        format: "md".to_string(),
        cover_path: None,
        total_chars: chapters
            .iter()
            .map(|chapter| chapter.text.len() as i64)
            .sum(),
        chapters,
    })
}

fn parse_pdf(path: &Path) -> Result<ParsedImport> {
    let bytes = fs::read(path).with_context(|| format!("failed to read PDF {}", path.display()))?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .with_context(|| format!("failed to extract text from PDF {}", path.display()))?;
    
    let title = fallback_title(path);
    let fixed_text = fix_separated_words(&text);
    let chapters = chapters_from_text(&fixed_text, &title);
    
    Ok(ParsedImport {
        title,
        author: None,
        format: "pdf".to_string(),
        cover_path: None,
        total_chars: chapters
            .iter()
            .map(|chapter| chapter.text.len() as i64)
            .sum(),
        chapters,
    })
}

fn parse_epub(path: &Path, covers_dir: &Path) -> Result<ParsedImport> {
    // EPUB ingestion is intentionally explicit here so we control sanitization instead of trusting embedded styles.
    let file =
        fs::File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
    let mut archive = ZipArchive::new(file).context("failed to open epub archive")?;
    let container_xml = read_zip_string(&mut archive, "META-INF/container.xml")?;
    let container = Document::parse(&container_xml).context("failed to parse container.xml")?;
    let rootfile_path = container
        .descendants()
        .find(|node| node.has_tag_name("rootfile"))
        .and_then(|node| node.attribute("full-path"))
        .ok_or_else(|| anyhow!("missing package rootfile in epub"))?;

    let opf_xml = read_zip_string(&mut archive, rootfile_path)?;
    let opf = Document::parse(&opf_xml).context("failed to parse package document")?;
    let package_dir = Path::new(rootfile_path)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();

    let title = opf
        .descendants()
        .find(|node| node.tag_name().name() == "title")
        .and_then(|node| node.text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| fallback_title(path));

    let author = opf
        .descendants()
        .find(|node| node.tag_name().name() == "creator")
        .and_then(|node| node.text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let mut manifest: HashMap<String, (String, String, Option<String>)> = HashMap::new();
    for item in opf
        .descendants()
        .filter(|node| node.tag_name().name() == "item")
    {
        if let (Some(id), Some(href), Some(media_type)) = (
            item.attribute("id"),
            item.attribute("href"),
            item.attribute("media-type"),
        ) {
            manifest.insert(
                id.to_string(),
                (
                    normalize_zip_path(&package_dir.join(href)),
                    media_type.to_string(),
                    item.attribute("properties").map(str::to_string),
                ),
            );
        }
    }

    let cover_path = extract_cover(&mut archive, &manifest, covers_dir, &title)?;
    let explicit_sections = opf
        .descendants()
        .filter(|node| node.tag_name().name() == "itemref")
        .filter_map(|itemref| itemref.attribute("idref"))
        .enumerate()
        .filter_map(|(index, idref)| manifest.get(idref).map(|entry| (index, entry)))
        .filter(|(_, (_, media_type, _))| media_type.contains("html"))
        .filter_map(
            |(index, (href, _, _))| match read_zip_string(&mut archive, href) {
                Ok(html) => {
                    let (detected_title, text) = html_to_text(&html);
                    if text.trim().is_empty() {
                        None
                    } else {
                        let chapter_title =
                            detected_title.unwrap_or_else(|| chapter_title_from_path(index, href));
                        Some((index, chapter_title, text))
                    }
                }
                Err(_) => None,
            },
        )
        .collect::<Vec<_>>();

    let chapters = if explicit_sections.is_empty() {
        vec![build_chapter(
            0,
            &title,
            "This EPUB did not expose readable XHTML content.",
        )]
    } else {
        let full_text = explicit_sections
            .iter()
            .map(|(_, _, text)| text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let inferred_sections = detect_chapter_sections(&full_text);

        if inferred_sections.len() > explicit_sections.len() {
            build_chapters(
                inferred_sections
                    .into_iter()
                    .enumerate()
                    .map(|(index, (chapter_title, text))| (index, chapter_title, text))
                    .collect(),
            )
        } else {
            build_chapters(explicit_sections)
        }
    };

    Ok(ParsedImport {
        title,
        author,
        format: "epub".to_string(),
        cover_path,
        total_chars: chapters
            .iter()
            .map(|chapter| chapter.text.len() as i64)
            .sum(),
        chapters,
    })
}

fn chapters_from_text(source: &str, fallback: &str) -> Vec<BookChapter> {
    let normalized = normalize_text(source);
    let sections = detect_chapter_sections(&normalized);

    if !sections.is_empty() {
        return build_chapters(
            sections
                .into_iter()
                .enumerate()
                .map(|(index, (title, text))| (index, title, text))
                .collect(),
        );
    }

    build_chapters(
        split_text_into_sections(&normalized, fallback)
            .into_iter()
            .enumerate()
            .map(|(index, (title, text))| (index, title, text))
            .collect(),
    )
}

fn build_chapter(index: usize, title: &str, text: &str) -> BookChapter {
    let normalized = normalize_text(text);
    let chunks = chunk_text(&normalized);
    BookChapter {
        id: format!("chapter-{index}"),
        title: title.to_string(),
        start: 0,
        end: normalized.len(),
        text: normalized,
        chunks,
    }
}

fn chunk_text(text: &str) -> Vec<BookChunk> {
    let sections = split_text_into_sections(text, "Chunk");
    if sections.is_empty() {
        return vec![BookChunk {
            id: "chunk-0".to_string(),
            start: 0,
            end: text.len(),
            text: text.to_string(),
        }];
    }

    let mut chunks = Vec::with_capacity(sections.len());
    let mut cursor = 0usize;
    for (index, (_, chunk_text)) in sections.into_iter().enumerate() {
        let end = cursor + chunk_text.len();
        chunks.push(BookChunk {
            id: format!("chunk-{index}"),
            start: cursor,
            end,
            text: chunk_text,
        });
        cursor = end;
    }

    chunks
}

fn build_chapters(sections: Vec<(usize, String, String)>) -> Vec<BookChapter> {
    sections
        .into_iter()
        .filter(|(_, _, text)| !text.trim().is_empty())
        .map(|(index, title, text)| build_chapter(index, &title, &text))
        .collect()
}

fn detect_chapter_sections(source: &str) -> Vec<(String, String)> {
    let mut sections = Vec::new();
    let mut front_matter = String::new();
    let mut current_title: Option<String> = None;
    let mut current_blocks: Vec<String> = Vec::new();

    for block in source
        .split("\n\n")
        .map(normalize_text)
        .filter(|block| !block.is_empty())
    {
        if is_chapter_heading(&block) {
            if let Some(title) = current_title.take() {
                sections.push((title, current_blocks.join("\n\n")));
                current_blocks.clear();
            } else if !current_blocks.is_empty() {
                front_matter = current_blocks.join("\n\n");
                current_blocks.clear();
            }

            current_title = Some(block.clone());
            current_blocks.push(block);
            continue;
        }

        current_blocks.push(block);
    }

    if let Some(title) = current_title.take() {
        sections.push((title, current_blocks.join("\n\n")));
    }

    if sections.is_empty() {
        return Vec::new();
    }

    if !front_matter.is_empty() {
        sections[0].1 = format!("{front_matter}\n\n{}", sections[0].1);
    }

    sections
}

fn split_text_into_sections(source: &str, fallback: &str) -> Vec<(String, String)> {
    let chunks = split_text_on_sentence_boundaries(source, CHUNK_TARGET);
    if chunks.is_empty() {
        return Vec::new();
    }

    if chunks.len() == 1 {
        return vec![(fallback.to_string(), chunks[0].clone())];
    }

    chunks
        .into_iter()
        .enumerate()
        .map(|(index, text)| (format!("{fallback} · Part {}", index + 1), text))
        .collect()
}

fn split_text_on_sentence_boundaries(source: &str, target: usize) -> Vec<String> {
    let normalized = normalize_text(source);
    if normalized.is_empty() {
        return Vec::new();
    }

    static SENTENCE_REGEX: OnceLock<Regex> = OnceLock::new();
    let sentence_regex = SENTENCE_REGEX.get_or_init(|| {
        Regex::new(r#"[.!?](?:["')\]]+)?(?:\s+|$)"#).expect("valid sentence regex")
    });

    let mut sentences = Vec::new();
    let mut last_end = 0;
    for mat in sentence_regex.find_iter(&normalized) {
        let sentence = &normalized[last_end..mat.end()];
        let trimmed = sentence.trim();
        if !trimmed.is_empty() {
            sentences.push(trimmed.to_string());
        }
        last_end = mat.end();
    }
    let tail = normalized[last_end..].trim();
    if !tail.is_empty() {
        sentences.push(tail.to_string());
    }

    if sentences.is_empty() {
        return split_text_on_word_boundaries(&normalized, target);
    }

    let mut chunks = Vec::new();
    let mut current = String::new();

    for sentence in sentences {
        let candidate = if current.is_empty() {
            sentence.clone()
        } else {
            format!("{current} {sentence}")
        };

        if candidate.len() > target && !current.is_empty() {
            chunks.push(current);
            if sentence.len() > target {
                chunks.extend(split_text_on_word_boundaries(&sentence, target));
                current = String::new();
            } else {
                current = sentence;
            }
            continue;
        }

        if sentence.len() > target && current.is_empty() {
            chunks.extend(split_text_on_word_boundaries(&sentence, target));
            current = String::new();
            continue;
        }

        current = candidate;
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

fn split_text_on_word_boundaries(source: &str, target: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for word in source.split_whitespace() {
        let candidate = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };

        if candidate.len() > target && !current.is_empty() {
            chunks.push(current);
            current = word.to_string();
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

fn prepend_heading(title: &str, text: &str) -> String {
    if text.starts_with(title) {
        text.to_string()
    } else {
        format!("{title}\n\n{text}")
    }
}

fn is_chapter_heading(block: &str) -> bool {
    static CHAPTER_REGEX: OnceLock<Regex> = OnceLock::new();
    let chapter_pattern = CHAPTER_REGEX.get_or_init(|| {
        Regex::new(r"(?i)^(chapter|part|section)\s+[\w\divxlcdm-]+(?:[:.\-]?\s+.*)?$|^(prologue|epilogue|interlude)\b.*$")
            .expect("valid chapter regex")
    });

    block.lines().count() == 1 && block.len() <= 120 && chapter_pattern.is_match(block.trim())
}

fn markdown_to_text(source: &str) -> String {
    let mut rendered = String::new();
    let mut list_index: Vec<Option<u64>> = Vec::new();

    for event in Parser::new(source) {
        match event {
            Event::Start(pulldown_cmark::Tag::Item) => {
                if !rendered.is_empty() && !rendered.ends_with('\n') {
                    rendered.push('\n');
                }
                if let Some(Some(index)) = list_index.last_mut() {
                    rendered.push_str(&format!("{}. ", index));
                    *index += 1;
                } else {
                    rendered.push_str("• ");
                }
            }
            Event::Start(pulldown_cmark::Tag::List(start)) => {
                list_index.push(start);
                if !rendered.is_empty() && !rendered.ends_with('\n') {
                    rendered.push('\n');
                }
            }
            Event::End(pulldown_cmark::TagEnd::List(_)) => {
                list_index.pop();
                rendered.push('\n');
            }
            Event::Start(pulldown_cmark::Tag::Heading { .. })
            | Event::Start(pulldown_cmark::Tag::Paragraph) => {
                if !rendered.is_empty() && !rendered.ends_with('\n') {
                    rendered.push_str("\n\n");
                }
            }
            Event::End(pulldown_cmark::TagEnd::Heading { .. })
            | Event::End(pulldown_cmark::TagEnd::Paragraph) => {
                rendered.push('\n');
            }
            Event::Text(value) | Event::Code(value) => {
                rendered.push_str(&value);
            }
            Event::SoftBreak | Event::HardBreak => {
                rendered.push('\n');
            }
            _ => {}
        }
    }

    normalize_text(&rendered)
}

fn html_to_text(source: &str) -> (Option<String>, String) {
    static SANITIZE_REGEXES: OnceLock<Vec<Regex>> = OnceLock::new();
    let regexes = SANITIZE_REGEXES.get_or_init(|| {
        ["script", "style", "table", "svg", "nav", "footer", "header"]
            .iter()
            .map(|tag| {
                Regex::new(&format!(r"(?is)<{tag}[^>]*>.*?</{tag}>"))
                    .expect("valid block sanitizing regex")
            })
            .collect()
    });

    let mut sanitized = source.to_string();
    for pattern in regexes {
        sanitized = pattern.replace_all(&sanitized, "").into_owned();
    }

    static IMG_REGEX: OnceLock<Regex> = OnceLock::new();
    let img_pattern = IMG_REGEX
        .get_or_init(|| Regex::new(r"(?is)<img[^>]*>").expect("valid img sanitizing regex"));
    let stripped = img_pattern.replace_all(&sanitized, "");
    let document = Html::parse_document(&stripped);
    let title_selector = Selector::parse("h1, h2, h3, title").expect("valid title selector");
    let block_selector = Selector::parse("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre")
        .expect("valid block selector");

    let title = document.select(&title_selector).find_map(|node| {
        let value = node.text().collect::<Vec<_>>().join(" ");
        let normalized = normalize_text(&value);
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    });

    let mut blocks = Vec::new();
    for node in document.select(&block_selector) {
        let text = node.text().collect::<Vec<_>>().join(" ");
        let normalized = normalize_text(&text);
        if !normalized.is_empty() {
            blocks.push(normalized);
        }
    }

    (title, blocks.join("\n\n"))
}

fn extract_cover(
    archive: &mut ZipArchive<fs::File>,
    manifest: &HashMap<String, (String, String, Option<String>)>,
    covers_dir: &Path,
    title: &str,
) -> Result<Option<String>> {
    let cover_item = manifest.values().find(|(_, media_type, properties)| {
        media_type.starts_with("image/")
            && properties
                .as_deref()
                .map(|value| value.contains("cover-image"))
                .unwrap_or(false)
    });

    let Some((href, media_type, _)) = cover_item else {
        return Ok(None);
    };

    let extension = media_type.rsplit('/').next().unwrap_or("png");
    let safe_title = title
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let destination = covers_dir.join(format!("{safe_title}.{extension}"));
    let bytes = read_zip_bytes(archive, href)?;
    fs::write(&destination, bytes)
        .with_context(|| format!("failed to write {}", destination.display()))?;
    Ok(Some(destination.to_string_lossy().to_string()))
}

fn read_zip_string(archive: &mut ZipArchive<fs::File>, name: &str) -> Result<String> {
    let mut file = archive
        .by_name(name)
        .with_context(|| format!("missing archive entry {name}"))?;
    let mut data = String::new();
    file.read_to_string(&mut data)
        .with_context(|| format!("failed to read archive entry {name}"))?;
    Ok(data)
}

fn read_zip_bytes(archive: &mut ZipArchive<fs::File>, name: &str) -> Result<Vec<u8>> {
    let mut file = archive
        .by_name(name)
        .with_context(|| format!("missing archive entry {name}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .with_context(|| format!("failed to read archive entry {name}"))?;
    Ok(bytes)
}

fn normalize_zip_path(path: &Path) -> String {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => components.push(value.to_string_lossy().to_string()),
            Component::ParentDir => {
                components.pop();
            }
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
        }
    }

    components.join("/")
}

fn chapter_title_from_path(index: usize, href: &str) -> String {
    PathBuf::from(href)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.replace(['_', '-'], " "))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("Chapter {}", index + 1))
}

fn normalize_text(source: &str) -> String {
    static MULTI_BLANK_LINE_REGEX: OnceLock<Regex> = OnceLock::new();
    static SPACE_BEFORE_PUNCT_REGEX: OnceLock<Regex> = OnceLock::new();
    let normalized = source
        .replace('\u{00a0}', " ")
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\t', " ");

    let lines = normalized
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>();

    let compacted = lines.join("\n").replace("\n \n", "\n\n");
    let no_extra_blank_lines = MULTI_BLANK_LINE_REGEX
        .get_or_init(|| Regex::new(r"\n{3,}").expect("valid blank-line regex"))
        .replace_all(&compacted, "\n\n")
        .into_owned();

    SPACE_BEFORE_PUNCT_REGEX
        .get_or_init(|| Regex::new(r"\s+([,.;:!?])").expect("valid punctuation regex"))
        .replace_all(&no_extra_blank_lines, "$1")
        .trim()
        .to_string()
}

fn fallback_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .replace(['_', '-'], " ")
}

static WORD_SET: OnceLock<HashSet<String>> = OnceLock::new();

fn get_word_set() -> &'static HashSet<String> {
    WORD_SET.get_or_init(|| {
        let words_str = include_str!("words.txt");
        words_str
            .lines()
            .map(|line| line.trim().to_lowercase())
            .filter(|line| !line.is_empty())
            .collect()
    })
}

pub fn fix_separated_words(text: &str) -> String {
    let word_set = get_word_set();
    let mut fixed_text = String::with_capacity(text.len());
    
    for line in text.lines() {
        let words: Vec<&str> = line.split_whitespace().collect();
        if words.is_empty() {
            fixed_text.push('\n');
            continue;
        }
        
        let mut i = 0;
        let mut new_words = Vec::new();
        
        while i < words.len() {
            if i + 1 < words.len() {
                let w1 = words[i];
                let w2 = words[i + 1];
                
                let clean_w1 = to_alpha_only(w1);
                let clean_w2 = to_alpha_only(w2);
                
                if !clean_w1.is_empty() && !clean_w2.is_empty() {
                    let joined = format!("{}{}", clean_w1, clean_w2);
                    let joined_lower = joined.to_lowercase();
                    let w1_lower = clean_w1.to_lowercase();
                    let w2_lower = clean_w2.to_lowercase();
                    
                    let is_w1_valid = is_word_valid(&w1_lower, word_set);
                    let is_w2_valid = is_word_valid(&w2_lower, word_set);
                    let is_joined_valid = word_set.contains(&joined_lower) 
                        || is_contraction(&joined_lower);
                    
                    if is_joined_valid && (!is_w1_valid || !is_w2_valid) {
                        let merged = format!("{}{}", w1, w2);
                        new_words.push(merged);
                        i += 2;
                        continue;
                    }
                }
            }
            new_words.push(words[i].to_string());
            i += 1;
        }
        
        fixed_text.push_str(&new_words.join(" "));
        fixed_text.push('\n');
    }
    
    if !text.ends_with('\n') && fixed_text.ends_with('\n') {
        fixed_text.pop();
    }
    
    fixed_text
}

fn to_alpha_only(word: &str) -> String {
    word.chars().filter(|c| c.is_alphanumeric()).collect()
}

fn is_word_valid(word: &str, word_set: &HashSet<String>) -> bool {
    if word.len() == 1 {
        return word == "a" || word == "i" || word == "o";
    }
    word_set.contains(word)
}

fn is_contraction(word: &str) -> bool {
    matches!(
        word,
        "cant"
            | "didnt"
            | "couldnt"
            | "shouldnt"
            | "wouldnt"
            | "isnt"
            | "arent"
            | "wasnt"
            | "werent"
            | "hasnt"
            | "havent"
            | "hadnt"
            | "dont"
            | "doesnt"
            | "im"
            | "youre"
            | "hes"
            | "shes"
            | "its"
            | "were"
            | "theyre"
            | "ive"
            | "youve"
            | "weve"
            | "theyve"
            | "id"
            | "youd"
            | "hed"
            | "shed"
            | "wed"
            | "theyd"
            | "ill"
            | "youll"
            | "hell"
            | "shell"
            | "well"
            | "theyll"
    )
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::Write,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::write::FileOptions;

    use super::{chapters_from_text, chunk_text, markdown_to_text, normalize_text, parse_file, fix_separated_words};

    #[test]
    fn test_fix_separated_words() {
        let text = "This is a hun g man. The co mputer is oi ly.";
        let fixed = fix_separated_words(text);
        assert_eq!(fixed, "This is a hung man. The computer is oily.");
    }

    #[test]
    fn markdown_blocks_preserve_paragraphs() {
        let rendered = markdown_to_text("# Heading\n\nThis is **bold** text.\n\n- One\n- Two");
        assert!(rendered.contains("Heading"));
        assert!(rendered.contains("This is bold text."));
    }

    #[test]
    fn chunks_are_emitted_for_large_text() {
        let text = (0..200)
            .map(|_| "Long paragraph")
            .collect::<Vec<_>>()
            .join("\n\n");
        let chunks = chunk_text(&text);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn chapter_headings_in_text_override_single_blob_parsing() {
        let text =
            "Front matter\n\nChapter 1\n\nFirst chapter body.\n\nChapter 2\n\nSecond chapter body.";
        let chapters = chapters_from_text(text, "Fallback");
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "Chapter 1");
        assert!(chapters[1].text.contains("Second chapter body."));
    }

    #[test]
    fn normalize_text_compacts_whitespace() {
        let normalized = normalize_text("A   B\r\n\r\nC");
        assert_eq!(normalized, "A B\n\nC");
    }

    #[test]
    fn epub_parser_extracts_sanitized_text() {
        let base = unique_test_path("epub");
        let epub_path = base.join("sample.epub");
        let covers_dir = base.join("covers");
        fs::create_dir_all(&covers_dir).expect("create covers dir");

        let file = fs::File::create(&epub_path).expect("create epub");
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> = FileOptions::default();

        zip.start_file("META-INF/container.xml", options)
            .expect("container entry");
        zip.write_all(
            br#"<?xml version="1.0"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles>
                <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
              </rootfiles>
            </container>"#,
        )
        .expect("write container");

        zip.start_file("OEBPS/content.opf", options)
            .expect("opf entry");
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8"?>
            <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
              <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:title>Fixture EPUB</dc:title>
                <dc:creator>Test Author</dc:creator>
              </metadata>
              <manifest>
                <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
              </manifest>
              <spine>
                <itemref idref="chapter1"/>
              </spine>
            </package>"#,
        )
        .expect("write opf");

        zip.start_file("OEBPS/chapter1.xhtml", options)
            .expect("chapter entry");
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml">
              <body>
                <h1>Chapter Alpha</h1>
                <p>Hello <strong>world</strong>.</p>
                <table><tr><td>should disappear</td></tr></table>
                <img src="cover.png" alt="ignored" />
              </body>
            </html>"#,
        )
        .expect("write chapter");
        zip.finish().expect("finish epub");

        let parsed = parse_file(&epub_path, &covers_dir).expect("parse epub");
        assert_eq!(parsed.title, "Fixture EPUB");
        assert_eq!(parsed.author.as_deref(), Some("Test Author"));
        assert_eq!(parsed.chapters.len(), 1);
        assert!(parsed.chapters[0].text.contains("Hello world."));
        assert!(!parsed.chapters[0].text.contains("should disappear"));
    }

    #[test]
    fn epub_parser_resolves_parent_relative_manifest_paths() {
        let base = unique_test_path("epub-relative");
        let epub_path = base.join("relative.epub");
        let covers_dir = base.join("covers");
        fs::create_dir_all(&covers_dir).expect("create covers dir");

        let file = fs::File::create(&epub_path).expect("create epub");
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> = FileOptions::default();

        zip.start_file("META-INF/container.xml", options)
            .expect("container entry");
        zip.write_all(
            br#"<?xml version="1.0"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles>
                <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
              </rootfiles>
            </container>"#,
        )
        .expect("write container");

        zip.start_file("OPS/content.opf", options)
            .expect("opf entry");
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8"?>
            <package version="3.0" xmlns="http://www.idpf.org/2007/opf">
              <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:title>Relative EPUB</dc:title>
              </metadata>
              <manifest>
                <item id="chapter1" href="../Text/chapter1.xhtml" media-type="application/xhtml+xml"/>
              </manifest>
              <spine>
                <itemref idref="chapter1"/>
              </spine>
            </package>"#,
        )
        .expect("write opf");

        zip.start_file("Text/chapter1.xhtml", options)
            .expect("chapter entry");
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml">
              <body>
                <h1>Chapter Beta</h1>
                <p>Resolved through a parent directory hop.</p>
              </body>
            </html>"#,
        )
        .expect("write chapter");
        zip.finish().expect("finish epub");

        let parsed = parse_file(&epub_path, &covers_dir).expect("parse epub");
        assert_eq!(parsed.title, "Relative EPUB");
        assert_eq!(parsed.chapters.len(), 1);
        assert!(parsed.chapters[0]
            .text
            .contains("Resolved through a parent directory hop."));
        assert_ne!(
            parsed.chapters[0].text,
            "This EPUB did not expose readable XHTML content."
        );
    }

    fn unique_test_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let base = std::env::temp_dir().join(format!("typeread-{label}-{suffix}"));
        fs::create_dir_all(&base).expect("create temp test dir");
        base
    }
}
