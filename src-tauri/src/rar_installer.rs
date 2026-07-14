use crate::utils::hidden_command;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// ── Versioned download URLs from rarlab.com ──────────────────────────────────
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const DOWNLOAD_URL: &str = "https://www.rarlab.com/rar/rarlinux-x64-701.tar.gz";

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const DOWNLOAD_URL: &str = "https://www.rarlab.com/rar/rarlinux-arm-701.tar.gz";

#[cfg(target_os = "macos")]
const DOWNLOAD_URL: &str = "https://www.rarlab.com/rar/rarmac-701.tar.gz";

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const DOWNLOAD_URL: &str = "https://www.rarlab.com/rar/winrar-x64-701.exe";

#[cfg(all(target_os = "windows", not(target_arch = "x86_64")))]
const DOWNLOAD_URL: &str = "https://www.rarlab.com/rar/wrar701.exe";

// ── Internal helpers ─────────────────────────────────────────────────────────

/// Directory inside the app data dir where we place the locally-installed rar binary.
fn rar_install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("rar"))
        .map_err(|e| format!("Cannot determine app data directory: {e}"))
}

/// Returns true if `rar` can be found and launched from the system PATH.
fn rar_in_path() -> bool {
    // `rar` with no arguments exits non-zero but still launches, so any
    // successful spawn (even with non-zero exit code) means it is present.
    hidden_command("rar").output().is_ok()
}

/// Path to the rar binary stored inside the app data directory, if it exists.
fn local_rar_binary(app: &AppHandle) -> Option<PathBuf> {
    let dir = rar_install_dir(app).ok()?;
    #[cfg(target_os = "windows")]
    let bin = dir.join("rar.exe");
    #[cfg(not(target_os = "windows"))]
    let bin = dir.join("rar");
    bin.exists().then_some(bin)
}

/// On Windows, WinRAR's silent installer places rar.exe in a well-known location.
#[cfg(target_os = "windows")]
fn winrar_system_binary() -> Option<PathBuf> {
    // Check system-wide install locations (requires admin).
    let system_paths = [
        r"C:\Program Files\WinRAR\rar.exe",
        r"C:\Program Files (x86)\WinRAR\rar.exe",
    ];
    for path in &system_paths {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    // Check per-user install location (%LOCALAPPDATA%\Programs\WinRAR\rar.exe),
    // used when WinRAR is installed without administrator privileges.
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_app_data)
            .join("Programs")
            .join("WinRAR")
            .join("rar.exe");
        if p.exists() {
            return Some(p);
        }
    }

    None
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Returns the path to the rar binary to use.
/// Priority: PATH → app-local install → (Windows) default `WinRAR` location.
pub fn resolve_rar_binary(app: &AppHandle) -> Option<String> {
    if rar_in_path() {
        return Some("rar".to_string());
    }
    if let Some(p) = local_rar_binary(app) {
        return Some(p.to_string_lossy().to_string());
    }
    #[cfg(target_os = "windows")]
    if let Some(p) = winrar_system_binary() {
        return Some(p.to_string_lossy().to_string());
    }
    None
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns true when the `rar` binary is available (PATH or app-local install).
#[tauri::command]
pub fn check_rar_installed(app: AppHandle) -> bool {
    resolve_rar_binary(&app).is_some()
}

/// Downloads and installs the RAR command-line tool silently.
/// On Linux/macOS: extracts the `rar` binary to the app data directory.
/// On Windows: runs the `WinRAR` installer with the /S (silent) flag.
/// Returns the path to the installed binary on success.
#[tauri::command]
pub async fn install_rar(app: AppHandle) -> Result<String, String> {
    let install_dir = rar_install_dir(&app)?;
    std::fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Cannot create install directory: {e}"))?;

    let bytes = download_bytes(DOWNLOAD_URL).await?;

    #[cfg(target_os = "windows")]
    {
        install_rar_windows(&bytes, &install_dir)
    }
    #[cfg(not(target_os = "windows"))]
    {
        install_rar_unix(&bytes, &install_dir)
    }
}

// ── Platform-specific install ─────────────────────────────────────────────────

/// Linux / macOS: extract the `rar` binary from the downloaded tar.gz.
#[cfg(not(target_os = "windows"))]
fn install_rar_unix(bytes: &[u8], install_dir: &Path) -> Result<String, String> {
    use std::os::unix::fs::PermissionsExt;

    let cursor = std::io::Cursor::new(bytes);
    let decoder = flate2::read::GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(decoder);

    let rar_dest = install_dir.join("rar");

    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.into_owned();
        // The tar.gz from rarlab.com contains "rar/rar" (the rar binary itself).
        if path.to_string_lossy() == "rar/rar" {
            entry
                .unpack(&rar_dest)
                .map_err(|e| format!("Failed to extract rar binary: {e}"))?;
            break;
        }
    }

    if !rar_dest.exists() {
        return Err("Failed to locate the rar binary inside the downloaded archive".to_string());
    }

    std::fs::set_permissions(&rar_dest, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("Failed to set execute permission: {e}"))?;

    Ok(rar_dest.to_string_lossy().to_string())
}

/// Windows: save the WinRAR installer to a temp file, run it with /S (silent),
/// then verify rar.exe exists at the default WinRAR installation path.
#[cfg(target_os = "windows")]
fn install_rar_windows(bytes: &[u8], _install_dir: &Path) -> Result<String, String> {
    let temp_installer = std::env::temp_dir().join("winrar_setup.exe");
    std::fs::write(&temp_installer, bytes)
        .map_err(|e| format!("Failed to save WinRAR installer: {}", e))?;

    let status = std::process::Command::new(&temp_installer)
        .arg("/S")
        .status()
        .map_err(|e| format!("Failed to run WinRAR installer: {}", e))?;

    // Clean up temp installer regardless of result
    let _ = std::fs::remove_file(&temp_installer);

    if !status.success() {
        return Err(format!(
            "WinRAR installer exited with code {}",
            status.code().unwrap_or(-1)
        ));
    }

    if let Some(p) = winrar_system_binary() {
        Ok(p.to_string_lossy().to_string())
    } else {
        // rar.exe may be available in PATH after installer adds it
        Ok("WinRAR installed successfully. Restart the app if RAR creation does not work immediately.".to_string())
    }
}

// ── HTTP download ─────────────────────────────────────────────────────────────

async fn download_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed – server returned {}",
            response.status()
        ));
    }

    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read download response: {e}"))
}
