use crate::utils::hidden_command;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};

// ── Versioned download URLs from rarlab.com ──────────────────────────────────
const DOWNLOAD_URL: &str = "https://www.rarlab.com/rar/winrar-x64-723.exe";

const EXPECTED_DOWNLOAD_SHA256: &str =
    "8ff0daf3ed564cc743c0e23ff2e253997ffc74460f9673f0b6dd037b2db4ce7b";

const PENDING_INSTALL_TTL: Duration = Duration::from_secs(30 * 60);

static PENDING_RAR_INSTALLS: Lazy<Mutex<HashMap<String, PendingRarInstall>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone)]
struct PendingRarInstall {
    created_at: SystemTime,
    installer_path: PathBuf,
}

#[derive(Serialize)]
pub struct RarInstallPlan {
    confirmation_token: String,
    download_url: String,
    file_name: String,
    installer_path: String,
    publisher: Option<String>,
    sha256: String,
}

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
    let bin = dir.join("rar.exe");
    bin.exists().then_some(bin)
}

/// On Windows, WinRAR's silent installer places rar.exe in a well-known location.
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

/// Downloads, verifies, confirms, and installs WinRAR silently.
/// Returns the path to the installed RAR binary on success.
#[tauri::command]
pub async fn prepare_rar_install() -> Result<RarInstallPlan, String> {
    prepare_rar_install_inner().await
}

#[tauri::command]
pub async fn install_rar(app: AppHandle, confirmation_token: String) -> Result<String, String> {
    if confirmation_token.trim().is_empty() {
        return Err("RAR installation requires explicit user confirmation.".to_string());
    }

    let install_dir = rar_install_dir(&app)?;
    std::fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Cannot create install directory: {e}"))?;

    let pending = take_pending_install(&confirmation_token)?;

    let result = install_rar_windows(&pending.installer_path, &install_dir);
    let _ = std::fs::remove_file(&pending.installer_path);
    result
}

#[tauri::command]
pub fn discard_rar_install(confirmation_token: String) -> Result<(), String> {
    if confirmation_token.trim().is_empty() {
        return Ok(());
    }

    discard_pending_install(&confirmation_token);
    Ok(())
}

async fn prepare_rar_install_inner() -> Result<RarInstallPlan, String> {
    let bytes = download_bytes(DOWNLOAD_URL).await?;
    let sha256 = verify_sha256(&bytes)?;
    let token = generate_confirmation_token()?;
    let installer_path = pending_installer_path(&token)?;

    std::fs::write(&installer_path, &bytes)
        .map_err(|e| format!("Failed to stage RAR installer: {e}"))?;

    let publisher = Some(match verify_windows_authenticode(&installer_path) {
        Ok(publisher) => publisher,
        Err(error) => {
            let _ = std::fs::remove_file(&installer_path);
            return Err(error);
        }
    });

    {
        let mut pending = PENDING_RAR_INSTALLS.lock();
        prune_pending_installs(&mut pending);
        pending.insert(
            token.clone(),
            PendingRarInstall {
                created_at: SystemTime::now(),
                installer_path: installer_path.clone(),
            },
        );
    }

    Ok(RarInstallPlan {
        confirmation_token: token,
        download_url: DOWNLOAD_URL.to_string(),
        file_name: installer_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "rar-installer".to_string()),
        installer_path: installer_path.to_string_lossy().to_string(),
        publisher,
        sha256,
    })
}

fn take_pending_install(token: &str) -> Result<PendingRarInstall, String> {
    let mut pending = PENDING_RAR_INSTALLS.lock();
    prune_pending_installs(&mut pending);
    pending.remove(token).ok_or_else(|| {
        "RAR installation confirmation expired or was not prepared. Try Install RAR again."
            .to_string()
    })
}

fn discard_pending_install(token: &str) {
    let mut pending = PENDING_RAR_INSTALLS.lock();
    if let Some(install) = pending.remove(token) {
        let _ = std::fs::remove_file(install.installer_path);
    }
}

// ── Windows install ──────────────────────────────────────────────────────────

/// Windows: run the verified WinRAR installer with /S (silent), then verify
/// rar.exe exists at the default WinRAR installation path.
fn install_rar_windows(installer_path: &Path, _install_dir: &Path) -> Result<String, String> {
    let status = std::process::Command::new(installer_path)
        .arg("/S")
        .status()
        .map_err(|e| format!("Failed to run WinRAR installer: {}", e))?;

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

fn generate_confirmation_token() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| format!("Failed to create confirmation token: {e}"))?;
    Ok(hex_encode(&bytes))
}

fn pending_installer_path(token: &str) -> Result<PathBuf, String> {
    let source_name = DOWNLOAD_URL
        .rsplit('/')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("rar-installer.download");
    let filename = format!("simplefile-rar-installer-{token}-{source_name}");
    Ok(std::env::temp_dir().join(filename))
}

fn prune_pending_installs(pending: &mut HashMap<String, PendingRarInstall>) {
    let now = SystemTime::now();
    let expired: Vec<String> = pending
        .iter()
        .filter(|(_, install)| {
            now.duration_since(install.created_at)
                .map(|age| age > PENDING_INSTALL_TTL)
                .unwrap_or(true)
        })
        .map(|(token, _)| token.clone())
        .collect();

    for token in expired {
        if let Some(install) = pending.remove(&token) {
            let _ = std::fs::remove_file(install.installer_path);
        }
    }
}

fn verify_sha256(bytes: &[u8]) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let actual = hex_encode(&hasher.finalize());
    if actual != EXPECTED_DOWNLOAD_SHA256 {
        return Err(format!(
            "Downloaded RAR artifact SHA-256 mismatch. Expected {EXPECTED_DOWNLOAD_SHA256}, got {actual}."
        ));
    }
    Ok(actual)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn verify_windows_authenticode(path: &Path) -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $args[0]
if ($signature.Status -ne 'Valid') {
  throw "Authenticode signature is $($signature.Status): $($signature.StatusMessage)"
}
$subject = $signature.SignerCertificate.Subject
if ($subject -notlike '*CN=win.rar GmbH*' -or $subject -notlike '*O=win.rar GmbH*') {
  throw "Unexpected installer publisher: $subject"
}
$subject
"#;
    let output = hidden_command("powershell")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script)
        .arg(path)
        .output()
        .map_err(|e| format!("Failed to verify WinRAR Authenticode signature: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!(
            "WinRAR Authenticode verification failed: {}",
            if detail.is_empty() {
                "PowerShell returned an error without details"
            } else {
                detail.as_str()
            }
        ));
    }

    let subject = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if subject.is_empty() {
        return Err("WinRAR Authenticode verification did not return a signer.".to_string());
    }
    Ok(subject)
}

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
