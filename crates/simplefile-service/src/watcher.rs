use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use simplefile_core::models::FileChangeEvent;
use simplefile_core::utils::validate_existing_path_no_resolve;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct WatcherState {
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<String>,
}

pub fn watch_directory<F>(path: String, state: &mut WatcherState, emit: F) -> Result<(), String>
where
    F: Fn(FileChangeEvent) + Send + Sync + 'static,
{
    let validated_path = validate_existing_path_no_resolve(&path)?;
    if !validated_path.is_dir() {
        return Err("Watch path must be a directory".to_string());
    }

    let emit = Arc::new(emit);
    let path_timestamps: Arc<Mutex<HashMap<String, Instant>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let debounce_ms = 500u128;

    let mut watcher = RecommendedWatcher::new(
        {
            let emit = emit.clone();
            let path_timestamps = path_timestamps.clone();
            move |res: Result<Event, notify::Error>| {
                let Ok(event) = res else {
                    return;
                };

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
                    if is_ignored_watcher_path(&path) {
                        continue;
                    }

                    {
                        let Ok(mut timestamps) = path_timestamps.lock() else {
                            continue;
                        };
                        if let Some(last) = timestamps.get(&path_str) {
                            if now.duration_since(*last).as_millis() < debounce_ms {
                                continue;
                            }
                        }
                        timestamps.insert(path_str.clone(), now);
                        if timestamps.len() > 1000 {
                            let cutoff = debounce_eviction_cutoff(now);
                            timestamps.retain(|_, value| *value > cutoff);
                        }
                    }

                    emit(FileChangeEvent {
                        path: path_str,
                        kind: kind.to_string(),
                    });
                }
            }
        },
        Config::default(),
    )
    .map_err(|error| format!("Failed to create watcher: {error}"))?;

    watcher
        .watch(validated_path.as_path(), RecursiveMode::NonRecursive)
        .map_err(|error| format!("Failed to watch directory: {error}"))?;

    state.watcher = Some(watcher);
    state.watched_path = Some(path);
    Ok(())
}

pub fn unwatch_directory(state: &mut WatcherState) {
    state.watcher = None;
    state.watched_path = None;
}

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
