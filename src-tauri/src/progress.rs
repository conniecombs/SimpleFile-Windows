use crate::models::ProgressUpdate;

use crate::state::AppState;
use crate::utils::{
    generate_operation_id, validate_existing_path_no_resolve, validate_path_no_follow,
};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Network-aware I/O helpers
// ============================================================================

/// I/O buffer size used when copying files across a network mount.
/// 1 MiB keeps round-trips short while staying within RAM budgets.
const NETWORK_BUFFER_SIZE: usize = 1024 * 1024;
const LOCAL_BUFFER_SIZE: usize = 1024 * 1024;

/// Maximum number of attempts before giving up on a network file copy.
const NETWORK_MAX_RETRIES: u32 = 3;
const PROGRESS_BYTE_STEP: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize, Clone)]
pub struct TransferResult {
    pub source: String,
    pub destination: String,
}

#[derive(Debug)]
struct TransferPlan {
    source_path: PathBuf,
    final_dest: PathBuf,
    replace_existing: bool,
    allow_rename: bool,
}

fn path_exists_no_follow(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn path_collision_key(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();
    if cfg!(target_os = "windows") || cfg!(target_os = "macos") {
        value.to_lowercase()
    } else {
        value
    }
}

fn paths_refer_to_same_entry(a: &Path, b: &Path) -> bool {
    if let (Ok(a_canonical), Ok(b_canonical)) = (a.canonicalize(), b.canonicalize()) {
        return path_collision_key(&a_canonical) == path_collision_key(&b_canonical);
    }
    path_collision_key(a) == path_collision_key(b)
}

fn ensure_not_copying_dir_into_itself(source_path: &Path, final_dest: &Path) -> Result<(), String> {
    let source_meta =
        fs::symlink_metadata(source_path).map_err(|e| format!("Failed to stat source: {e}"))?;
    if !source_meta.file_type().is_dir() {
        return Ok(());
    }

    if let Ok(canonical_source) = source_path.canonicalize() {
        let canonical_dest = final_dest
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .map(|p| p.join(final_dest.file_name().unwrap_or_default()));
        if let Some(canonical_dest) = canonical_dest {
            if canonical_dest.starts_with(&canonical_source) {
                return Err(
                    "Cannot copy or move a directory into itself or one of its subdirectories"
                        .to_string(),
                );
            }
        }
    }
    Ok(())
}

fn unique_destination_path(
    dest_dir: &Path,
    file_name: &std::ffi::OsStr,
    planned_destinations: &HashSet<String>,
) -> Result<PathBuf, String> {
    let original = Path::new(file_name);
    let stem = original.file_stem().map_or_else(
        || original.to_string_lossy().to_string(),
        |s| s.to_string_lossy().to_string(),
    );
    let ext = original
        .extension()
        .map(|e| e.to_string_lossy().to_string());

    for i in 1..10_000u32 {
        let candidate_name = match &ext {
            Some(ext) if !ext.is_empty() => format!("{stem} ({i}).{ext}"),
            _ => format!("{stem} ({i})"),
        };
        let candidate = dest_dir.join(candidate_name);
        let candidate_key = path_collision_key(&candidate);
        if !path_exists_no_follow(&candidate) && !planned_destinations.contains(&candidate_key) {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Could not choose a unique destination for {}",
        original.to_string_lossy()
    ))
}

fn is_keep_both_action(conflict_action: &str) -> bool {
    matches!(
        conflict_action.to_ascii_lowercase().as_str(),
        "rename" | "keep-both" | "keep_both"
    )
}

fn conflict_for_existing_destination(path: &Path) -> String {
    format!(
        "CONFLICT: destination already exists: {}",
        path.to_string_lossy()
    )
}

fn resolve_destination(
    source_path: &Path,
    dest_dir: &Path,
    conflict_action: &str,
    planned_destinations: &HashSet<String>,
) -> Result<Option<(PathBuf, bool)>, String> {
    let file_name = source_path
        .file_name()
        .ok_or_else(|| "Cannot get file name".to_string())?;
    let final_dest = dest_dir.join(file_name);
    let final_key = path_collision_key(&final_dest);
    let exists = path_exists_no_follow(&final_dest);
    let planned_conflict = planned_destinations.contains(&final_key);

    if !exists && !planned_conflict {
        return Ok(Some((final_dest, false)));
    }

    match conflict_action.to_ascii_lowercase().as_str() {
        "skip" => Ok(None),
        "replace" => {
            if planned_conflict {
                return Err(format!(
                    "CONFLICT: multiple sources would replace the same destination: {}",
                    final_dest.to_string_lossy()
                ));
            }
            if exists && paths_refer_to_same_entry(source_path, &final_dest) {
                return Ok(None);
            }
            Ok(Some((final_dest, exists)))
        }
        "rename" | "keep-both" | "keep_both" => Ok(Some((
            unique_destination_path(dest_dir, file_name, planned_destinations)?,
            false,
        ))),
        _ => Err(format!(
            "CONFLICT: destination already exists: {}",
            final_dest.to_string_lossy()
        )),
    }
}

fn prepare_transfer_inputs(
    sources: Vec<String>,
    destination: String,
    conflict_action: &str,
) -> Result<(Vec<TransferPlan>, PathBuf), String> {
    if sources.is_empty() {
        return Err("No sources specified".to_string());
    }

    let dest_path = validate_existing_path_no_resolve(&destination)?;
    if !dest_path.is_dir() {
        return Err(format!("Destination is not a directory: {destination}"));
    }

    let mut plans = Vec::with_capacity(sources.len());
    let mut planned_destinations = HashSet::new();
    let keep_both = is_keep_both_action(conflict_action);

    for source in sources {
        let source_path = validate_path_no_follow(&source)?;
        let Some((final_dest, replace_existing)) = resolve_destination(
            &source_path,
            &dest_path,
            conflict_action,
            &planned_destinations,
        )?
        else {
            continue;
        };

        ensure_not_copying_dir_into_itself(&source_path, &final_dest)?;
        planned_destinations.insert(path_collision_key(&final_dest));
        plans.push(TransferPlan {
            source_path,
            final_dest,
            replace_existing,
            allow_rename: !keep_both,
        });
    }

    Ok((plans, dest_path))
}

fn remove_path(path: &Path, label: &str) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| format!("Failed to stat {label}: {e}"))?;
    if meta.file_type().is_symlink() {
        #[cfg(windows)]
        {
            if meta.is_dir() {
                fs::remove_dir(path)
                    .map_err(|e| format!("Failed to delete {} symlink: {}", label, e))
            } else {
                fs::remove_file(path)
                    .map_err(|e| format!("Failed to delete {} symlink: {}", label, e))
            }
        }
        #[cfg(not(windows))]
        {
            fs::remove_file(path).map_err(|e| format!("Failed to delete {label} symlink: {e}"))
        }
    } else if meta.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to delete {label} directory: {e}"))
    } else {
        fs::remove_file(path).map_err(|e| format!("Failed to delete {label} file: {e}"))
    }
}

