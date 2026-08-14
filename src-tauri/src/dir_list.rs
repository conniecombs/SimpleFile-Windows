//! Tauri adapter around `simplefile_core::dir_list`.
//!
//! Archive virtual paths stay here so the Svelte/Tauri host keeps in-archive
//! listing without pulling `archive.rs` into core yet.

use crate::models::{DirectoryListing, DirectoryListingChunk};
use tauri::ipc::Channel;

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

    simplefile_core::dir_list::list_directory(path, |chunk| {
        on_chunk
            .send(chunk)
            .map_err(|e| format!("Failed to stream directory listing chunk: {e}"))
    })
}

/// Test helper that lists without a live frontend channel.
#[cfg(test)]
pub(crate) fn list_directory_for_test(path: String) -> Result<DirectoryListing, String> {
    if let Some(listing) = crate::archive::list_archive_directory(&path)? {
        return Ok(listing);
    }
    simplefile_core::dir_list::list_directory_collect(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::PathBuf;
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
