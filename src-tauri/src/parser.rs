use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use anyhow::{anyhow, bail, Context, Result};
use pulldown_cmark::{Event, Parser};
use regex::Regex;
use roxmltree::Document;
use scraper::{Html, Selector};
use zip::ZipArchive;

use crate::models::{BookChapter, BookChunk, ParsedImport};

const CHUNK_TARGET: usize = 2400;

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
        other => bail!("unsupported file type: {other}"),
    }
}

fn parse_txt(path: &Path) -> Result<ParsedImport> {
    let source = fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let title = fallback_title(path);
    let chapters = split_plain_text_into_chapters(&source, &title);
    Ok(ParsedImport {
        title,
        author: None,
        format: "txt".to_string(),
        cover_path: None,
        total_chars: chapters.iter().map(|chapter| chapter.text.len() as i64).sum(),
        chapters,
    })
}

fn parse_markdown(path: &Path) -> Result<ParsedImport> {
    let source = fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let fallback = fallback_title(path);
    let mut sections: Vec<(String, String)> = Vec::new();
    let mut current_title = fallback.clone();
    let mut current_body = String::new();

    for line in source.lines() {
        if let Some(title) = line.strip_prefix("# ").or_else(|| line.strip_prefix("## ")).or_else(|| line.strip_prefix("### ")) {
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
        sections.push((fallback.clone(), source));
    }

    let chapters = sections
        .into_iter()
        .enumerate()
        .filter_map(|(index, (title, body))| {
            let text = markdown_to_text(&body);
            if text.trim().is_empty() {
                None
            } else {
                Some((index, title, text))
            }
        })
        .map(|(index, title, text)| build_chapter(index, &title, &text))
        .collect::<Vec<_>>();

    Ok(ParsedImport {
        title: fallback,
        author: None,
        format: "md".to_string(),
        cover_path: None,
        total_chars: chapters.iter().map(|chapter| chapter.text.len() as i64).sum(),
        chapters,
    })
}

fn parse_epub(path: &Path, covers_dir: &Path) -> Result<ParsedImport> {
    // EPUB ingestion is intentionally explicit here so we control sanitization instead of trusting embedded styles.
    let file = fs::File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
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
    for item in opf.descendants().filter(|node| node.tag_name().name() == "item") {
        if let (Some(id), Some(href), Some(media_type)) = (item.attribute("id"), item.attribute("href"), item.attribute("media-type")) {
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
    let chapters = opf
        .descendants()
        .filter(|node| node.tag_name().name() == "itemref")
        .filter_map(|itemref| itemref.attribute("idref"))
        .enumerate()
        .filter_map(|(index, idref)| manifest.get(idref).map(|entry| (index, entry)))
        .filter(|(_, (_, media_type, _))| media_type.contains("html"))
        .filter_map(|(index, (href, _, _))| match read_zip_string(&mut archive, href) {
            Ok(html) => {
                let (detected_title, text) = html_to_text(&html);
                if text.trim().is_empty() {
                    None
                } else {
                    let chapter_title = detected_title.unwrap_or_else(|| chapter_title_from_path(index, href));
                    Some(build_chapter(index, &chapter_title, &text))
                }
            }
            Err(_) => None,
        })
        .collect::<Vec<_>>();

    let chapters = if chapters.is_empty() {
        vec![build_chapter(0, &title, "This EPUB did not expose readable XHTML content.")]
    } else {
        chapters
    };

    Ok(ParsedImport {
        title,
        author,
        format: "epub".to_string(),
        cover_path,
        total_chars: chapters.iter().map(|chapter| chapter.text.len() as i64).sum(),
        chapters,
    })
}

fn split_plain_text_into_chapters(source: &str, fallback: &str) -> Vec<BookChapter> {
    static CHAPTER_REGEX: OnceLock<Regex> = OnceLock::new();
    let chapter_pattern = CHAPTER_REGEX.get_or_init(|| {
        Regex::new(r"(?im)^(chapter|part|section)\s+[\w\divxlc]+.*$").expect("valid chapter regex")
    });
    let mut sections = Vec::new();
    let mut last_title = fallback.to_string();
    let mut current = String::new();

    for line in source.lines() {
        if chapter_pattern.is_match(line.trim()) {
            if !current.trim().is_empty() {
                sections.push((last_title.clone(), current.trim().to_string()));
                current.clear();
            }
            last_title = line.trim().to_string();
        } else {
            current.push_str(line);
            current.push('\n');
        }
    }

    if !current.trim().is_empty() {
        sections.push((last_title.clone(), current.trim().to_string()));
    }

    if sections.is_empty() {
        sections.push((fallback.to_string(), source.trim().to_string()));
    }

    sections
        .into_iter()
        .enumerate()
        .map(|(index, (title, text))| build_chapter(index, &title, &normalize_text(&text)))
        .collect()
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
    // Chunks stay paragraph-aligned so the reader can stream chapter segments without slicing through sentence flow.
    let paragraphs = text
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty())
        .collect::<Vec<_>>();

    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut start = 0usize;

    for paragraph in paragraphs {
        let candidate = if current.is_empty() {
            paragraph.to_string()
        } else {
            format!("{current}\n\n{paragraph}")
        };

        if candidate.len() > CHUNK_TARGET && !current.is_empty() {
            let end = start + current.len();
            chunks.push(BookChunk {
                id: format!("chunk-{}", chunks.len()),
                start,
                end,
                text: current.clone(),
            });
            start = end;
            current = paragraph.to_string();
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        let end = start + current.len();
        chunks.push(BookChunk {
            id: format!("chunk-{}", chunks.len()),
            start,
            end,
            text: current,
        });
    }

    if chunks.is_empty() {
        chunks.push(BookChunk {
            id: "chunk-0".to_string(),
            start: 0,
            end: text.len(),
            text: text.to_string(),
        });
    }

    chunks
}

fn markdown_to_text(source: &str) -> String {
    // Markdown is flattened block by block to preserve paragraph spacing while stripping formatting noise.
    let mut rendered = Vec::new();
    for block in source.split("\n\n") {
        let mut text = String::new();
        for event in Parser::new(block) {
            match event {
                Event::Text(value) | Event::Code(value) | Event::Html(value) => text.push_str(&value),
                Event::SoftBreak | Event::HardBreak => text.push('\n'),
                _ => {}
            }
        }
        let normalized = normalize_text(&text);
        if !normalized.is_empty() {
            rendered.push(normalized);
        }
    }
    rendered.join("\n\n")
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
    let img_pattern = IMG_REGEX.get_or_init(|| {
        Regex::new(r"(?is)<img[^>]*>").expect("valid img sanitizing regex")
    });
    let stripped = img_pattern.replace_all(&sanitized, "");
    let document = Html::parse_document(&stripped);
    let title_selector = Selector::parse("h1, h2, h3, title").expect("valid title selector");
    let block_selector = Selector::parse("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre").expect("valid block selector");

    let title = document
        .select(&title_selector)
        .find_map(|node| {
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
        media_type.starts_with("image/") && properties.as_deref().map(|value| value.contains("cover-image")).unwrap_or(false)
    });

    let Some((href, media_type, _)) = cover_item else {
        return Ok(None);
    };

    let extension = media_type.rsplit('/').next().unwrap_or("png");
    let safe_title = title
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
        .collect::<String>();
    let destination = covers_dir.join(format!("{safe_title}.{extension}"));
    let bytes = read_zip_bytes(archive, href)?;
    fs::write(&destination, bytes).with_context(|| format!("failed to write {}", destination.display()))?;
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
    path.iter()
        .map(|component| component.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
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
    let compacted = source
        .replace('\u{00a0}', " ")
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .split("\n\n\n")
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string();

    static PUNCTUATION_REGEX: OnceLock<Regex> = OnceLock::new();
    let punct_pattern = PUNCTUATION_REGEX.get_or_init(|| {
        Regex::new(r"\s+([,.;:!?])").expect("valid punctuation spacing regex")
    });

    punct_pattern.replace_all(&compacted, "$1").to_string()
}

fn fallback_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .replace(['_', '-'], " ")
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

    use super::{chunk_text, markdown_to_text, normalize_text, parse_file};

    #[test]
    fn markdown_blocks_preserve_paragraphs() {
        let rendered = markdown_to_text("# Heading\n\nThis is **bold** text.\n\n- One\n- Two");
        assert!(rendered.contains("Heading"));
        assert!(rendered.contains("This is bold text."));
    }

    #[test]
    fn chunks_are_emitted_for_large_text() {
        let text = (0..200).map(|_| "Long paragraph").collect::<Vec<_>>().join("\n\n");
        let chunks = chunk_text(&text);
        assert!(chunks.len() > 1);
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

        zip.start_file("META-INF/container.xml", options).expect("container entry");
        zip.write_all(
            br#"<?xml version="1.0"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles>
                <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
              </rootfiles>
            </container>"#,
        )
        .expect("write container");

        zip.start_file("OEBPS/content.opf", options).expect("opf entry");
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

        zip.start_file("OEBPS/chapter1.xhtml", options).expect("chapter entry");
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

    fn unique_test_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let base = std::env::temp_dir().join(format!("booktyper-{label}-{suffix}"));
        fs::create_dir_all(&base).expect("create temp test dir");
        base
    }
}
