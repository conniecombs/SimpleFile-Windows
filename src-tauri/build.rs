use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

fn main() {
    println!("cargo:rerun-if-env-changed=SIMPLEFILE_GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-changed=google-oauth-client-id.txt");
    println!("cargo:rerun-if-changed=../frontend/package.json");
    println!("cargo:rerun-if-changed=../frontend/package-lock.json");
    println!("cargo:rerun-if-changed=../frontend/index.html");
    println!("cargo:rerun-if-changed=../frontend/src");
    println!("cargo:rerun-if-changed=../frontend/svelte.config.js");
    println!("cargo:rerun-if-changed=../frontend/vite.config.ts");

    if std::env::var("SIMPLEFILE_GOOGLE_CLIENT_ID")
        .ok()
        .is_none_or(|value| value.trim().is_empty())
    {
        if let Ok(value) = std::fs::read_to_string("google-oauth-client-id.txt") {
            let value = value.trim();
            if !value.is_empty() {
                println!("cargo:rustc-env=SIMPLEFILE_GOOGLE_CLIENT_ID={value}");
            }
        }
    }

    ensure_frontend_dist();
    tauri_build::build();
}

fn ensure_frontend_dist() {
    let manifest_dir = PathBuf::from(
        std::env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by Cargo"),
    );
    let frontend_dir = manifest_dir
        .parent()
        .expect("src-tauri has a repository root parent")
        .join("frontend");
    let dist_index = frontend_dir.join("dist").join("index.html");

    if !frontend_build_required(&frontend_dir, &dist_index) {
        return;
    }

    if !frontend_dir.join("node_modules").exists() {
        run_npm(&frontend_dir, &["ci"]);
    }

    run_npm(&frontend_dir, &["run", "build"]);
}

fn frontend_build_required(frontend_dir: &Path, dist_index: &Path) -> bool {
    let Ok(dist_modified) = modified_time(dist_index) else {
        return true;
    };

    [
        frontend_dir.join("package.json"),
        frontend_dir.join("package-lock.json"),
        frontend_dir.join("index.html"),
        frontend_dir.join("src"),
        frontend_dir.join("svelte.config.js"),
        frontend_dir.join("vite.config.ts"),
    ]
    .iter()
    .filter_map(|path| newest_modified_time(path).ok().flatten())
    .any(|modified| modified > dist_modified)
}

fn newest_modified_time(path: &Path) -> std::io::Result<Option<SystemTime>> {
    if path.is_dir() {
        let mut newest = modified_time(path).ok();
        for entry in std::fs::read_dir(path)? {
            if let Some(modified) = newest_modified_time(&entry?.path())? {
                newest = Some(newest.map_or(modified, |current| current.max(modified)));
            }
        }
        Ok(newest)
    } else if path.exists() {
        modified_time(path).map(Some)
    } else {
        Ok(None)
    }
}

fn modified_time(path: &Path) -> std::io::Result<SystemTime> {
    std::fs::metadata(path)?.modified()
}

fn run_npm(frontend_dir: &Path, args: &[&str]) {
    let npm = if cfg!(windows) { "npm.cmd" } else { "npm" };
    let status = Command::new(npm)
        .current_dir(frontend_dir)
        .args(args)
        .status()
        .unwrap_or_else(|err| {
            panic!(
                "failed to run `{npm} {}` in {}: {err}",
                args.join(" "),
                frontend_dir.display()
            )
        });

    assert!(
        status.success(),
        "`{npm} {}` failed in {} with status {status}",
        args.join(" "),
        frontend_dir.display()
    )
}
