# Startup fix notes

This file records historical startup fixes and the current Windows updater
status.

Startup changes made:

1. `src-tauri/tauri.conf.json` now starts the main window with `visible: true`.
2. `frontend/src/main.ts` mounts the Svelte shell from `frontend/src/App.svelte`
   as the shipping frontend entry point.
3. Frontend startup and settings recovery live in `frontend/src/lib/app/setup.ts`
   and `frontend/src/vanilla-js/runtime/startup-location.ts`.
4. The configured CSP allows the Svelte/Vite bundle while keeping object,
   frame, form, worker, and remote script surfaces closed.
5. The updater plugin now has production configuration in
   `src-tauri/tauri.conf.json`: updater artifacts are enabled, a public key is
   present, and the endpoint points at the Windows release channel on GitHub.
6. `src-tauri/src/main.rs` writes Rust panics to
   `%LOCALAPPDATA%\SimpleFile\startup.log` on Windows.

Production updater releases still require the
`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub
secrets described in `.github/RELEASE.md`. Local `build:tauri:local` builds use
`src-tauri/tauri.local.conf.json` to disable updater artifact generation without
changing the production release configuration.