fn remove_existing_destination(path: &Path) -> Result<(), String> {
    remove_path(path, "destination")
}

fn remove_source_path(path: &Path) -> Result<(), String> {
    remove_path(path, "source")
}

fn clear_cancelled_operation(state: &Arc<AppState>, operation_id: &str) {
    let mut cancelled = state.cancelled_operations.lock();
    cancelled.remove(operation_id);
}

fn is_operation_cancelled(state: &Arc<AppState>, operation_id: &str) -> bool {
    let cancelled = state.cancelled_operations.lock();
    cancelled.get(operation_id).copied().unwrap_or(false)
}

fn check_cancelled(state: &Arc<AppState>, operation_id: &str) -> Result<(), String> {
    if is_operation_cancelled(state, operation_id) {
        Err("Operation cancelled".to_string())
    } else {
        Ok(())
    }
}

struct ProgressContext<'a> {
    app: &'a AppHandle,
    operation_id: &'a str,
    operation_type: &'a str,
    state: &'a Arc<AppState>,
    total_bytes: &'a Arc<AtomicU64>,
}

impl ProgressContext<'_> {
    fn check_cancelled(&self) -> Result<(), String> {
        check_cancelled(self.state, self.operation_id)
    }

    fn emit(&self, current: u64, current_item: String, status: &str, error: Option<String>) {
        self.emit_with_total(
            current,
            self.total_bytes.load(Ordering::Relaxed),
            current_item,
            status,
            error,
        );
    }

    fn emit_with_total(
        &self,
        current: u64,
        total: u64,
        current_item: String,
        status: &str,
        error: Option<String>,
    ) {
        let _ = self.app.emit(
            "operation-progress",
            ProgressUpdate {
                operation_id: self.operation_id.to_string(),
                operation_type: self.operation_type.to_string(),
                current,
                total,
                current_item,
                status: status.to_string(),
                error,
            },
        );
    }
}

