//! Host-independent SimpleFile backend types and utilities.
//!
//! This crate is the first extract from `src-tauri`. Tauri-specific commands,
//! `AppHandle`, and plugin glue stay in the Tauri package until later PRs.

pub mod dir_list;
pub mod drives;
pub mod models;
pub mod native_accel;
pub mod state;
pub mod utils;
