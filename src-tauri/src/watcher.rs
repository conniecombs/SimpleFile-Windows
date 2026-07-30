use crate::models::FileChangeEvent;

use crate::state::AppState;
use crate::utils::validate_existing_path_no_resolve;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

fn is_ignored_watcher_path(path: &Path) -> bool {
    if path.extension().is_some_and(|ext| {
        let ext = ext.to_ascii_lowercase();
        ext == "tmp" || ext == "part" || ext == "crdownload"
    }) {
        return true;
    }

    path.file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .is_some_and(|name| matches!(name.as_str(), ".ds_store" | "desktop.ini" | "thumbs.db"))
}

fn debounce_eviction_cutoff(now: Instant) -> Instant {
    now.checked_sub(Duration::from_secs(10)).unwrap_or(now)
}

#[tauri::command]
pub fn watch_directory(
    path: String,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let validated_path = validate_existing_path_no_resolve(&path)?;
    if !validated_path.is_dir() {
        return Err("Watch path must be a directory".to_string());
    }

    let app_clone = app.clone();

    // Per-path debounce to prevent refresh loops while not dropping unrelated events.
    // Each unique path gets its own cooldown window.
    let path_timestamps: Arc<Mutex<HashMap<String, Instant>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let debounce_ms = 500u128;

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // Strictly filter events to prevent infinite loops (ghosting)
                let kind = match event.kind {
                    notify::EventKind::Create(_) => "create",
                    notify::EventKind::Remove(_) => "remove",
                    notify::EventKind::Modify(kind) => match kind {
                        notify::event::ModifyKind::Name(_) => "rename",
                        notify::event::ModifyKind::Metadata(_) | notify::event::ModifyKind::Any => {
                            return
                        }
                        _ => "modify",
                    },
                    notify::EventKind::Access(_)
                    | notify::EventKind::Any
                    | notify::EventKind::Other => return,
                };

                let now = Instant::now();

                for path in event.paths {
                    let path_str = path.to_string_lossy().to_string();

                    // Filter common system noise files
                    if is_ignored_watcher_path(&path) {
                        continue;
                    }

                    // Per-path debounce: skip if this path was emitted recently
                    {
                        let mut timestamps = path_timestamps.lock();
                        if let Some(last) = timestamps.get(&path_str) {
                            if now.duration_since(*last).as_millis() < debounce_ms {
                                continue;
                            }
                        }
                        timestamps.insert(path_str.clone(), now);
                        // Evict old entries to prevent unbounded growth
                        if timestamps.len() > 1000 {
                            let cutoff = debounce_eviction_cutoff(now);
                            timestamps.retain(|_, v| *v > cutoff);
                        }
                    }

                    let change_event = FileChangeEvent {
                        path: path_str,
                        kind: kind.to_string(),
                    };
                    let _ = app_clone.emit("file-change", change_event);
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {e}"))?;

    watcher
        .watch(validated_path.as_path(), RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {e}"))?;

    let mut watcher_state = state.watcher_state.lock();
    watcher_state.watcher = Some(watcher);
    watcher_state.watched_path = Some(path);
    Ok(())
}

#[tauri::command]
pub fn unwatch_directory(state: tauri::State<'_, Arc<AppState>>) {
    let mut watcher_state = state.watcher_state.lock();
    watcher_state.watcher = None;
    watcher_state.watched_path = None;
}

#[cfg(test)]
mod tests {
    use super::{debounce_eviction_cutoff, is_ignored_watcher_path};
    use std::path::Path;
    use std::time::Instant;

    #[test]
    fn ignored_watcher_path_matches_noise_names_case_insensitively() {
        assert!(is_ignored_watcher_path(Path::new("C:/Users/me/Thumbs.db")));
        assert!(is_ignored_watcher_path(Path::new(
            "C:/Users/me/DESKTOP.INI"
        )));
        assert!(is_ignored_watcher_path(Path::new("C:/Users/me/.DS_Store")));
    }

    #[test]
    fn ignored_watcher_path_matches_temporary_extensions_case_insensitively() {
        assert!(is_ignored_watcher_path(Path::new("download.CRDOWNLOAD")));
        assert!(is_ignored_watcher_path(Path::new("archive.part")));
        assert!(is_ignored_watcher_path(Path::new("draft.TMP")));
        assert!(!is_ignored_watcher_path(Path::new("real-file.txt")));
    }

    #[test]
    fn debounce_eviction_cutoff_never_panics() {
        let now = Instant::now();

        assert!(debounce_eviction_cutoff(now) <= now);
    }
}
