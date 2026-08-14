//! Named-pipe JSON-RPC service used by the WinUI host.
//!
//! The Tauri/Svelte app is unchanged and does not speak this protocol.

pub mod dispatch;
pub mod session;

pub use dispatch::SessionState;
pub use session::serve_connection;

pub fn pipe_path(name: &str) -> String {
    if name.starts_with(r"\\.\pipe\") {
        name.to_string()
    } else {
        format!(r"\\.\pipe\{name}")
    }
}
