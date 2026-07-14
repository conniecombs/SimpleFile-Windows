// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    install_panic_logger();
    simplefile::run()
}

fn install_panic_logger() {
    let default_hook = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |info| {
        write_panic_log(info);
        default_hook(info);
    }));
}

fn write_panic_log(info: &std::panic::PanicHookInfo<'_>) {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    let mut dir = startup_log_dir();
    dir.push("SimpleFile");

    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let log_path = dir.join("startup.log");
    let mut file = match OpenOptions::new().create(true).append(true).open(log_path) {
        Ok(file) => file,
        Err(_) => return,
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    let _ = writeln!(file, "[{timestamp}] SimpleFile panic");
    if let Some(location) = info.location() {
        let _ = writeln!(
            file,
            "location: {}:{}:{}",
            location.file(),
            location.line(),
            location.column()
        );
    }

    if let Some(message) = info.payload().downcast_ref::<&str>() {
        let _ = writeln!(file, "message: {message}");
    } else if let Some(message) = info.payload().downcast_ref::<String>() {
        let _ = writeln!(file, "message: {message}");
    }

    let _ = writeln!(file);

    fn startup_log_dir() -> PathBuf {
        if let Some(path) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(path);
        }

        if let Some(path) = std::env::var_os("XDG_DATA_HOME") {
            return PathBuf::from(path);
        }

        if let Some(path) = std::env::var_os("HOME") {
            let mut home = PathBuf::from(path);
            home.push(".local");
            home.push("share");
            return home;
        }

        std::env::temp_dir()
    }
}