struct CopyContext<'a> {
    progress: &'a ProgressContext<'a>,
    network: bool,
}

impl CopyContext<'_> {
    fn attempts(&self) -> u32 {
        if self.network {
            NETWORK_MAX_RETRIES
        } else {
            1
        }
    }

    fn buffer_size(&self) -> usize {
        if self.network {
            NETWORK_BUFFER_SIZE
        } else {
            LOCAL_BUFFER_SIZE
        }
    }
}

fn copy_symlink(source_path: &Path, dst_path: &Path) -> Result<(), String> {
    if let Some(parent) = dst_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {e}"))?;
    }
    let link_target =
        fs::read_link(source_path).map_err(|e| format!("Failed to read symlink target: {e}"))?;
    #[cfg(unix)]
    std::os::unix::fs::symlink(&link_target, dst_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            conflict_for_existing_destination(dst_path)
        } else {
            format!("Failed to create symlink: {e}")
        }
    })?;
    #[cfg(windows)]
    {
        let result = if link_target.is_dir() {
            std::os::windows::fs::symlink_dir(&link_target, dst_path)
        } else {
            std::os::windows::fs::symlink_file(&link_target, dst_path)
        };
        result.map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                conflict_for_existing_destination(dst_path)
            } else {
                format!("Failed to create symlink: {}", e)
            }
        })?;
    }
    Ok(())
}

fn create_dir_exclusive(path: &Path) -> Result<(), String> {
    fs::create_dir(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            format!(
                "CONFLICT: destination already exists: {}",
                path.to_string_lossy()
            )
        } else {
            format!("Failed to create directory: {e}")
        }
    })
}

fn copy_file_attempt(
    src: &Path,
    dst: &Path,
    ctx: &CopyContext,
    completed_bytes: u64,
    buffer_size: usize,
) -> Result<u64, String> {
    let src_file = fs::File::open(src).map_err(|e| format!("Failed to open source file: {e}"))?;
    let dst_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dst)
        .map_err(|e| format!("Failed to create destination file: {e}"))?;
    let mut reader = BufReader::with_capacity(buffer_size, src_file);
    let mut writer = BufWriter::with_capacity(buffer_size, dst_file);
    let mut buffer = vec![0u8; buffer_size];
    let mut copied_this_attempt = 0u64;
    let mut next_emit_at = PROGRESS_BYTE_STEP;

    loop {
        ctx.progress.check_cancelled()?;
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read source file: {e}"))?;
        if read == 0 {
            break;
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|e| format!("Failed to write destination file: {e}"))?;
        copied_this_attempt += read as u64;

        if copied_this_attempt >= next_emit_at {
            ctx.progress.emit(
                completed_bytes + copied_this_attempt,
                src.to_string_lossy().to_string(),
                "running",
                None,
            );
            while next_emit_at <= copied_this_attempt {
                next_emit_at = next_emit_at.saturating_add(PROGRESS_BYTE_STEP);
            }
        }
    }

    writer
        .flush()
        .map_err(|e| format!("Failed to flush destination file: {e}"))?;
    crate::fs_ops::preserve_basic_metadata(src, dst)?;
    Ok(copied_this_attempt)
}

