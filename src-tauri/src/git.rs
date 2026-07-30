use crate::models::GitStatus;
use crate::utils::validate_existing_path;
use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub fn get_git_status(path: String) -> Result<GitStatus, String> {
    let path_buf = validate_existing_path(&path)?;

    let mut check_cmd = Command::new("git");
    check_cmd.args(["-C", &path_buf.to_string_lossy(), "rev-parse", "--git-dir"]);

    // FIX: Prevent command prompt window from flashing on Windows
    #[cfg(target_os = "windows")]
    check_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let git_check = check_cmd.output();
    let is_repo = match git_check {
        Ok(output) => output.status.success(),
        Err(_) => false,
    };
    if !is_repo {
        return Ok(GitStatus {
            is_repo: false,
            branch: None,
            modified: 0,
            staged: 0,
            untracked: 0,
            ahead: 0,
            behind: 0,
        });
    }

    let mut branch_cmd = Command::new("git");
    branch_cmd.args([
        "-C",
        &path_buf.to_string_lossy(),
        "branch",
        "--show-current",
    ]);

    #[cfg(target_os = "windows")]
    branch_cmd.creation_flags(0x08000000);

    let branch_output = branch_cmd.output();
    let branch = branch_output.ok().and_then(|o| {
        if o.status.success() {
            String::from_utf8(o.stdout)
                .ok()
                .map(|s| s.trim().to_string())
        } else {
            None
        }
    });

    let mut status_cmd = Command::new("git");
    status_cmd.args(["-C", &path_buf.to_string_lossy(), "status", "--porcelain"]);

    #[cfg(target_os = "windows")]
    status_cmd.creation_flags(0x08000000);

    let status_output = status_cmd.output();
    let (mut modified, mut staged, mut untracked) = (0u32, 0u32, 0u32);
    if let Ok(output) = status_output {
        if output.status.success() {
            let status_str = String::from_utf8_lossy(&output.stdout);
            for line in status_str.lines() {
                if line.len() >= 2 {
                    let index_status = line.chars().next().unwrap_or(' ');
                    let worktree_status = line.chars().nth(1).unwrap_or(' ');
                    if index_status != ' ' && index_status != '?' {
                        staged += 1;
                    }
                    if worktree_status != ' ' && worktree_status != '?' {
                        modified += 1;
                    }
                    if index_status == '?' && worktree_status == '?' {
                        untracked += 1;
                    }
                }
            }
        }
    }

    let (mut ahead, mut behind) = (0u32, 0u32);
    let mut rev_list_cmd = Command::new("git");
    rev_list_cmd.args([
        "-C",
        &path_buf.to_string_lossy(),
        "rev-list",
        "--left-right",
        "--count",
        "HEAD...@{upstream}",
    ]);

    #[cfg(target_os = "windows")]
    rev_list_cmd.creation_flags(0x08000000);

    let rev_list_output = rev_list_cmd.output();
    if let Ok(output) = rev_list_output {
        if output.status.success() {
            let counts_str = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = counts_str.split_whitespace().collect();
            if parts.len() == 2 {
                ahead = parts[0].parse().unwrap_or(0);
                behind = parts[1].parse().unwrap_or(0);
            }
        }
    }

    Ok(GitStatus {
        is_repo: true,
        branch,
        modified,
        staged,
        untracked,
        ahead,
        behind,
    })
}

use std::collections::HashMap;

#[tauri::command]
pub fn get_git_file_statuses(path: String) -> Result<HashMap<String, String>, String> {
    let path_buf = validate_existing_path(&path)?;

    let mut status_cmd = Command::new("git");
    status_cmd.args(["-C", &path_buf.to_string_lossy(), "status", "--porcelain"]);

    #[cfg(target_os = "windows")]
    status_cmd.creation_flags(0x08000000);

    let status_output = status_cmd.output();
    let mut statuses = HashMap::new();

    if let Ok(output) = status_output {
        if output.status.success() {
            let status_str = String::from_utf8_lossy(&output.stdout);
            for line in status_str.lines() {
                if line.len() >= 3 {
                    // `XY filename`
                    let xy = &line[0..2];
                    let filename = line[3..].trim().to_string();

                    // Strip any quotes that git porcelain might add for special characters
                    let filename = filename.trim_matches('"').to_string();

                    let status = if xy.contains('?') {
                        "untracked"
                    } else if xy.starts_with('A') || xy.ends_with('A') {
                        "added"
                    } else if xy.starts_with('D') || xy.ends_with('D') {
                        "deleted"
                    } else if xy.starts_with('M') || xy.ends_with('M') {
                        "modified"
                    } else if xy.starts_with('R') || xy.ends_with('R') {
                        "renamed"
                    } else {
                        "modified" // default fallback
                    };

                    statuses.insert(filename, status.to_string());
                }
            }
        }
    }

    Ok(statuses)
}

fn get_git_credentials(db: tauri::State<'_, crate::db::DbState>) -> Option<String> {
    crate::db::get_db_setting(db, "github_token".to_string())
        .ok()
        .flatten()
        .filter(|t| !t.is_empty())
}

fn git_remote_args(path: &Path, subcommand: &str, token: Option<&str>) -> Vec<OsString> {
    use base64::{engine::general_purpose, Engine as _};

    let mut args = vec![OsString::from("-C"), path.as_os_str().to_os_string()];

    if let Some(token) = token {
        let auth = general_purpose::STANDARD.encode(format!("token:{token}"));
        args.push(OsString::from("-c"));
        args.push(OsString::from(format!(
            "http.extraHeader=AUTHORIZATION: basic {auth}"
        )));
    }

    args.push(OsString::from(subcommand));
    args
}

fn run_git_remote_command(
    path: &str,
    subcommand: &str,
    token: Option<&str>,
) -> Result<String, String> {
    let path_buf = validate_existing_path(path)?;
    let mut cmd = Command::new("git");
    cmd.args(git_remote_args(&path_buf, subcommand, token));

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(stderr)
    }
}

#[tauri::command]
pub async fn git_pull(
    path: String,
    db: tauri::State<'_, crate::db::DbState>,
) -> Result<String, String> {
    let token = get_git_credentials(db);
    run_git_remote_command(&path, "pull", token.as_deref())
}

#[tauri::command]
pub async fn git_push(
    path: String,
    db: tauri::State<'_, crate::db::DbState>,
) -> Result<String, String> {
    let token = get_git_credentials(db);
    run_git_remote_command(&path, "push", token.as_deref())
}

#[cfg(test)]
mod tests {
    use super::git_remote_args;
    use std::path::Path;

    fn to_strings(args: Vec<std::ffi::OsString>) -> Vec<String> {
        args.into_iter()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn git_remote_args_put_auth_header_before_subcommand() {
        let args = to_strings(git_remote_args(
            Path::new("repo"),
            "pull",
            Some("ghp_example"),
        ));

        assert_eq!(args[0], "-C");
        assert_eq!(args[1], "repo");
        assert_eq!(args[2], "-c");
        assert!(args[3].starts_with("http.extraHeader=AUTHORIZATION: basic "));
        assert_eq!(args[4], "pull");
        assert!(
            args.iter().position(|arg| arg == "-c").unwrap()
                < args.iter().position(|arg| arg == "pull").unwrap()
        );
    }

    #[test]
    fn git_remote_args_without_token_do_not_add_auth_config() {
        let args = to_strings(git_remote_args(Path::new("repo"), "push", None));

        assert_eq!(args, vec!["-C", "repo", "push"]);
    }
}
