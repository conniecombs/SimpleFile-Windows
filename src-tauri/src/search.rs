use crate::models::{SearchOptions, SearchResult};
use crate::utils::validate_existing_path_no_resolve;
use chrono::{DateTime, Local, NaiveDateTime, TimeZone};
use glob::Pattern;
use std::fs;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

// Additional imports for search enhancements
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

/// Global registry of cancellation flags for in-progress searches. When a search
/// is started with a non-None `search_id`, a new entry is inserted into this
/// map. Invoking [`cancel_search`] will set the corresponding flag and
/// remove it from the map, allowing the search loop to exit early.
static SEARCH_CANCEL_FLAGS: std::sync::LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn parse_search_datetime(value: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Local))
        .or_else(|| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
                .ok()
                .and_then(|naive| Local.from_local_datetime(&naive).single())
        })
}

#[tauri::command]
pub async fn search_files(
    options: SearchOptions,
    app: AppHandle,
) -> Result<Vec<SearchResult>, String> {
    let search_path = validate_existing_path_no_resolve(&options.search_path)?;
    let query = if options.case_sensitive {
        options.query.clone()
    } else {
        options.query.to_lowercase()
    };
    let glob_query = if options.case_sensitive {
        options.query.clone()
    } else {
        options.query.to_lowercase()
    };
    let glob_pattern = if options.query.contains('*') || options.query.contains('?') {
        Pattern::new(&glob_query).ok()
    } else {
        None
    };

    let max_results = options.max_results.unwrap_or(1000);
    let max_depth = options.max_depth.unwrap_or(10);
    let mut results: Vec<SearchResult> = Vec::new();
    let batch_size = 500;
    let batch_interval = Duration::from_millis(100);

    // Setup cancellation flag for this search. If the caller provided a
    // search ID, register an AtomicBool that can be toggled via
    // [`cancel_search`]. Otherwise no cancellation is possible for this
    // invocation.
    let cancel_flag: Option<Arc<AtomicBool>> = if let Some(ref id) = options.search_id {
        let flag = Arc::new(AtomicBool::new(false));
        SEARCH_CANCEL_FLAGS.lock().insert(id.clone(), flag.clone());
        Some(flag)
    } else {
        None
    };

    // Parse optional date filter strings. Accept RFC3339 or ISO 8601
    // timestamps. If parsing fails, the filter is ignored. The values are
    // converted into local time for comparison against file metadata.
    let after_dt = options
        .date_after
        .as_deref()
        .and_then(parse_search_datetime);
    let before_dt = options
        .date_before
        .as_deref()
        .and_then(parse_search_datetime);

    let walker = WalkDir::new(&search_path)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if !options.include_hidden {
                if let Some(name) = e.file_name().to_str() {
                    if name.starts_with('.') {
                        return false;
                    }
                }
            }
            true
        });

    let mut batch: Vec<SearchResult> = Vec::with_capacity(batch_size);
    let mut last_batch_emit = Instant::now();

    for entry in walker.filter_map(std::result::Result::ok) {
        if results.len() >= max_results {
            break;
        }

        // Check for cancellation: if the flag has been set, abort early
        if let Some(ref flag) = cancel_flag {
            if flag.load(Ordering::Relaxed) {
                break;
            }
        }
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if path == search_path {
            continue;
        }

        let name_to_match = if options.case_sensitive {
            name.clone()
        } else {
            name.to_lowercase()
        };
        let name_matches = if let Some(ref pattern) = glob_pattern {
            pattern.matches(&name_to_match)
        } else {
            name_to_match.contains(&query)
        };

        let extension = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if let Some(ref types) = options.file_types {
            if !types.is_empty() {
                let ext_lower = extension.to_lowercase();
                if !types.iter().any(|t| t.to_lowercase() == ext_lower) {
                    continue;
                }
            }
        }

        let metadata = entry.metadata();
        let (is_dir, is_file, size, modified) = match metadata {
            Ok(m) => {
                let file_type = m.file_type();
                let is_dir = file_type.is_dir();
                let is_file = file_type.is_file();
                let modified = m
                    .modified()
                    .ok()
                    .and_then(|t| {
                        DateTime::<Local>::from(t)
                            .format("%Y-%m-%d %H:%M")
                            .to_string()
                            .into()
                    })
                    .unwrap_or_else(|| "-".to_string());
                (is_dir, is_file, if is_dir { 0 } else { m.len() }, modified)
            }
            Err(_) => (false, false, 0, "-".to_string()),
        };

        // Apply size filters
        if let Some(min) = options.min_size {
            if !is_dir && size < min {
                continue;
            }
        }
        if let Some(max) = options.max_size {
            if !is_dir && size > max {
                continue;
            }
        }

        // Apply date filters. Use metadata::modified() to obtain SystemTime
        if let Some(ref after) = after_dt {
            if let Ok(meta) = fs::metadata(path) {
                if let Ok(mod_time) = meta.modified() {
                    let dt: DateTime<Local> = mod_time.into();
                    if dt < *after {
                        continue;
                    }
                }
            }
        }
        if let Some(ref before) = before_dt {
            if let Ok(meta) = fs::metadata(path) {
                if let Ok(mod_time) = meta.modified() {
                    let dt: DateTime<Local> = mod_time.into();
                    if dt > *before {
                        continue;
                    }
                }
            }
        }

        // Optional content search: if name doesn't match and the caller
        // requested content search, inspect text files for the query. Limit to
        // reasonably small files (<2 MiB) to avoid blocking the event loop.
        let mut content_matches = false;
        if !name_matches && options.content_search && is_file && size < 2_000_000 {
            if let Ok(content) = fs::read_to_string(path) {
                if options.case_sensitive {
                    content_matches = content.contains(&options.query);
                } else {
                    content_matches = content.to_lowercase().contains(&query);
                }
            }
        }

        // Skip entries that match neither name nor content
        if !name_matches && !content_matches {
            continue;
        }

        let result = SearchResult {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size,
            modified,
            extension,
            match_type: if name_matches {
                "name".to_string()
            } else if content_matches {
                "content".to_string()
            } else {
                "unknown".to_string()
            },
        };
        batch.push(result.clone());
        results.push(result);

        // Stream batches at a size and cadence that keeps IPC from flooding the UI thread.
        if batch.len() >= batch_size || last_batch_emit.elapsed() >= batch_interval {
            let _ = app.emit("search-results-batch", batch.clone());
            batch.clear();
            last_batch_emit = Instant::now();
        }
    }

    // Emit remaining batch
    if !batch.is_empty() {
        let _ = app.emit("search-results-batch", batch);
    }

    // Signal completion
    let _ = app.emit("search-complete", results.len());

    // Remove cancellation flag after completion so subsequent searches can reuse the same ID
    if let Some(id) = options.search_id {
        SEARCH_CANCEL_FLAGS.lock().remove(&id);
    }

    results.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));

    Ok(results)
}

/// Cancel an in-progress search by ID. The frontend should provide the same
/// searchId that was passed in [`SearchOptions.search_id`]. If the search is
/// active, its cancellation flag is set and removed from the registry.
#[tauri::command]
pub async fn cancel_search(search_id: String) -> Result<(), String> {
    if let Some(flag) = SEARCH_CANCEL_FLAGS.lock().remove(&search_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
