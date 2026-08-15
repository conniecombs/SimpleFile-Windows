//! Host-independent SimpleFile backend types and utilities.
//!
//! This crate is the first extract from `src-tauri`. Tauri-specific commands,
//! `AppHandle`, and plugin glue stay in the Tauri package until later PRs.

pub mod archive;
pub mod checksum;
pub mod compare;
pub mod dir_list;
pub mod drives;
pub mod file_ops;
pub mod metadata;
pub mod models;
pub mod native_accel;
pub mod open_with;
pub mod preview;
pub mod state;
pub mod utils;
