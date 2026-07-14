use crate::models::{CleanupResult, DuplicateGroup, ProgressUpdate};
use crate::state::AppState;
use crate::utils::validate_existing_path_no_resolve;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const DEFAULT_LARGE_FILE_THRESHOLD: u64 = 100 * 1024 * 1024;
const CLEANUP_OPERATION_ID: &str = "disk_cleanup";
const FIRST_PASS_PROGRESS_INTERVAL: u64 = 128;
const HASH_PROGRESS_INTERVAL: u64 = 16;

/// Perform a disk cleanup scan on a given directory. This helper walks
/// the directory tree and identifies two categories of interest:
///
/// * Large files that exceed a caller-provided size threshold.
/// * Groups of duplicate files where the file contents are identical.
///
/// The scan returns a `CleanupResult` containing both large files and
/// duplicate groups. Duplicate groups include all files with the same
/// computed SHA-256 hash; callers can decide which to delete.
#[tauri::command]
pub async fn disk_cleanup(
    directory: String,
    size_threshold: Option<u64>,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CleanupResult, String> {
    let root = validate_existing_path_no_resolve(&directory)?;
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {directory}"));
    }

    let threshold = size_threshold.unwrap_or(DEFAULT_LARGE_FILE_THRESHOLD);
    let cancel = state.disk_cleanup_cancel.clone();
    cancel.store(false, Ordering::Relaxed);

    let result = match tokio::task::spawn_blocking(move || {
        scan_disk_cleanup(&root, threshold, &cancel, |current, total, item| {
            emit_cleanup_progress(&app, current, total, item);
        })
    })
    .await
    {
        Ok(result) => result,
        Err(e) => Err(format!("Disk cleanup task failed: {e}")),
    };

    state.disk_cleanup_cancel.store(false, Ordering::Relaxed);
    result
}

/// Cancel the in-progress disk cleanup scan, if any.
#[tauri::command]
pub fn cancel_disk_cleanup(state: tauri::State<'_, Arc<AppState>>) {
    state.cancel_disk_cleanup();
}

fn emit_cleanup_progress(app: &AppHandle, current: u64, total: u64, current_item: &str) {
    let _ = app.emit(
        "operation-progress",
        ProgressUpdate {
            operation_id: CLEANUP_OPERATION_ID.to_string(),
            operation_type: "cleanup".to_string(),
            current,
            total,
            current_item: current_item.to_string(),
            status: "running".to_string(),
            error: None,
        },
    );
}

fn scan_disk_cleanup<F>(
    root: &Path,
    threshold: u64,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<CleanupResult, String>
where
    F: FnMut(u64, u64, &str),
{
    check_cancelled(cancel)?;

    let mut large_files: Vec<(String, u64)> = Vec::new();
    let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut scanned_files = 0u64;

    progress(0, 0, "Scanning files");

    for entry in WalkDir::new(root).follow_links(false) {
        check_cancelled(cancel)?;
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.into_path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        scanned_files += 1;
        if scanned_files == 1 || scanned_files.is_multiple_of(FIRST_PASS_PROGRESS_INTERVAL) {
            progress(scanned_files, 0, &path.to_string_lossy());
        }

        let size = metadata.len();
        if size >= threshold {
            large_files.push((path.to_string_lossy().to_string(), size));
        }
        size_map.entry(size).or_default().push(path);
    }

    let duplicate_candidates: u64 = size_map
        .values()
        .filter(|files| files.len() > 1)
        .map(|files| files.len() as u64)
        .sum();

    let mut hashed_files = 0u64;
    let mut duplicates: Vec<DuplicateGroup> = Vec::new();
    for files in size_map.into_values() {
        check_cancelled(cancel)?;
        if files.len() < 2 {
            continue;
        }

        let mut hash_map: HashMap<String, Vec<String>> = HashMap::new();
        for file_path in files {
            check_cancelled(cancel)?;
            hashed_files += 1;
            if hashed_files == 1 || hashed_files.is_multiple_of(HASH_PROGRESS_INTERVAL) {
                progress(
                    hashed_files,
                    duplicate_candidates,
                    &file_path.to_string_lossy(),
                );
            }

            match compute_sha256(&file_path, cancel) {
                Ok(hash) => {
                    hash_map
                        .entry(hash)
                        .or_default()
                        .push(file_path.to_string_lossy().to_string());
                }
                Err(_) => continue,
            }
        }

        for (hash, mut group) in hash_map {
            if group.len() > 1 {
                group.sort();
                duplicates.push(DuplicateGroup { hash, files: group });
            }
        }
    }

    large_files.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    duplicates.sort_by(|a, b| {
        a.files
            .first()
            .cmp(&b.files.first())
            .then_with(|| a.hash.cmp(&b.hash))
    });

    Ok(CleanupResult {
        large_files,
        duplicates,
    })
}

fn check_cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("cancelled".to_string())
    } else {
        Ok(())
    }
}

/// Compute the SHA-256 hash of a file. Returns a hex-encoded string on
/// success. If the file cannot be read, an error is returned.
fn compute_sha256(path: &Path, cancel: &AtomicBool) -> Result<String, std::io::Error> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    use std::io::Read;

    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "cancelled",
            ));
        }

        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    let digest = hasher.finalize();
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut encoded, "{byte:02x}").expect("writing to String cannot fail");
    }
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::scan_disk_cleanup;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("simplefile_cleanup_test_{}_{}", name, nanos))
    }

    #[test]
    fn scan_disk_cleanup_finds_large_and_duplicate_files() {
        let root = unique_temp_path("scan");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("large.bin"), vec![1u8; 16]).unwrap();
        fs::write(root.join("dupe_a.txt"), b"same").unwrap();
        fs::write(root.join("dupe_b.txt"), b"same").unwrap();
        fs::write(root.join("unique.txt"), b"different").unwrap();

        let cancel = AtomicBool::new(false);
        let result = scan_disk_cleanup(&root, 10, &cancel, |_, _, _| {}).unwrap();

        assert_eq!(result.large_files.len(), 1);
        assert!(result.large_files[0].0.ends_with("large.bin"));
        assert_eq!(result.large_files[0].1, 16);
        assert_eq!(result.duplicates.len(), 1);
        assert_eq!(result.duplicates[0].files.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn scan_disk_cleanup_respects_cancellation() {
        let root = unique_temp_path("cancel");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("file.txt"), b"content").unwrap();

        let cancel = AtomicBool::new(true);
        let result = scan_disk_cleanup(&root, 1, &cancel, |_, _, _| {});

        assert_eq!(result.unwrap_err(), "cancelled");

        let _ = fs::remove_dir_all(&root);
    }
}
