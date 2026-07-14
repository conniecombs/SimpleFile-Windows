use crate::models::DriveInfo;

/// Get total and free space for a path on Unix systems using statvfs
#[cfg(unix)]
fn get_unix_disk_space(path: &str) -> (u64, u64) {
    use std::ffi::CString;
    let c_path = match CString::new(path) {
        Ok(p) => p,
        Err(_) => return (0, 0),
    };
    unsafe {
        let mut stat: libc::statvfs = std::mem::zeroed();
        if libc::statvfs(c_path.as_ptr(), &raw mut stat) == 0 {
            let total = stat.f_blocks as u64 * stat.f_frsize as u64;
            let free = stat.f_bavail as u64 * stat.f_frsize as u64;
            (total, free)
        } else {
            (0, 0)
        }
    }
}

#[tauri::command]
pub async fn list_drives() -> Result<Vec<DriveInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_drives_blocking)
        .await
        .map_err(|e| format!("Drive enumeration task failed: {e}"))?
}

#[cfg(target_os = "windows")]
fn string_from_wide_buffer(buffer: &[u16]) -> Option<String> {
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let value = String::from_utf16_lossy(&buffer[..len]).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(target_os = "windows")]
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

#[cfg(target_os = "windows")]
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

#[cfg(target_os = "windows")]
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

#[cfg(target_os = "windows")]
fn windows_drive_display_name(
    drive_type: u32,
    wide_path: &[u16],
    drive_path: &str,
    fallback_name: &str,
) -> String {
    match drive_type {
        3 => windows_volume_label(wide_path),
        4 => windows_volume_label(wide_path).or_else(|| {
            mapped_network_remote_path(drive_path)
                .and_then(|remote_path| network_remote_display_name(&remote_path))
        }),
        _ => None,
    }
    .unwrap_or_else(|| fallback_name.to_string())
}

fn list_drives_blocking() -> Result<Vec<DriveInfo>, String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
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
                let display_name =
                    windows_drive_display_name(dt, &wide_path, &drive_path, fallback_name);

                let (total_space, free_space) = if dt == 3 {
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
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::fs;
        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let path: std::path::PathBuf = entry.path();
                if let Some(name) = path.file_name() {
                    let path_str = path.to_string_lossy().to_string();
                    let (total_space, free_space) = get_unix_disk_space(&path_str);
                    drives.push(DriveInfo {
                        name: name.to_string_lossy().to_string(),
                        path: path_str,
                        drive_type: "Volume".to_string(),
                        total_space,
                        free_space,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Only add root-level mounts directly; /mnt and /media are scanner
        // directories whose *subdirectories* are the actual mount points.
        let mount_points = vec!["/", "/home"];
        for mount in mount_points {
            let path = std::path::Path::new(mount);
            if path.exists() {
                let (total_space, free_space) = get_unix_disk_space(mount);
                drives.push(DriveInfo {
                    name: mount.to_string(),
                    path: mount.to_string(),
                    drive_type: "Mount".to_string(),
                    total_space,
                    free_space,
                });
            }
        }
        // Scan /mnt, /media, and /run/media/$USER for mounted drives
        let mut scan_dirs: Vec<String> = vec!["/mnt".to_string(), "/media".to_string()];
        // Add /run/media/$USER if it exists (modern udisks2 mount point)
        if let Ok(home) = std::env::var("HOME") {
            if let Some(user) = std::path::Path::new(&home).file_name() {
                let run_media = format!("/run/media/{}", user.to_string_lossy());
                if std::path::Path::new(&run_media).exists() {
                    scan_dirs.push(run_media);
                }
            }
        }
        for base in &scan_dirs {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let path: std::path::PathBuf = entry.path();
                    if path.is_dir() {
                        if let Some(name) = path.file_name() {
                            let path_str = path.to_string_lossy().to_string();
                            let (total_space, free_space) = get_unix_disk_space(&path_str);
                            drives.push(DriveInfo {
                                name: name.to_string_lossy().to_string(),
                                path: path_str,
                                drive_type: "Mount".to_string(),
                                total_space,
                                free_space,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(drives)
}

#[cfg(all(test, target_os = "windows"))]
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
