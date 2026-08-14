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

        let state = SessionState {
            expected_token: args.auth_token,
            ..SessionState::default()
        };
        let (reader, writer) = tokio::io::split(server);
        serve_connection(reader, writer, state).await?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let _ = pipe;
        Err("simplefile-service requires Windows named pipes".to_string())
    }
}

struct Args {
    pipe_name: String,
    auth_token: Option<String>,
}

impl Args {
    fn parse(args: impl IntoIterator<Item = String>) -> Result<Self, String> {
        let mut pipe_name = format!("SimpleFile.dev.{}", std::process::id());
        let mut auth_token = None;
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
                    let _ = items.next();
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
        })
    }
}
