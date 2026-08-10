use crate::models::{SearchOptions, SearchResult};
use crate::utils::validate_existing_path_no_resolve;
use chrono::{DateTime, Local, NaiveDateTime, TimeZone};
use glob::Pattern;
use parking_lot::Mutex;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Global registry of cancellation flags for in-progress searches.
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

fn is_cancelled(flag: &Option<Arc<AtomicBool>>) -> bool {
    flag.as_ref()
        .is_some_and(|f| f.load(Ordering::Relaxed))
}

/// Case-aware name match (substring or glob).
fn name_matches(
    name: &str,
    query: &str,
    case_sensitive: bool,
    glob_pattern: &Option<Pattern>,
) -> bool {
    if query.is_empty() {
        return true;
    }

    let name_to_match = if case_sensitive {
        name.to_string()
    } else {
        crate::native_accel::case_fold_for_sort(name)
    };

    if let Some(pattern) = glob_pattern {
        pattern.matches(&name_to_match)
    } else {
        name_to_match.contains(query)
    }
}

fn entry_metadata(path: &Path) -> (bool, bool, u64, String) {
    match fs::metadata(path) {
        Ok(m) => {
            let file_type = m.file_type();
            let is_dir = file_type.is_dir();
            let is_file = file_type.is_file();
            let modified = m
                .modified()
                .ok()
                .map(|t| {
                    DateTime::<Local>::from(t)
                        .format("%Y-%m-%d %H:%M")
                        .to_string()
                })
                .unwrap_or_else(|| "-".to_string());
            (is_dir, is_file, if is_dir { 0 } else { m.len() }, modified)
        }
        Err(_) => (false, false, 0, "-".to_string()),
    }
}

fn passes_filters(
    path: &Path,
    is_dir: bool,
    is_file: bool,
    size: u64,
    extension: &str,
    options: &SearchOptions,
    after_dt: &Option<DateTime<Local>>,
    before_dt: &Option<DateTime<Local>>,
) -> bool {
    // Extension filters apply to files only so name-matched folders still appear.
    if is_file {
        if let Some(ref types) = options.file_types {
            if !types.is_empty() {
                let ext_lower = extension.to_lowercase();
                if !types.iter().any(|t| t.to_lowercase() == ext_lower) {
                    return false;
                }
            }
        }
    }

    if let Some(min) = options.min_size {
        if !is_dir && size < min {
            return false;
        }
    }
    if let Some(max) = options.max_size {
        if !is_dir && size > max {
            return false;
        }
    }

    if let Some(ref after) = after_dt {
        if let Ok(meta) = fs::metadata(path) {
            if let Ok(mod_time) = meta.modified() {
                let dt: DateTime<Local> = mod_time.into();
                if dt < *after {
                    return false;
                }
            }
        }
    }
    if let Some(ref before) = before_dt {
        if let Ok(meta) = fs::metadata(path) {
            if let Ok(mod_time) = meta.modified() {
                let dt: DateTime<Local> = mod_time.into();
                if dt > *before {
                    return false;
                }
            }
        }
    }

    true
}

fn content_matches_file(path: &Path, options: &SearchOptions, size: u64) -> bool {
    if !options.content_search || size >= 2_000_000 {
        return false;
    }
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };
    if options.case_sensitive {
        content.contains(&options.query)
    } else {
        crate::native_accel::contains_case_insensitive(&content, &options.query)
    }
}

/// Breadth-first search so shallow name matches (e.g. sibling folders) appear
/// before deep recursion into the first child tree. Critical on network / cloud
/// drives where depth-first WalkDir can stall for a long time.
fn search_files_bfs(
    options: &SearchOptions,
    search_path: &Path,
    cancel_flag: &Option<Arc<AtomicBool>>,
    app: &AppHandle,
) -> Vec<SearchResult> {
    let query = if options.case_sensitive {
        options.query.clone()
    } else {
        crate::native_accel::case_fold_for_sort(&options.query)
    };
    let glob_query = query.clone();
    let glob_pattern = if options.query.contains('*') || options.query.contains('?') {
        Pattern::new(&glob_query).ok()
    } else {
        None
    };

    let max_results = options.max_results.unwrap_or(1000);
    let max_depth = options.max_depth.unwrap_or(10);
    let after_dt = options
        .date_after
        .as_deref()
        .and_then(parse_search_datetime);
    let before_dt = options
        .date_before
        .as_deref()
        .and_then(parse_search_datetime);

    let mut results: Vec<SearchResult> = Vec::new();
    let mut batch: Vec<SearchResult> = Vec::with_capacity(64);
    let batch_size = 32;
    let batch_interval = Duration::from_millis(80);
    let mut last_batch_emit = Instant::now();

    // Queue of (directory, depth_of_children). Depth 0 = search root's children.
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::new();
    queue.push_back((search_path.to_path_buf(), 0));

    while let Some((dir, depth)) = queue.pop_front() {
        if results.len() >= max_results || is_cancelled(cancel_flag) {
            break;
        }
        if depth > max_depth {
            continue;
        }

        let read = match fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        for entry in read.flatten() {
            if results.len() >= max_results || is_cancelled(cancel_flag) {
                break;
            }

            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if !options.include_hidden && name.starts_with('.') {
                continue;
            }

            let (is_dir, is_file, size, modified) = match entry.metadata() {
                Ok(m) => {
                    let file_type = m.file_type();
                    let is_dir = file_type.is_dir();
                    let is_file = file_type.is_file();
                    // On Windows, junctions/reparse points report as dirs; treat as dirs
                    // so we can recurse. metadata() may fail for offline cloud placeholders.
                    let modified = m
                        .modified()
                        .ok()
                        .map(|t| {
                            DateTime::<Local>::from(t)
                                .format("%Y-%m-%d %H:%M")
                                .to_string()
                        })
                        .unwrap_or_else(|| "-".to_string());
                    (is_dir, is_file, if is_dir { 0 } else { m.len() }, modified)
                }
                Err(_) => {
                    // Fall back to path metadata (helps some cloud providers).
                    entry_metadata(&path)
                }
            };

            let extension = if is_dir {
                String::new()
            } else {
                path.extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
            };

            // Enqueue directories for BFS before filters that might skip files.
            if is_dir && depth < max_depth {
                queue.push_back((path.clone(), depth + 1));
            }

            if !passes_filters(
                &path,
                is_dir,
                is_file,
                size,
                &extension,
                options,
                &after_dt,
                &before_dt,
            ) {
                continue;
            }

            let matched_name =
                name_matches(&name, &query, options.case_sensitive, &glob_pattern);
            let matched_content =
                !matched_name && is_file && content_matches_file(&path, options, size);

            if !matched_name && !matched_content {
                continue;
            }

            let result = SearchResult {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                size,
                modified,
                extension,
                match_type: if matched_name {
                    "name".to_string()
                } else {
                    "content".to_string()
                },
            };
            batch.push(result.clone());
            results.push(result);

            if batch.len() >= batch_size || last_batch_emit.elapsed() >= batch_interval {
                let _ = app.emit("search-results-batch", batch.clone());
                batch.clear();
                last_batch_emit = Instant::now();
            }
        }
    }

    if !batch.is_empty() {
        let _ = app.emit("search-results-batch", batch);
    }

    results.sort_by_cached_key(|e| crate::native_accel::dirs_first_name_key(e.is_dir, &e.name));
    results
}

