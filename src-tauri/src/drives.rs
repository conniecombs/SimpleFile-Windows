use crate::models::DriveInfo;

#[tauri::command]
pub async fn list_drives() -> Result<Vec<DriveInfo>, String> {
    tauri::async_runtime::spawn_blocking(simplefile_core::drives::list_drives)
        .await
        .map_err(|e| format!("Drive enumeration task failed: {e}"))?
}
