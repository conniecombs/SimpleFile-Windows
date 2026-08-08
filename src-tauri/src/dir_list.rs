//! Fast directory enumeration with optional progressive chunk streaming.
//!
//! On Windows, uses `FindFirstFileExW` + `FIND_FIRST_EX_LARGE_FETCH` so network
//! shares receive larger SMB buffers. Entry metadata is taken from the find
//! data (or `DirEntry` on the fallback path) without re-statting every path.
//! `read_link` only runs for reparse points / symlinks.

use crate::models::{DirectoryListing, DirectoryListingChunk, FileEntry};
use crate::utils::{format_system_time, is_network_path, validate_existing_path_no_resolve};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;

/// First paint budget: enough rows for a typical viewport.
const FIRST_CHUNK_SIZE: usize = 96;
/// Subsequent chunks trade IPC overhead vs. progressive updates.
const LATER_CHUNK_SIZE: usize = 256;

pub(crate) fn list_directory_blocking(
    path: String,
    on_chunk: Channel<DirectoryListingChunk>,
) -> Result<DirectoryListing, String> {
    if let Some(listing) = crate::archive::list_archive_directory(&path)? {
        let _ = on_chunk.send(DirectoryListingChunk {
            path: listing.path.clone(),
            parent: listing.parent.clone(),
            entries: listing.entries.clone(),
            chunk_index: 0,
            done: true,
            is_network: listing.is_network,
        });
        return Ok(listing);
    }

    let path_buf = validate_existing_path_no_resolve(&path)?;
    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    let current_path = path_buf.to_string_lossy().to_string();
    let parent = path_buf.parent().map(|p| p.to_string_lossy().to_string());
    let is_network = is_network_path(&path_buf);

    let mut all_entries: Vec<FileEntry> = Vec::new();
    let mut pending: Vec<FileEntry> = Vec::with_capacity(FIRST_CHUNK_SIZE);
    let mut chunk_index: u32 = 0;

    let flush = |entries: &mut Vec<FileEntry>,
                 all: &mut Vec<FileEntry>,
                 index: &mut u32,
                 done: bool|
     -> Result<(), String> {
        if entries.is_empty() && !done {
            return Ok(());
        }
        let chunk_entries = std::mem::take(entries);
        all.extend(chunk_entries.iter().cloned());
        on_chunk
            .send(DirectoryListingChunk {
                path: current_path.clone(),
                parent: parent.clone(),
                entries: chunk_entries,
                chunk_index: *index,
                done,
                is_network,
            })
            .map_err(|e| format!("Failed to stream directory listing chunk: {e}"))?;
        *index = index.saturating_add(1);
        Ok(())
    };

    let mut on_entry = |entry: FileEntry| -> Result<(), String> {
        pending.push(entry);
        let threshold = if chunk_index == 0 {
            FIRST_CHUNK_SIZE
        } else {
            LATER_CHUNK_SIZE
        };
        if pending.len() >= threshold {
            flush(&mut pending, &mut all_entries, &mut chunk_index, false)?;
        }
        Ok(())
    };

    enumerate_directory(&path_buf, &mut on_entry)?;
    flush(&mut pending, &mut all_entries, &mut chunk_index, true)?;

    all_entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));

    Ok(DirectoryListing {
        path: current_path,
        parent,
        entries: all_entries,
        is_network,
    })
}

/// Test helper that lists without a live frontend channel.
#[cfg(test)]
pub(crate) fn list_directory_for_test(path: String) -> Result<DirectoryListing, String> {
    // Mirror production enum path without IPC.
    if let Some(listing) = crate::archive::list_archive_directory(&path)? {
        return Ok(listing);
    }

    let path_buf = validate_existing_path_no_resolve(&path)?;
    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    let current_path = path_buf.to_string_lossy().to_string();
    let parent = path_buf.parent().map(|p| p.to_string_lossy().to_string());
    let is_network = is_network_path(&path_buf);
    let mut entries: Vec<FileEntry> = Vec::new();
    enumerate_directory(&path_buf, &mut |entry| {
        entries.push(entry);
        Ok(())
    })?;
    entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(DirectoryListing {
        path: current_path,
        parent,
        entries,
        is_network,
    })
}

fn enumerate_directory(
    path: &Path,
    on_entry: &mut dyn FnMut(FileEntry) -> Result<(), String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        match enumerate_directory_windows(path, on_entry) {
            Ok(()) => return Ok(()),
            Err(err) => {
                // Fall back to portable read_dir if the find API fails.
                log::debug!("Windows fast enum failed for {}: {err}", path.display());
            }
        }
    }

    enumerate_directory_std(path, on_entry)
}

