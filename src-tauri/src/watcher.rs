use crate::models::FileChangeEvent;

use crate::state::AppState;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn watch_directory(
    path: String,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if false {
        let mut watcher_state = state.watcher_state.lock();
        watcher_state.watcher = None;
        watcher_state.watched_path = Some(path);
        return Ok(());
    }

    let mut watcher_state = state.watcher_state.lock();
    watcher_state.watcher = None;
    watcher_state.watched_path = None;

    let path_clone = path.clone();
    let app_clone = app.clone();

    // Per-path debounce to prevent refresh loops while not dropping unrelated events.
    // Each unique path gets its own cooldown window.
    let path_timestamps: Arc<Mutex<HashMap<String, std::time::Instant>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let debounce_ms = 500u128;

    let watcher = RecommendedWatcher::new(
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

                let now = std::time::Instant::now();

                for path in event.paths {
                    let path_str = path.to_string_lossy().to_string();

                    // Filter common system noise files
                    if std::path::Path::new(&path_str)
                        .extension()
                        .is_some_and(|ext| {
                            let ext = ext.to_ascii_lowercase();
                            ext == "tmp" || ext == "part" || ext == "crdownload"
                        })
                        || path_str.ends_with(".DS_Store")
                        || path_str.ends_with("desktop.ini")
                        || path_str.ends_with("thumbs.db")
                    {
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
                            let cutoff =
                                now.checked_sub(std::time::Duration::from_secs(10)).unwrap();
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

    watcher_state.watcher = Some(watcher);
    if let Some(ref mut w) = watcher_state.watcher {
        w.watch(path_clone.as_ref(), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch directory: {e}"))?;
    }
    watcher_state.watched_path = Some(path);
    Ok(())
}

#[tauri::command]
pub fn unwatch_directory(state: tauri::State<'_, Arc<AppState>>) {
    let mut watcher_state = state.watcher_state.lock();
    watcher_state.watcher = None;
    watcher_state.watched_path = None;
}