fn copy_file_with_progress(
    src: &Path,
    dst: &Path,
    ctx: &CopyContext,
    completed_bytes: &mut u64,
) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {e}"))?;
    }

    let file_len = fs::symlink_metadata(src)
        .map_err(|e| format!("Failed to stat source file: {e}"))?
        .len();
    ctx.progress
        .total_bytes
        .fetch_add(file_len, Ordering::Relaxed);

    if file_len == 0 {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dst)
            .map_err(|e| format!("Failed to create destination file: {e}"))?;
        crate::fs_ops::preserve_basic_metadata(src, dst)?;
        ctx.progress.emit(
            *completed_bytes,
            src.to_string_lossy().to_string(),
            "running",
            None,
        );
        return Ok(());
    }

    let attempts = ctx.attempts();
    let buffer_size = ctx.buffer_size();
    let mut last_err = String::new();

    for attempt in 0..attempts {
        ctx.progress.check_cancelled()?;
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(500 * (1u64 << (attempt - 1))));
            let _ = fs::remove_file(dst);
        }

        match copy_file_attempt(src, dst, ctx, *completed_bytes, buffer_size) {
            Ok(written) => {
                *completed_bytes += written;
                if written > file_len {
                    ctx.progress
                        .total_bytes
                        .fetch_add(written - file_len, Ordering::Relaxed);
                }
                ctx.progress.emit(
                    *completed_bytes,
                    src.to_string_lossy().to_string(),
                    "running",
                    None,
                );
                return Ok(());
            }
            Err(e) if e == "Operation cancelled" => return Err(e),
            Err(e) => {
                last_err = e;
                let _ = fs::remove_file(dst);
            }
        }
    }

    Err(last_err)
}

fn copy_item_with_progress(
    src: &Path,
    dst: &Path,
    ctx: &CopyContext,
    completed_bytes: &mut u64,
) -> Result<(), String> {
    let mut stack: Vec<(PathBuf, PathBuf)> = vec![(src.to_path_buf(), dst.to_path_buf())];
    let mut copied_dirs: Vec<(PathBuf, PathBuf)> = Vec::new();

    while let Some((src_path, dst_path)) = stack.pop() {
        ctx.progress.check_cancelled()?;
        ctx.progress.emit(
            *completed_bytes,
            src_path.to_string_lossy().to_string(),
            "running",
            None,
        );

        if path_exists_no_follow(&dst_path) {
            return Err(format!(
                "CONFLICT: destination already exists: {}",
                dst_path.to_string_lossy()
            ));
        }

        let lstat =
            fs::symlink_metadata(&src_path).map_err(|e| format!("Failed to stat source: {e}"))?;
        let ft = lstat.file_type();

        if ft.is_dir() {
            create_dir_exclusive(&dst_path)?;
            copied_dirs.push((src_path.clone(), dst_path.clone()));
            for entry in
                fs::read_dir(&src_path).map_err(|e| format!("Failed to read directory: {e}"))?
            {
                let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
                stack.push((entry.path(), dst_path.join(entry.file_name())));
            }
        } else if ft.is_symlink() {
            copy_symlink(&src_path, &dst_path)?;
        } else {
            copy_file_with_progress(&src_path, &dst_path, ctx, completed_bytes)?;
        }
    }

    for (src_dir, dst_dir) in copied_dirs.into_iter().rev() {
        crate::fs_ops::preserve_basic_metadata(&src_dir, &dst_dir)?;
    }

    Ok(())
}

fn ensure_destination_available(plan: &TransferPlan) -> Result<(), String> {
    if !plan.replace_existing && path_exists_no_follow(&plan.final_dest) {
        return Err(conflict_for_existing_destination(&plan.final_dest));
    }
    Ok(())
}

fn copy_plan_with_progress(
    plan: &TransferPlan,
    ctx: &ProgressContext,
    completed_bytes: &mut u64,
) -> Result<(), String> {
    ensure_destination_available(plan)?;

    if plan.replace_existing && path_exists_no_follow(&plan.final_dest) {
        remove_existing_destination(&plan.final_dest)?;
    }

    let network = false;
    let copy_ctx = CopyContext {
        progress: ctx,
        network,
    };
    copy_item_with_progress(
        &plan.source_path,
        &plan.final_dest,
        &copy_ctx,
        completed_bytes,
    )
}

