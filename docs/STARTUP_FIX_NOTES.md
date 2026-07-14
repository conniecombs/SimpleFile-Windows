# Startup fix notes

This file records historical startup fixes and the current updater status.

Startup changes made:

1. `src-tauri/tauri.conf.json` now starts the main window with `visible: true`.
2. `frontend/js/app.js` calls `show_main_window` early, before slower filesystem initialization.
3. `frontend/js/startup-guard.js` catches frontend startup errors and renders them in the app window.
4. The inline theme script was moved to `frontend/js/theme-preload.js` to better match the configured CSP.
5. The updater plugin has an explicit placeholder config (`pubkey: ""`, `endpoints: []`) so the app can start before the production updater channel is configured.
6. `src-tauri/src/main.rs` now writes Rust panics to `%LOCALAPPDATA%\SimpleFile\startup.log` on Windows (or the closest app-data/home path on other platforms).

Production updater rollout still requires a real updater public key, endpoint configuration, and
the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secrets described in
`.github/RELEASE.md`. `createUpdaterArtifacts` remains disabled until those settings are ready.
