use crate::utils::validate_existing_path_no_resolve;
#[cfg(target_os = "windows")]
use std::path::Path;
use std::process::Command;

fn validate_terminal_directory(path: &str) -> Result<std::path::PathBuf, String> {
    let path = validate_existing_path_no_resolve(path)?;
    if !path.is_dir() {
        return Err("Terminal can only be opened for directories".to_string());
    }
    Ok(path)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn spawn_detached(command: &mut Command) -> Result<(), String> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open terminal: {}", e))
}

#[tauri::command]
pub async fn open_terminal(path: String) -> Result<(), String> {
    let validated_path = validate_terminal_directory(&path)?;

    #[cfg(target_os = "linux")]
    {
        let path_arg = validated_path.to_string_lossy().to_string();
        let terminals: Vec<(&str, Vec<&str>)> = vec![
            ("gnome-terminal", vec!["--working-directory", &path_arg]),
            ("konsole", vec!["--workdir", &path_arg]),
            ("xfce4-terminal", vec!["--working-directory", &path_arg]),
            (
                "xterm",
                vec![
                    "-e",
                    "sh",
                    "-lc",
                    "cd -- \"$1\" && exec \"${SHELL:-sh}\"",
                    "sh",
                    &path_arg,
                ],
            ),
            (
                "x-terminal-emulator",
                vec!["--working-directory", &path_arg],
            ),
        ];

        for (program, args) in terminals {
            let mut command = Command::new(program);
            command.args(args);
            if command.spawn().is_ok() {
                return Ok(());
            }
        }
        Err("Failed to open terminal: no supported terminal emulator was found".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.args(["-a", "Terminal"]).arg(&validated_path);
        spawn_detached(&mut command)
    }

    #[cfg(target_os = "windows")]
    {
        let escaped_path = validated_path.to_string_lossy().replace('\'', "''");
        let mut command = Command::new("powershell");
        command
            .arg("-NoExit")
            .arg("-Command")
            .arg(format!("Set-Location -LiteralPath '{}'", escaped_path));
        spawn_detached(&mut command)
    }
}

#[cfg(target_os = "windows")]
fn powershell_encoded_command(path: &Path) -> String {
    use base64::Engine;
    let escaped_path = path.to_string_lossy().replace('\'', "''");
    let command = format!(
        "Start-Process PowerShell -Verb RunAs -ArgumentList '-NoExit','-Command','Set-Location -LiteralPath ''{}'''",
        escaped_path
    );
    let utf16le: Vec<u8> = command
        .encode_utf16()
        .flat_map(|c| c.to_le_bytes())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(utf16le)
}

#[tauri::command]
pub async fn open_powershell_admin(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let validated_path = validate_terminal_directory(&path)?;
        let encoded = powershell_encoded_command(&validated_path);
        let mut command = Command::new("powershell");
        command
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-EncodedCommand")
            .arg(encoded);
        spawn_detached(&mut command)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("PowerShell as Administrator is only available on Windows".to_string())
    }
}
