# Code Analysis

SimpleFile is split across a Svelte frontend and a Rust/Tauri backend.

## Frontend

- `frontend/src/main.ts` mounts the app.
- `frontend/src/App.svelte` owns the shell bridge and legacy overlay injection.
- `frontend/src/lib/app/` coordinates workflows.
- `frontend/src/lib/components/` contains Svelte UI components.
- `frontend/src/lib/api.ts` and `frontend/src/lib/tauri.ts` centralize Tauri commands.

## Backend

- `src-tauri/src/lib.rs` registers all Tauri commands.
- `src-tauri/src/fs_ops.rs` handles local filesystem operations.
- `src-tauri/src/drives.rs` handles Windows drive enumeration and mapped network share names.
- `src-tauri/src/progress.rs` handles progress-aware transfers.
- `src-tauri/src/archive.rs` handles archive virtual paths.
- `src-tauri/src/preview.rs` handles previews, thumbnails, external opens, and reveal-in-folder.
- `src-tauri/src/updater.rs` exposes updater checks and installation.

## Important Contracts

- Every backend command must appear in `frontend/src/lib/types.ts`.
- Every literal frontend invoke must have a backend handler.
- Folder navigation must keep directory intent until it reaches `openEntryPath`.
- Mapped network drives are normal Windows filesystem entries and must remain visible in drive listing.