#[tauri::command]
pub async fn search_files(
    options: SearchOptions,
    app: AppHandle,
) -> Result<Vec<SearchResult>, String> {
    let search_path = validate_existing_path_no_resolve(&options.search_path)?;
    if !search_path.is_dir() {
        return Err(format!(
            "Search path is not a directory: {}",
            options.search_path
        ));
    }

    let cancel_flag: Option<Arc<AtomicBool>> = if let Some(ref id) = options.search_id {
        let flag = Arc::new(AtomicBool::new(false));
        SEARCH_CANCEL_FLAGS.lock().insert(id.clone(), flag.clone());
        Some(flag)
    } else {
        None
    };

    let app_for_task = app.clone();
    let options_for_task = options.clone();
    let search_path_for_task = search_path.clone();
    let cancel_for_task = cancel_flag.clone();

    // Run the walk off the async runtime so UI IPC stays responsive.
    let results = tokio::task::spawn_blocking(move || {
        search_files_bfs(
            &options_for_task,
            &search_path_for_task,
            &cancel_for_task,
            &app_for_task,
        )
    })
    .await
    .map_err(|e| format!("Search task failed: {e}"))?;

    let _ = app.emit("search-complete", results.len());

    if let Some(id) = options.search_id {
        SEARCH_CANCEL_FLAGS.lock().remove(&id);
    }

    Ok(results)
}

/// Cancel an in-progress search by ID.
#[tauri::command]
pub async fn cancel_search(search_id: String) -> Result<(), String> {
    if let Some(flag) = SEARCH_CANCEL_FLAGS.lock().remove(&search_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::name_matches;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("simplefile-search-{label}-{nanos}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn name_matches_substring_case_insensitive() {
        assert!(name_matches("2000 Mules (2022)", "2000", false, &None));
        assert!(name_matches("2000 Mules (2022)", "mules", false, &None));
        assert!(!name_matches("2000 Mules (2022)", "1999", false, &None));
        assert!(!name_matches("2000 Mules (2022)", "MULES", true, &None));
        assert!(name_matches("2000 Mules (2022)", "Mules", true, &None));
    }

    #[test]
    fn bfs_finds_sibling_folder_without_deep_dive_first() {
        let root = unique_temp_dir("bfs");
        // Deep tree under an early sibling (depth-first walk would stall here on cloud).
        let deep = root.join("aaa-deep");
        fs::create_dir_all(deep.join("l1").join("l2").join("l3")).unwrap();
        fs::write(deep.join("l1").join("l2").join("l3").join("nested.txt"), b"x").unwrap();

        let target = root.join("2000 Mules (2022)");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("movie.mkv"), b"data").unwrap();
        fs::create_dir_all(root.join("Gator Bait (1974)")).unwrap();

        let mut found = Vec::new();
        let mut queue = std::collections::VecDeque::new();
        queue.push_back((root.clone(), 0usize));
        let query = crate::native_accel::case_fold_for_sort("2000");
        while let Some((dir, depth)) = queue.pop_front() {
            if depth > 1 {
                continue;
            }
            for entry in fs::read_dir(&dir).unwrap().flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let path = entry.path();
                let is_dir = path.is_dir();
                // BFS: enqueue children, then continue siblings at this depth.
                if is_dir && depth < 1 {
                    queue.push_back((path, depth + 1));
                }
                if name_matches(&name, &query, false, &None) {
                    found.push(name);
                }
            }
        }
        assert!(
            found.iter().any(|n| n.contains("2000")),
            "BFS depth-1 should find 2000 Mules, got {found:?}"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn name_matches_glob() {
        let pattern = glob::Pattern::new("*mules*").unwrap();
        let folded = crate::native_accel::case_fold_for_sort("2000 Mules (2022)");
        assert!(pattern.matches(&folded));
        assert!(name_matches(
            "2000 Mules (2022)",
            "*mules*",
            false,
            &Some(pattern)
        ));
    }
}
