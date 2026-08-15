//! Host-independent SimpleFile backend types and utilities.
//!
//! Domain still waiting to move out of leftover `src-tauri/src` modules
//! (tags, smart folders, git, cleanup, terminal, rar, db) stays there until
//! a later extract. The shipping host is WinUI 3 + `simplefile-service`.

pub mod archive;
pub mod checksum;
pub mod cleanup;
pub mod compare;
pub mod dir_list;
pub mod drives;
pub mod file_ops;
pub mod metadata;
pub mod models;
pub mod native_accel;
pub mod open_with;
pub mod preview;
pub mod settings_store;
pub mod state;
pub mod utils;
