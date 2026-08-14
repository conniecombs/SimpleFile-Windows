//! Shell integration: open files and reveal in Explorer.

use std::os::windows::process::CommandExt;
use std::process::Command;

/// Open a file with its default associated application.
pub fn open_file(path: &str) -> Result<(), String> {
    let path_buf = simplefile_core::utils::validate_path_no_follow(path)?;
    Command::new("cmd")
        .args(["/C", "start", "", &path_buf.to_string_lossy()])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("Failed to open file: {e}"))?;
    Ok(())
}

/// Reveal a file or folder in Windows Explorer, selecting it.
pub fn reveal_in_folder(path: &str) -> Result<(), String> {
    let path_buf = simplefile_core::utils::validate_path_no_follow(path)?;
    Command::new("explorer.exe")
        .args(["/select,", &path_buf.to_string_lossy()])
        .spawn()
        .map_err(|e| format!("Failed to reveal in folder: {e}"))?;
    Ok(())
}