fn enumerate_directory_std(
    path: &Path,
    on_entry: &mut dyn FnMut(FileEntry) -> Result<(), String>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {e}"))?;
    for entry in read_dir.flatten() {
        if let Some(file_entry) = crate::utils::get_file_entry_from_dir_entry(&entry) {
            on_entry(file_entry)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn enumerate_directory_windows(
    path: &Path,
    on_entry: &mut dyn FnMut(FileEntry) -> Result<(), String>,
) -> Result<(), String> {
    use std::mem::MaybeUninit;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::errhandlingapi::GetLastError;
    use winapi::um::fileapi::{FindClose, FindFirstFileExW, FindNextFileW};
    use winapi::um::handleapi::INVALID_HANDLE_VALUE;
    use winapi::um::minwinbase::{
        FindExInfoBasic, FindExSearchNameMatch, FIND_FIRST_EX_LARGE_FETCH, WIN32_FIND_DATAW,
    };

    let pattern: Vec<u16> = path
        .join("*")
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut data = MaybeUninit::<WIN32_FIND_DATAW>::zeroed();
    let handle = unsafe {
        FindFirstFileExW(
            pattern.as_ptr(),
            FindExInfoBasic,
            data.as_mut_ptr() as *mut _,
            FindExSearchNameMatch,
            std::ptr::null_mut(),
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        let err = unsafe { GetLastError() };
        return Err(format!(
            "FindFirstFileExW failed for {} (os error {err})",
            path.display()
        ));
    }

    let result = (|| -> Result<(), String> {
        loop {
            let find_data = unsafe { data.assume_init_ref() };
            if let Some(entry) = file_entry_from_find_data(path, find_data) {
                on_entry(entry)?;
            }

            let ok = unsafe { FindNextFileW(handle, data.as_mut_ptr()) };
            if ok == 0 {
                let err = unsafe { GetLastError() };
                // ERROR_NO_MORE_FILES = 18
                if err != 18 {
                    return Err(format!(
                        "FindNextFileW failed for {} (os error {err})",
                        path.display()
                    ));
                }
                break;
            }
        }
        Ok(())
    })();

    unsafe {
        FindClose(handle);
    }

    result
}

#[cfg(windows)]
fn file_entry_from_find_data(
    parent: &Path,
    data: &winapi::um::minwinbase::WIN32_FIND_DATAW,
) -> Option<FileEntry> {
    use std::os::windows::ffi::OsStringExt;
    use winapi::um::winnt::{FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT};

    let name_len = data
        .cFileName
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(data.cFileName.len());
    if name_len == 0 {
        return None;
    }

    let name = std::ffi::OsString::from_wide(&data.cFileName[..name_len]);
    let name_str = name.to_string_lossy();
    if name_str == "." || name_str == ".." {
        return None;
    }

    let attrs = data.dwFileAttributes;
    let is_dir = attrs & FILE_ATTRIBUTE_DIRECTORY != 0;
    let is_reparse = attrs & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    let size = ((data.nFileSizeHigh as u64) << 32) | (data.nFileSizeLow as u64);
    let modified = filetime_to_string(data.ftLastWriteTime);

    let path_buf: PathBuf = parent.join(&name);
    let file_path = path_buf.to_string_lossy().to_string();
    let extension = if is_dir {
        String::new()
    } else {
        path_buf
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    // Only pay for read_link when the find data marks a reparse point.
    let symlink_target = if is_reparse {
        fs::read_link(&path_buf)
            .ok()
            .map(|t| t.to_string_lossy().to_string())
    } else {
        None
    };

    Some(FileEntry {
        name: name_str.into_owned(),
        path: file_path,
        is_dir,
        is_symlink: is_reparse,
        size,
        modified,
        extension,
        permissions: None,
        symlink_target,
        git_status: None,
    })
}

#[cfg(windows)]
fn filetime_to_string(ft: winapi::shared::minwindef::FILETIME) -> String {
    use std::time::{Duration, UNIX_EPOCH};

    let ticks = ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);
    // Windows FILETIME epoch (1601-01-01) to Unix epoch delta in 100ns units.
    const EPOCH_DIFF: u64 = 116_444_736_000_000_000;
    if ticks <= EPOCH_DIFF {
        return String::from("-");
    }
    let nanos = (ticks - EPOCH_DIFF).saturating_mul(100);
    let system_time = UNIX_EPOCH + Duration::from_nanos(nanos);
    format_system_time(system_time)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "simplefile-dirlist-{label}-{}-{nanos}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn lists_files_without_channel() {
        let dir = unique_temp("basic");
        File::create(dir.join("a.txt"))
            .unwrap()
            .write_all(b"hi")
            .unwrap();
        fs::create_dir(dir.join("sub")).unwrap();

        let listing = list_directory_for_test(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(listing.entries.len(), 2);
        assert!(listing.entries[0].is_dir);
        assert_eq!(listing.entries[0].name, "sub");
        assert_eq!(listing.entries[1].name, "a.txt");
        assert_eq!(listing.entries[1].size, 2);

        let _ = fs::remove_dir_all(&dir);
    }
}
