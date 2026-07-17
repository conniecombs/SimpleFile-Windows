use crate::models::FileEntry;
use chrono::{DateTime, Local};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub(crate) fn hidden_command<S: AsRef<OsStr>>(program: S) -> Command {
    use std::os::windows::process::CommandExt;
    let mut command = Command::new(program);
    command.creation_flags(0x08000000);
    command
}

pub(crate) fn dirs_home() -> Result<String, String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())
}

pub(crate) fn get_file_entry(path: &PathBuf) -> Option<FileEntry> {
    // Use symlink_metadata (lstat) to detect symlinks without following them.
    let symlink_meta = fs::symlink_metadata(path).ok()?;
    let is_symlink = symlink_meta.file_type().is_symlink();

    // For size/modified/is_dir we still use follow-the-symlink metadata so
    // directories and files reported by symlinks behave as users expect.
    let metadata = fs::metadata(path).unwrap_or(symlink_meta);

    let name = path.file_name()?.to_string_lossy().to_string();
    let file_path = path.to_string_lossy().to_string();

    let modified = metadata.modified().map_or_else(
        |_| String::from("-"),
        |t| {
            let datetime: DateTime<Local> = t.into();
            datetime.format("%Y-%m-%d %H:%M").to_string()
        },
    );

    let is_dir = metadata.is_dir();
    let extension = if is_dir {
        String::new()
    } else {
        path.extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    // Read the symlink target if applicable
    let symlink_target = if is_symlink {
        fs::read_link(path)
            .ok()
            .map(|t| t.to_string_lossy().to_string())
    } else {
        None
    };

    let permissions: Option<String> = None;

    Some(FileEntry {
        name,
        path: file_path,
        is_dir,
        is_symlink,
        size: metadata.len(),
        modified,
        extension,
        permissions,
        symlink_target,
        git_status: None,
    })
}

pub(crate) fn generate_operation_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("op_{secs}_{count}")
}

/// Validate a path that must exist
pub(crate) fn validate_existing_path(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);

    if !path_buf.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    // Canonicalize to resolve symlinks and ".." components
    path_buf
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {e}"))
}

/// Validate a path that must exist while preserving the exact path supplied.
///
/// Some Windows filesystem targets can be opened and listed normally but fail
/// `canonicalize()` with OS error 1005. File-browser operations should keep the
/// supplied path intact instead of resolving it first.
pub(crate) fn validate_existing_path_no_resolve(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);
    fs::metadata(&path_buf)
        .map_err(|e| format!("Path does not exist or is not accessible: {path} ({e})"))?;
    Ok(path_buf)
}

/// Validate a path that must exist **without following symlinks** (lstat).
///
/// Use this instead of `validate_existing_path` whenever the operation must
/// act on the symlink itself rather than its target — e.g. delete, rename,
/// move, or `get_entry_info`.  Canonicalising the path first would silently
/// redirect all of those operations to the symlink target, which:
///   • causes `remove_dir_all` to wipe the target directory contents instead
///     of unlinking the shortcut;
///   • causes `rename`/`rename` to move the target instead of the symlink;
///   • causes `get_file_entry` to report `is_symlink = false` because it
///     never sees the symlink node.
pub(crate) fn validate_path_no_follow(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);
    // symlink_metadata (lstat) succeeds for both regular files *and* symlinks,
    // but does not resolve the link — so the returned PathBuf still points to
    // the symlink itself.
    fs::symlink_metadata(&path_buf).map_err(|_| format!("Path does not exist: {path}"))?;
    Ok(path_buf)
}

/// Validate that a file/directory name doesn't contain path traversal sequences
pub(crate) fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.trim().is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Invalid name: cannot contain path separators or '..'".to_string());
    }
    if name == "." {
        return Err("Invalid name".to_string());
    }
    Ok(())
}

fn should_cancel(
    cancel: &std::sync::atomic::AtomicBool,
    generation: Option<(&std::sync::atomic::AtomicU64, u64)>,
) -> bool {
    use std::sync::atomic::Ordering;

    cancel.load(Ordering::Relaxed)
        || generation.is_some_and(|(current, expected)| current.load(Ordering::Relaxed) != expected)
}

/// Count direct children under `path`, excluding the root directory itself.
/// Returns `None` if cancelled or superseded by a newer count request.
pub(crate) fn count_directory_entries(
    path: &Path,
    cancel: &std::sync::atomic::AtomicBool,
    generation: Option<(&std::sync::atomic::AtomicU64, u64)>,
) -> Option<u64> {
    let entries = std::fs::read_dir(path).ok()?;
    let mut count = 0u64;
    for entry in entries {
        if should_cancel(cancel, generation) {
            return None;
        }
        if entry.is_ok() {
            count += 1;
        }
    }
    Some(count)
}

/// Recursively count all entries under `path`, excluding the root directory itself.
/// Returns `None` if cancelled or superseded by a newer count request.
pub(crate) fn count_items_scoped(
    path: &Path,
    cancel: &std::sync::atomic::AtomicBool,
    generation: Option<(&std::sync::atomic::AtomicU64, u64)>,
) -> Option<u64> {
    let mut count = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        if should_cancel(cancel, generation) {
            return None;
        }
        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                if should_cancel(cancel, generation) {
                    return None;
                }
                count += 1;
                let Ok(ft) = entry.file_type() else { continue };
                if ft.is_dir() {
                    stack.push(entry.path());
                }
            }
        }
    }
    Some(count)
}