fn move_plan_with_progress(
    plan: &TransferPlan,
    ctx: &ProgressContext,
    completed_bytes: &mut u64,
) -> Result<(), String> {
    let network = false;

    ensure_destination_available(plan)?;

    if plan.replace_existing && path_exists_no_follow(&plan.final_dest) {
        remove_existing_destination(&plan.final_dest)?;
    }

    if plan.allow_rename && !network && fs::rename(&plan.source_path, &plan.final_dest).is_ok() {
        let total = ctx.total_bytes.fetch_add(1, Ordering::Relaxed) + 1;
        *completed_bytes += 1;
        ctx.emit_with_total(
            *completed_bytes,
            total,
            plan.source_path.to_string_lossy().to_string(),
            "running",
            None,
        );
        return Ok(());
    }

    let copy_ctx = CopyContext {
        progress: ctx,
        network,
    };
    copy_item_with_progress(
        &plan.source_path,
        &plan.final_dest,
        &copy_ctx,
        completed_bytes,
    )?;
    remove_source_path(&plan.source_path)
        .map_err(|e| format!("Copied but failed to delete source: {e}"))?;
    Ok(())
}

fn choose_next_keep_both_destination(
    plan: &mut TransferPlan,
    reserved_destinations: &mut HashSet<String>,
) -> Result<(), String> {
    reserved_destinations.remove(&path_collision_key(&plan.final_dest));
    let dest_dir = plan
        .final_dest
        .parent()
        .ok_or_else(|| "Cannot get destination directory".to_string())?;
    let file_name = plan
        .source_path
        .file_name()
        .ok_or_else(|| "Cannot get file name".to_string())?;
    let next_dest = unique_destination_path(dest_dir, file_name, reserved_destinations)?;
    ensure_not_copying_dir_into_itself(&plan.source_path, &next_dest)?;
    reserved_destinations.insert(path_collision_key(&next_dest));
    plan.final_dest = next_dest;
    Ok(())
}

fn transfer_with_progress_blocking(
    operation_type: &'static str,
    sources: Vec<String>,
    destination: String,
    operation_id: Option<String>,
    conflict_action: Option<String>,
    app: AppHandle,
    state: Arc<AppState>,
) -> Result<Vec<TransferResult>, String> {
    let operation_id = operation_id.unwrap_or_else(generate_operation_id);
    let conflict_action = conflict_action.unwrap_or_else(|| "error".to_string());
    let (plans, _dest_path) = prepare_transfer_inputs(sources, destination, &conflict_action)?;
    let keep_both = is_keep_both_action(&conflict_action);
    let mut reserved_destinations: HashSet<String> = plans
        .iter()
        .map(|plan| path_collision_key(&plan.final_dest))
        .collect();

    {
        let mut cancelled = state.cancelled_operations.lock();
        cancelled.insert(operation_id.clone(), false);
    }

    let total_bytes = Arc::new(AtomicU64::new(0));
    let mut completed_bytes = 0u64;
    let mut transferred = Vec::with_capacity(plans.len());
    let progress = ProgressContext {
        app: &app,
        operation_id: &operation_id,
        operation_type,
        state: &state,
        total_bytes: &total_bytes,
    };

    progress.emit_with_total(0, 0, String::new(), "running", None);

    let result = (|| -> Result<Vec<TransferResult>, String> {
        for mut plan in plans {
            check_cancelled(&state, &operation_id)?;
            let source = plan.source_path.to_string_lossy().to_string();
            let mut completed_plan = false;

            for _ in 0..100 {
                match operation_type {
                    "copy" => match copy_plan_with_progress(&plan, &progress, &mut completed_bytes)
                    {
                        Ok(()) => {
                            completed_plan = true;
                            break;
                        }
                        Err(e) if keep_both && e.starts_with("CONFLICT:") => {
                            choose_next_keep_both_destination(
                                &mut plan,
                                &mut reserved_destinations,
                            )?;
                        }
                        Err(e) => return Err(e),
                    },
                    "move" => match move_plan_with_progress(&plan, &progress, &mut completed_bytes)
                    {
                        Ok(()) => {
                            completed_plan = true;
                            break;
                        }
                        Err(e) if keep_both && e.starts_with("CONFLICT:") => {
                            choose_next_keep_both_destination(
                                &mut plan,
                                &mut reserved_destinations,
                            )?;
                        }
                        Err(e) => return Err(e),
                    },
                    _ => return Err(format!("Unsupported operation: {operation_type}")),
                }
            }

            if !completed_plan {
                return Err(
                    "Could not choose a unique destination after repeated conflicts".to_string(),
                );
            }

            transferred.push(TransferResult {
                source,
                destination: plan.final_dest.to_string_lossy().to_string(),
            });
        }
        Ok(transferred)
    })();

    clear_cancelled_operation(&state, &operation_id);
    let final_total = total_bytes.load(Ordering::Relaxed);

    match result {
        Ok(transferred) => {
            progress.emit_with_total(final_total, final_total, String::new(), "completed", None);
            Ok(transferred)
        }
        Err(e) => {
            progress.emit_with_total(
                completed_bytes,
                final_total,
                String::new(),
                "error",
                Some(e.clone()),
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn copy_with_progress(
    sources: Vec<String>,
    destination: String,
    operation_id: Option<String>,
    conflict_action: Option<String>,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<TransferResult>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        transfer_with_progress_blocking(
            "copy",
            sources,
            destination,
            operation_id,
            conflict_action,
            app,
            state,
        )
    })
    .await
    .map_err(|e| format!("Transfer task failed: {e}"))?
}

#[tauri::command]
pub async fn move_with_progress(
    sources: Vec<String>,
    destination: String,
    operation_id: Option<String>,
    conflict_action: Option<String>,
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<TransferResult>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        transfer_with_progress_blocking(
            "move",
            sources,
            destination,
            operation_id,
            conflict_action,
            app,
            state,
        )
    })
    .await
    .map_err(|e| format!("Transfer task failed: {e}"))?
}

