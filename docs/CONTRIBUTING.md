# Contributing

This branch targets the Windows SimpleFile release. Keep changes aligned with local filesystem workflows, Windows drives, mapped network drives, archive tools, search, previews, metadata, Git status, cleanup tools, updater metadata, and Windows installers.

## Development Setup

```powershell
npm ci --prefix frontend
npm run check
npm run check:rust
```

Use Node.js 24 or newer, stable Rust, and the Windows SDK Resource Compiler
(`rc.exe`) on `PATH`. Tauri resource builds and `cargo test --all-features`
need `rc.exe` when compiling the Windows desktop target.

## Project Layout

- `frontend/src/main.ts` starts the Svelte app.
- `frontend/src/lib/components/` contains Svelte components.
- `frontend/src/lib/app/` contains workflow orchestration.
- `frontend/src/lib/api.ts` defines typed frontend API wrappers.
- `frontend/src/lib/tauri.ts` owns the typed Tauri invoke wrapper and browser-dev fallback.
- `frontend/src/vanilla-js/runtime/` contains typed runtime helpers still shared by the Svelte app.
- `src-tauri/src/` contains Rust command modules.
- `scripts/` and `frontend/scripts/` contain release and migration checks.

## Backend Boundaries

Keep Tauri commands explicit in `src-tauri/src/lib.rs` and mirrored in `frontend/src/lib/types.ts`. After changing a command, run:

```powershell
node scripts/check-tauri-invokes.mjs
```

Windows drive behavior belongs in `src-tauri/src/drives.rs`. Preserve mapped network share naming through the Windows APIs already in that module.

## Frontend Boundaries

Prefer typed helpers from `frontend/src/lib/api.ts` over direct Tauri invokes. Keep folder navigation in-app by preserving directory intent through file-list, breadcrumb, tree, and Quick Access events.

## Checks

Before opening a PR:

```powershell
npm run check
npm run check:rust
npm run check:security
```

For release or installer changes:

```powershell
npm run check:release
npm run build:tauri:local
npm run smoke:settings
npm run smoke:release
npm run smoke:msi
npm run smoke:installer
```

## Pull Request Notes

- Keep unrelated refactors out of focused fixes.
- Preserve the root `README.md`.
- Update docs when user-visible behavior changes.
- Do not commit local signing keys, private settings, or generated installer outputs.
