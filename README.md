# SimpleFile

[![CI](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/ci.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/ci.yml)
[![Release](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/release.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/release.yml)
[![Installer smoke](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/installer-smoke.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/installer-smoke.yml)
![Version](https://img.shields.io/badge/version-1.1.0-2563eb)
![License](https://img.shields.io/badge/license-proprietary-444444)

SimpleFile is a Windows-first desktop file manager built with Tauri 2, Rust,
Svelte 5, and Vite. It is designed for fast local browsing with the power
workflows people usually bolt onto File Explorer later: dual panes, tabbed
navigation, archive tools, search, previews, metadata, checksums, Git status,
cleanup utilities, and signed Windows installer/update plumbing.

The supported product surface for this repository is intentionally local:
Windows drives, removable media, mapped network drives, normal folders, and
local archives. App-managed online storage integrations and provider-owned mount
workflows are outside this branch.

## Screenshots

| Advanced Rename | File Comparison |
| --- | --- |
| ![Advanced rename preview with operation controls](docs/assets/screenshots/simplefile-advanced-rename.png) | ![Side-by-side text file comparison showing changed and added lines](docs/assets/screenshots/simplefile-file-compare.png) |

| Configurable Columns |
| --- |
| ![Configurable file list columns](docs/assets/screenshots/simplefile-configurable-columns.png) |

## What It Does

| Area | Highlights |
| --- | --- |
| Navigation | Tabs, dual-pane mode, breadcrumbs, tree view, Quick Access, bookmarks, recent locations, path bar editing, type-ahead selection, and in-app folder opening. |
| Windows drives | Native drive list with volume labels, drive types, free-space status, mapped network share names, offline/stale status, refresh, and reconnect flow. |
| File operations | Create, rename, delete to Recycle Bin, permanent delete, copy, move, paste, drag and drop, copy path, undo/redo, operation history, progress, cancellation, and conflict choices. |
| Search | Quick filtering, recursive search, content search, size/date/depth filters, cancellable result batches, and saved smart folders. |
| Archives | List, create, and extract ZIP, TAR, TAR.GZ/TGZ, and RAR archives, with extraction path checks and optional RAR tooling from Settings. |
| Inspection | Preview pane, Quick Look, thumbnails, text/code/Markdown/PDF/image/audio/video preview, folder sizes, item counts, image EXIF, PDF/audio/video/Office metadata, and MD5/SHA-1/SHA-256 checksums. |
| Organization | Color labels, configurable columns, list/grid view, dark/light themes, saved workspace layout, custom startup location, and remappable keyboard shortcuts. |
| Developer tools | Git branch/status counts, per-file Git status, Git pull/push actions, terminal launch, elevated PowerShell launch, and safe Open With handling. |
| Release support | NSIS and MSI Windows bundles, signed updater metadata in release builds, local unsigned package validation, and installer smoke checks. |

## Install

Published Windows builds are attached to
[GitHub Releases](https://github.com/conniecombs/SimpleFile-Windows/releases).
For normal installation, use the NSIS setup executable:

```text
SimpleFile_1.1.0_x64-setup.exe
```

An MSI package is also produced for environments that prefer MSI deployment:

```text
SimpleFile_1.1.0_x64_en-US.msi
```

The first updater-enabled release must be installed manually. After that,
published updates can be checked and installed from `Settings -> Updates`.

## Requirements

- Windows 10 or later.
- Node.js 24 or newer.
- Stable Rust.
- Tauri prerequisites for Windows desktop builds.
- Windows SDK Resource Compiler, `rc.exe`, on `PATH` for Rust tests and Tauri
  resource stamping.
- WiX Toolset when validating MSI packages locally.

## Quick Start

Install frontend dependencies:

```powershell
npm ci --prefix frontend
```

Run the desktop app in development:

```powershell
npm run dev
```

Run the standard repository checks:

```powershell
npm run check
```

Run the full release-quality gate:

```powershell
npm run check:release
```

Build unsigned local Windows installers:

```powershell
npm run build:tauri:local
```

## Verification

| Command | Purpose |
| --- | --- |
| `npm run check` | Frontend migration checks, API parity, behavior guards, Svelte checks, smoke settings UI, and frontend build. |
| `npm run check:rust` | Rust formatting, locked tests, and Clippy with warnings denied. |
| `npm run check:security` | Rust dependency audit through the release audit wrapper. |
| `npm run check:release` | Combined frontend, repository guard, Rust, and security gate. |
| `npm run build:tauri:local` | Local NSIS/MSI build using `src-tauri/tauri.local.conf.json`. |
| `npm run smoke:settings` | Startup/settings persistence smoke test. |
| `npm run smoke:release` | Built executable startup smoke test. |
| `npm run smoke:msi` | MSI artifact extract and launch smoke test. |
| `npm run smoke:installer` | NSIS install, launch, and uninstall smoke test. |

`npm run check` also protects several important project boundaries:

- Current-facing provider and mount-management surfaces stay out of this branch.
- Renderer access to Tauri stays behind `frontend/src/lib/tauri.ts`.
- The global `__TAURI__` bridge remains disabled.
- Shared modal HTML paths must sanitize before insertion.
- Windows packaging assets and bundle targets stay Windows-only.
- Tauri command registration stays aligned with frontend typed wrappers.

Full installer smoke is intentionally separate from every pull request because
packaging is slow. Run the `Installer smoke` GitHub Actions workflow manually,
or rely on its nightly schedule, before cutting a release.

## Project Layout

```text
.
|-- frontend/
|   |-- src/main.ts                 Svelte app entry
|   |-- src/lib/api.ts              typed frontend API wrapper
|   |-- src/lib/tauri.ts            typed Tauri boundary and browser-dev fallback
|   |-- src/lib/app/                workflow orchestration
|   |-- src/lib/components/         Svelte UI components
|   |-- src/vanilla-js/runtime/     shared runtime helpers
|   `-- scripts/                    frontend and migration guards
|-- src-tauri/
|   |-- src/                        Rust commands and desktop backend
|   |-- tauri.conf.json             production Tauri config
|   `-- tauri.local.conf.json       local package-build config
|-- scripts/                        repository, release, and smoke checks
|-- docs/                           support docs, changelog, roadmap, security
`-- .github/workflows/              CI, release, and installer smoke automation
```

Current frontend layout:

- `frontend/src/main.ts` is the shipping Svelte bootstrap.
- `frontend/src/lib/components/` contains Svelte UI components.
- `frontend/src/lib/app/` owns workflow orchestration.
- `frontend/src/vanilla-js/runtime/` contains typed runtime helpers that are
  still shared by the Svelte app.

Key backend modules:

- `src-tauri/src/fs_ops.rs` handles filesystem operations.
- `src-tauri/src/progress.rs` handles cancellable copy/move progress.
- `src-tauri/src/drives.rs` handles Windows drive and mapped-share metadata.
- `src-tauri/src/archive.rs` handles archive listing, creation, and extraction.
- `src-tauri/src/search.rs` and `src-tauri/src/smart_folders.rs` handle search.
- `src-tauri/src/preview.rs` and `src-tauri/src/metadata.rs` handle previews and
  properties.
- `src-tauri/src/git.rs` handles repository status and pull/push commands.
- `src-tauri/src/updater.rs` handles app version and updater commands.

## Release Packaging

`src-tauri/tauri.conf.json` is the production package configuration. It builds
Windows-only bundles:

- NSIS setup executable.
- MSI installer.
- Updater artifacts and `latest.json`.

`src-tauri/tauri.local.conf.json` is for local package validation. It keeps the
same Windows bundle targets while disabling signing requirements that only exist
in the GitHub release workflow.

The release workflow validates that the tag version matches both
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, runs the release-quality
checks, builds Windows x64 installers, uploads updater signatures, and can leave
the release as a draft until it is reviewed.

## Documentation

- [Changelog](docs/CHANGELOG.md)
- [SimpleFile 1.1.0 release notes](docs/RELEASE_1.1.0.md)
- [Roadmap](docs/ROADMAP.md)
- [Support guide](docs/SUPPORT.md)
- [Security policy](docs/SECURITY.md)
- [Contributing guide](docs/CONTRIBUTING.md)
- [Updater release guide](docs/UPDATER_RELEASE.md)

Historical release notes may describe retired experiments. Treat this README,
the roadmap, and the support/security docs as the current branch contract.

## Security Notes

Do not commit signing keys, updater private keys, `.env` files, local secrets,
personal settings exports, or logs containing private paths. See
[docs/SECURITY.md](docs/SECURITY.md) for the reporting policy and release
security checklist.

## License

SimpleFile is proprietary software. All rights are reserved by conniecombs. See
[LICENSE](LICENSE) for the project license; third-party dependencies remain
under their own licenses.