#[tauri::command]
pub fn cancel_operation(
    operation_id: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut cancelled = state.cancelled_operations.lock();
    if let Some(flag) = cancelled.get_mut(&operation_id) {
        *flag = true;
        Ok(())
    } else {
        Err("Operation not found".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::prepare_transfer_inputs;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("simplefile_progress_test_{}_{}", name, nanos))
    }

    #[test]
    fn prepare_transfer_inputs_rejects_existing_destination() {
        let src_dir = unique_temp_path("conflict_src");
        let dst_dir = unique_temp_path("conflict_dst");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dst_dir).unwrap();
        let source = src_dir.join("same.txt");
        let destination = dst_dir.join("same.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let result = prepare_transfer_inputs(
            vec![source.to_string_lossy().to_string()],
            dst_dir.to_string_lossy().to_string(),
            "error",
        );

        assert!(result.unwrap_err().starts_with("CONFLICT:"));

        let _ = fs::remove_dir_all(&src_dir);
        let _ = fs::remove_dir_all(&dst_dir);
    }

    #[test]
    fn prepare_transfer_inputs_renames_existing_destination() {
        let src_dir = unique_temp_path("rename_src");
        let dst_dir = unique_temp_path("rename_dst");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dst_dir).unwrap();
        let source = src_dir.join("same.txt");
        let destination = dst_dir.join("same.txt");
        fs::write(&source, b"source").unwrap();
        fs::write(&destination, b"destination").unwrap();

        let (plans, _) = prepare_transfer_inputs(
            vec![source.to_string_lossy().to_string()],
            dst_dir.to_string_lossy().to_string(),
            "rename",
        )
        .expect("rename should plan a unique destination");

        assert_eq!(plans.len(), 1);
        assert_eq!(
            plans[0].final_dest.file_name().unwrap().to_string_lossy(),
            "same (1).txt"
        );
        assert!(!plans[0].allow_rename);

        let _ = fs::remove_dir_all(&src_dir);
        let _ = fs::remove_dir_all(&dst_dir);
    }

    #[test]
    fn prepare_transfer_inputs_rejects_directory_into_itself() {
        let src_dir = unique_temp_path("self_src");
        fs::create_dir_all(&src_dir).unwrap();
        let nested_destination = src_dir.join("nested");
        fs::create_dir_all(&nested_destination).unwrap();

        let result = prepare_transfer_inputs(
            vec![src_dir.to_string_lossy().to_string()],
            nested_destination.to_string_lossy().to_string(),
            "error",
        );

        assert!(result
            .unwrap_err()
            .contains("directory into itself or one of its subdirectories"));

        let _ = fs::remove_dir_all(&src_dir);
    }
}
