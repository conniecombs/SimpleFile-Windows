use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Error as UpdaterError, Updater, UpdaterExt};

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Serialize)]
pub struct AppAboutInfo {
    pub product_name: String,
    pub version: String,
    pub identifier: String,
    pub description: String,
    pub authors: String,
    pub repository: String,
    pub framework: String,
    pub runtime: String,
    pub platform: String,
    pub architecture: String,
    pub build_profile: String,
}

/// Return the currently running app version (from Cargo.toml at build time).
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Return app metadata for the About dialog.
#[tauri::command]
pub fn get_app_about_info(app: AppHandle) -> AppAboutInfo {
    let build_profile = if cfg!(debug_assertions) {
        "Debug"
    } else {
        "Release"
    };

    AppAboutInfo {
        product_name: "SimpleFile".to_string(),
        version: app.package_info().version.to_string(),
        identifier: "com.simplefile.desktop".to_string(),
        description: env!("CARGO_PKG_DESCRIPTION").to_string(),
        authors: env!("CARGO_PKG_AUTHORS").to_string(),
        repository: option_env!("CARGO_PKG_REPOSITORY")
            .unwrap_or("https://github.com/conniecombs/SimpleFile-Svelte")
            .to_string(),
        framework: "Tauri 2".to_string(),
        runtime: "Rust backend + WebView frontend".to_string(),
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        build_profile: build_profile.to_string(),
    }
}

/// Check GitHub releases for a newer version.
/// Returns Some(UpdateInfo) if an update is available, None if already up to date.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = build_configured_updater(&app)?;

    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            notes: update.body.clone(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Download and install the latest update, then restart the app.
/// Emits `update-chunk` events with (bytesDownloaded, totalBytes|null) during download.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = build_configured_updater(&app)?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let app_handle = app.clone();
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            move |chunk_len, total| {
                downloaded += chunk_len as u64;
                let _ = app_handle.emit("update-chunk", (downloaded, total));
            },
            move || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    app.restart();
}

fn build_configured_updater(app: &AppHandle) -> Result<Updater, String> {
    app.updater_builder().build().map_err(|error| match error {
        UpdaterError::EmptyEndpoints => {
            "App updates are not configured for this build.".to_string()
        }
        error => error.to_string(),
    })
}
