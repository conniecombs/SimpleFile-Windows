use crate::models::DriveInfo;

#[tauri::command]
pub async fn list_drives() -> Result<Vec<DriveInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_drives_blocking)
        .await
        .map_err(|e| format!("Drive enumeration task failed: {e}"))?
}

fn string_from_wide_buffer(buffer: &[u16]) -> Option<String> {
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let value = String::from_utf16_lossy(&buffer[..len]).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn windows_volume_label(wide_path: &[u16]) -> Option<String> {
    use std::ptr::null_mut;

    let mut volume_name = [0u16; 260];
    let has_label = unsafe {
        winapi::um::fileapi::GetVolumeInformationW(
            wide_path.as_ptr(),
            volume_name.as_mut_ptr(),
            volume_name.len() as u32,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            0,
        ) != 0
            && volume_name[0] != 0
    };

    has_label
        .then(|| string_from_wide_buffer(&volume_name))
        .flatten()
}

fn mapped_network_remote_path(drive_path: &str) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::winerror::{ERROR_MORE_DATA, NO_ERROR};
    use winapi::um::winnetwk::WNetGetConnectionW;

    let local_name = drive_path.trim_end_matches(['\\', '/']);
    let wide_local: Vec<u16> = OsStr::new(local_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut len: DWORD = 260;
    let mut remote_name = vec![0u16; len as usize];
    let mut result =
        unsafe { WNetGetConnectionW(wide_local.as_ptr(), remote_name.as_mut_ptr(), &mut len) };

    if result == ERROR_MORE_DATA {
        remote_name.resize(len as usize, 0);
        result =
            unsafe { WNetGetConnectionW(wide_local.as_ptr(), remote_name.as_mut_ptr(), &mut len) };
    }

    if result != NO_ERROR {
        return None;
    }

    string_from_wide_buffer(&remote_name)
}

fn network_remote_display_name(remote_path: &str) -> Option<String> {
    let trimmed = remote_path.trim();
    let without_unc_prefix = trimmed.trim_start_matches(['\\', '/']);
    let mut parts = without_unc_prefix
        .split(['\\', '/'])
        .filter(|part| !part.is_empty());

    match (parts.next(), parts.next()) {
        (Some(server), Some(share)) => Some(format!("{share} on {server}")),
        _ if !trimmed.is_empty() => Some(trimmed.to_string()),
        _ => None,
    }
}

fn windows_error_detail(error_code: u32) -> String {
    use winapi::shared::winerror::{
        ERROR_ACCESS_DENIED, ERROR_BAD_NETPATH, ERROR_BAD_NET_NAME, ERROR_NOT_READY,
        ERROR_PATH_NOT_FOUND,
    };

    match error_code {
        ERROR_BAD_NETPATH => {
            "Network path was not found. Check the server name or VPN connection.".to_string()
        }
        ERROR_BAD_NET_NAME => {
            "Network share was not found. The server may be online but the share is unavailable."
                .to_string()
        }
        ERROR_PATH_NOT_FOUND => {
            "Mapped path was not found. Open the drive to reconnect or remap it.".to_string()
        }
        ERROR_ACCESS_DENIED => {
            "Access was denied. Reconnect with the right credentials.".to_string()
        }
        ERROR_NOT_READY => "Drive is not ready. Open it to reconnect.".to_string(),
        0 => "Windows reported the mapped drive as unavailable.".to_string(),
        code => format!("Windows error {code}. Open the drive to reconnect or check credentials."),
    }
}

fn network_drive_status(wide_path: &[u16], remote_path: Option<&str>) -> (String, Option<String>) {
    use winapi::um::fileapi::{GetFileAttributesW, INVALID_FILE_ATTRIBUTES};

    let attributes = unsafe { GetFileAttributesW(wide_path.as_ptr()) };
    if attributes != INVALID_FILE_ATTRIBUTES {
        let detail = remote_path
            .map(|remote| format!("Connected to {remote}"))
            .or_else(|| Some("Network drive is reachable; share name is unavailable.".to_string()));
        return ("available".to_string(), detail);
    }

    let error_code = std::io::Error::last_os_error()
        .raw_os_error()
        .unwrap_or(0)
        .max(0) as u32;
    if remote_path.is_some() {
        return (
            "offline".to_string(),
            Some(format!(
                "{} The mapping is still present; open the drive to reconnect.",
                windows_error_detail(error_code)
            )),
        );
    }

    (
        "stale".to_string(),
        Some(format!(
            "{} Windows did not return a share name for this mapping; reconnect or remove the stale drive.",
            windows_error_detail(error_code)
        )),
    )
}

fn windows_drive_display_name(
    drive_type: u32,
    wide_path: &[u16],
    remote_path: Option<&str>,
    fallback_name: &str,
) -> String {
    match drive_type {
        3 => windows_volume_label(wide_path),
        4 => remote_path.and_then(network_remote_display_name),
        _ => None,
    }
    .unwrap_or_else(|| fallback_name.to_string())
}

fn list_drives_blocking() -> Result<Vec<DriveInfo>, String> {
    let mut drives = Vec::new();

    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    for letter in b'A'..=b'Z' {
        let drive_path = format!("{}:\\", letter as char);
        let wide_path: Vec<u16> = OsStr::new(&drive_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let dt = winapi::um::fileapi::GetDriveTypeW(wide_path.as_ptr());
            if dt <= 1 {
                continue;
            }

            let drive_type = match dt {
                2 => "Removable",
                3 => "Fixed",
                4 => "Network",
                5 => "CD-ROM",
                6 => "RAM Disk",
                _ => "Unknown",
            }
            .to_string();

            let fallback_name = match dt {
                2 => "Removable Drive",
                3 => "Local Disk",
                4 => "Network Drive",
                5 => "Optical Drive",
                6 => "RAM Disk",
                _ => "Drive",
            };
            let remote_path = if dt == 4 {
                mapped_network_remote_path(&drive_path)
            } else {
                None
            };
            let (drive_status, status_detail) = if dt == 4 {
                network_drive_status(&wide_path, remote_path.as_deref())
            } else {
                ("available".to_string(), None)
            };
            let display_name =
                windows_drive_display_name(dt, &wide_path, remote_path.as_deref(), fallback_name);

            let (total_space, free_space) = if dt == 3 || (dt == 4 && drive_status == "available") {
                let mut free_bytes_available: u64 = 0;
                let mut total_bytes: u64 = 0;
                let mut total_free_bytes: u64 = 0;

                if winapi::um::fileapi::GetDiskFreeSpaceExW(
                    wide_path.as_ptr(),
                    &mut free_bytes_available as *mut u64 as *mut _,
                    &mut total_bytes as *mut u64 as *mut _,
                    &mut total_free_bytes as *mut u64 as *mut _,
                ) != 0
                {
                    (total_bytes, free_bytes_available)
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            };

            drives.push(DriveInfo {
                name: format!("{} ({}:)", display_name, letter as char),
                path: drive_path,
                drive_type,
                total_space,
                free_space,
                remote_path,
                drive_status,
                status_detail,
            });
        }
    }

    Ok(drives)
}

#[cfg(test)]
mod tests {
    use super::network_remote_display_name;

    #[test]
    fn network_remote_display_name_formats_unc_share() {
        assert_eq!(
            network_remote_display_name(r"\\nas\media"),
            Some("media on nas".to_string())
        );
    }

    #[test]
    fn network_remote_display_name_preserves_unusual_paths() {
        assert_eq!(
            network_remote_display_name("Network Root"),
            Some("Network Root".to_string())
        );
    }
}
