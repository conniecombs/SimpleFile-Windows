use crate::models::{FilePreview, ThumbnailResult};

use crate::utils::validate_existing_path_no_resolve;
use std::fs;

pub fn read_file_preview(path: String, max_size: Option<u64>) -> Result<FilePreview, String> {
    let path_buf = resolve_readable_path(&path)?;
    if path_buf.is_dir() {
        return Err("Cannot preview a directory".to_string());
    }

    let metadata = fs::metadata(&path_buf).map_err(|e| format!("Failed to get metadata: {e}"))?;
    let size = metadata.len();
    // Cap at 10 MB to prevent memory exhaustion from a malicious/buggy frontend
    const MAX_ALLOWED: u64 = 10 * 1024 * 1024;
    let max_preview_size = max_size.unwrap_or(1024 * 1024).min(MAX_ALLOWED);
    let extension = path_buf
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let (file_type, mime_type) = match extension.as_str() {
        "txt" | "md" | "json" | "xml" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf"
        | "log" | "csv" | "tsv" => ("text", format!("text/{extension}")),
        "rs" | "js" | "ts" | "jsx" | "tsx" | "py" | "rb" | "go" | "java" | "c" | "cpp" | "h"
        | "hpp" | "cs" | "php" | "swift" | "kt" | "scala" | "sh" | "bash" | "zsh" | "ps1"
        | "bat" | "cmd" | "sql" | "r" | "lua" | "pl" | "pm" => {
            ("text", format!("text/x-{extension}"))
        }
        "html" | "htm" => ("text", "text/html".to_string()),
        "css" => ("text", "text/css".to_string()),
        "scss" | "sass" | "less" => ("text", format!("text/x-{extension}")),
        "png" => ("image", "image/png".to_string()),
        "jpg" | "jpeg" => ("image", "image/jpeg".to_string()),
        "gif" => ("image", "image/gif".to_string()),
        "webp" => ("image", "image/webp".to_string()),
        "svg" => ("image", "image/svg+xml".to_string()),
        "bmp" => ("image", "image/bmp".to_string()),
        "ico" => ("image", "image/x-icon".to_string()),
        "pdf" => ("pdf", "application/pdf".to_string()),
        "mp4" | "webm" | "ogg" | "mov" | "avi" | "mkv" => ("video", format!("video/{extension}")),
        "mp3" | "wav" | "flac" | "aac" | "m4a" => ("audio", format!("audio/{extension}")),
        "zip" | "tar" | "gz" | "7z" | "rar" | "exe" | "dll" | "so" | "dylib" => {
            ("unsupported", "application/octet-stream".to_string())
        }
        _ => {
            if size <= max_preview_size {
                // Only read the first 8KB to detect binary content instead of the entire file
                let detect_size = std::cmp::min(size, 8192) as usize;
                if let Ok(mut file) = fs::File::open(&path_buf) {
                    use std::io::Read;
                    let mut buffer = vec![0u8; detect_size];
                    if let Ok(bytes_read) = file.read(&mut buffer) {
                        buffer.truncate(bytes_read);
                        if buffer
                            .iter()
                            .all(|&b| b != 0 && (b >= 32 || b == 9 || b == 10 || b == 13))
                        {
                            ("text", "text/plain".to_string())
                        } else {
                            ("binary", "application/octet-stream".to_string())
                        }
                    } else {
                        ("unsupported", "application/octet-stream".to_string())
                    }
                } else {
                    ("unsupported", "application/octet-stream".to_string())
                }
            } else {
                ("unsupported", "application/octet-stream".to_string())
            }
        }
    };

    let (content, encoding) = match file_type {
        "text" => {
            if size > max_preview_size {
                let mut file =
                    fs::File::open(&path_buf).map_err(|e| format!("Failed to open file: {e}"))?;
                let mut buffer = vec![0u8; max_preview_size as usize];
                use std::io::Read;
                let bytes_read = file
                    .read(&mut buffer)
                    .map_err(|e| format!("Failed to read file: {e}"))?;
                buffer.truncate(bytes_read);
                let text = String::from_utf8_lossy(&buffer).to_string();
                (
                    Some(text + "\n\n[File truncated...]"),
                    Some("utf-8".to_string()),
                )
            } else {
                let text = fs::read_to_string(&path_buf)
                    .map_err(|e| format!("Failed to read file: {e}"))?;
                (Some(text), Some("utf-8".to_string()))
            }
        }
        "image" => {
            if size > max_preview_size * 5 {
                (None, None)
            } else {
                let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {e}"))?;
                use base64::{engine::general_purpose, Engine as _};
                let base64 = general_purpose::STANDARD.encode(&bytes);
                (Some(base64), Some("base64".to_string()))
            }
        }
        "pdf" => {
            // Cap PDF previews at 20 MB — large enough for most documents
            const PDF_MAX: u64 = 20 * 1024 * 1024;
            if size > PDF_MAX {
                (None, None)
            } else {
                let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {e}"))?;
                use base64::{engine::general_purpose, Engine as _};
                let base64 = general_purpose::STANDARD.encode(&bytes);
                (Some(base64), Some("base64".to_string()))
            }
        }
        _ => (None, None),
    };

    Ok(FilePreview {
        file_type: file_type.to_string(),
        content,
        mime_type,
        size,
        encoding,
    })
}

pub fn generate_thumbnail(path: String, size: Option<u32>) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let path_buf = resolve_readable_path(&path)?;
    let extension = path_buf
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let supported = matches!(
        extension.as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp"
    );
    if !supported {
        return Err(format!("Unsupported image format: {extension}"));
    }

    let thumb_size = size.unwrap_or(128);
    let img = image::open(&path_buf).map_err(|e| format!("Failed to open image: {e}"))?;
    // Let the image library handle aspect-ratio-preserving resize
    let thumbnail = img.thumbnail(thumb_size, thumb_size);
    let mut buffer = std::io::Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut buffer, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode thumbnail: {e}"))?;
    let base64_thumb = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(base64_thumb)
}

pub fn generate_thumbnails(paths: Vec<String>, size: Option<u32>) -> Vec<ThumbnailResult> {
    paths
        .into_iter()
        .map(|path| match generate_thumbnail(path.clone(), size) {
            Ok(data) => ThumbnailResult {
                path,
                data: Some(data),
                error: None,
            },
            Err(e) => ThumbnailResult {
                path,
                data: None,
                error: Some(e),
            },
        })
        .collect()
}

fn resolve_readable_path(path: &str) -> Result<std::path::PathBuf, String> {
    if crate::archive::is_archive_virtual_path(path) {
        return crate::archive::materialize_archive_entry_to_temp(path);
    }

    validate_existing_path_no_resolve(path)
}
