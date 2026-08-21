use simplefile_service::{pipe_path, serve_connection, SessionState};

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("simplefile-service: {error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args = Args::parse(std::env::args().skip(1))?;
    let pipe = pipe_path(&args.pipe_name);
    eprintln!(
        "simplefile-service {} listening on {pipe}",
        env!("CARGO_PKG_VERSION")
    );

    let auth_token = if args.auth_token.is_some() {
        args.auth_token
    } else {
        // Read the auth token from stdin (written by the parent process).
        let mut token = String::new();
        std::io::stdin().read_line(&mut token).ok();
        let token = token.trim().to_string();
        if token.is_empty() { None } else { Some(token) }
    };

    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ServerOptions;

        let server = ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&pipe)
            .map_err(|error| format!("failed to create named pipe {pipe}: {error}"))?;

        server
            .connect()
            .await
            .map_err(|error| format!("waiting for client failed: {error}"))?;

        // If parent-pid was specified, spawn a liveness monitor that exits
        // when the parent process is no longer alive.
        if let Some(parent_pid) = args.parent_pid {
            tokio::spawn(monitor_parent_liveness(parent_pid));
        }

        let state = SessionState {
            expected_token: auth_token,
            ..SessionState::default()
        };
        let (reader, writer) = tokio::io::split(server);
        serve_connection(reader, writer, state).await?;
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = pipe;
        Err("simplefile-service requires Windows named pipes".to_string())
    }
}

#[cfg(windows)]
async fn monitor_parent_liveness(parent_pid: u32) {
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE};
    use windows_sys::Win32::Foundation::CloseHandle;

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let alive = unsafe {
            let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, parent_pid);
            if handle.is_null() || handle == 0 as _ {
                false
            } else {
                CloseHandle(handle);
                true
            }
        };

        if !alive {
            eprintln!("Parent process {parent_pid} is no longer alive, exiting.");
            std::process::exit(0);
        }
    }
}

struct Args {
    pipe_name: String,
    auth_token: Option<String>,
    parent_pid: Option<u32>,
}

impl Args {
    fn parse(args: impl IntoIterator<Item = String>) -> Result<Self, String> {
        let mut pipe_name = format!("SimpleFile.dev.{}", std::process::id());
        let mut auth_token = None;
        let mut parent_pid = None;
        let mut items = args.into_iter();
        while let Some(arg) = items.next() {
            match arg.as_str() {
                "--pipe-name" => {
                    pipe_name = items
                        .next()
                        .ok_or_else(|| "missing value for --pipe-name".to_string())?;
                }
                "--auth-token" => {
                    auth_token = Some(
                        items
                            .next()
                            .ok_or_else(|| "missing value for --auth-token".to_string())?,
                    );
                }
                "--parent-pid" => {
                    let value = items
                        .next()
                        .ok_or_else(|| "missing value for --parent-pid".to_string())?;
                    parent_pid = Some(
                        value
                            .parse::<u32>()
                            .map_err(|e| format!("invalid --parent-pid value: {e}"))?,
                    );
                }
                "--help" | "-h" => {
                    eprintln!(
                        "Usage: simplefile-service [--pipe-name NAME] [--auth-token TOKEN] [--parent-pid PID]"
                    );
                    std::process::exit(0);
                }
                other => return Err(format!("unknown argument: {other}")),
            }
        }
        Ok(Self {
            pipe_name,
            auth_token,
            parent_pid,
        })
    }
}
