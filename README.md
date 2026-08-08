# SimpleFile

[![CI](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/ci.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/ci.yml)
[![Release](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/release.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/release.yml)
[![Installer Smoke](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/installer-smoke.yml/badge.svg)](https://github.com/conniecombs/SimpleFile-Windows/actions/workflows/installer-smoke.yml)
![Version](https://img.shields.io/badge/version-1.1.0-2563eb)
![Platform](https://img.shields.io/badge/platform-Windows%2010+-0078D4?logo=windows)
![License](https://img.shields.io/badge/license-proprietary-444444)

**SimpleFile** is a modern, high-performance file manager for Windows built with [Tauri 2](https://v2.tauri.app/), [Rust](https://www.rust-lang.org/), and [Svelte 5](https://svelte.dev/). It replaces the workflows people usually bolt onto Windows File Explorer — dual panes, tabbed browsing, archive tools, advanced search, rich file previews, metadata inspection, checksums, Git integration, and more — in a single, native desktop application.

<p align="center">
  <img src="docs/assets/screenshots/simplefile-advanced-rename.png" alt="SimpleFile — Advanced Rename with operation controls" width="720" />
</p>

---

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Installation](#installation)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Verification & Testing](#verification--testing)
- [Release & Packaging](#release--packaging)
- [Documentation](#documentation)
- [Security](#security)
- [License](#license)

---

## Screenshots

| Advanced Rename | File Comparison |
| :---: | :---: |
| ![Advanced rename preview with operation controls](docs/assets/screenshots/simplefile-advanced-rename.png) | ![Side-by-side text file comparison showing changed and added lines](docs/assets/screenshots/simplefile-file-compare.png) |

| Configurable Columns |
| :---: |
| ![Configurable file list columns](docs/assets/screenshots/simplefile-configurable-columns.png) |

---

## Features

### Navigation & Browsing

- **Dual-pane mode** — two independent file browsers side by side
- **Tabbed interface** — open multiple directories in tabs within each pane
- **Breadcrumb bar** — click any segment to jump up the path hierarchy
- **Tree view sidebar** — hierarchical folder navigation
- **Path bar editing** — click-to-edit address bar with path autocomplete
- **Quick Access & bookmarks** — pin frequently used folders for instant access
- **Recent locations** — quickly return to previously visited directories
- **Back / forward history** — full navigation stack with `Alt+Left` / `Alt+Right`
- **Type-ahead selection** — start typing to jump to matching files

### File Operations

- **Copy, move, cut, paste** with real-time progress tracking and cancellation
- **Delete to Recycle Bin** or permanent delete
- **Advanced rename** — batch rename with pattern matching and live preview
- **Create** new files and folders
- **Drag and drop** between panes, tabs, and external applications
- **Undo / redo** with full operation history
- **Conflict resolution** — skip, replace, or keep both when names collide
- **Copy path** / **Copy as path** to clipboard

### Windows Drives

- Native drive list with volume labels, drive types, and free-space indicators
- Mapped network share names with offline/stale status detection
- Drive refresh and reconnect flow

### Search

- **Quick filter** — instant filename filtering in the current directory
- **Recursive search** — deep search through subdirectories
- **Content search** — full-text search inside files
- **Advanced filters** — filter by size, date, and directory depth
- **Cancellable result batches** — search stays responsive on large trees
- **Smart folders** — save search criteria as persistent virtual folders

### Archives

- List, create, and extract **ZIP**, **TAR**, **TAR.GZ / TGZ**, and **RAR** archives
- Extraction path validation and error handling
- Optional RAR tooling install from Settings

### Inspection & Preview

- **Preview pane** with support for:
  - Images (PNG, JPG, GIF, SVG, WebP, BMP, ICO, TIFF)
  - Video (MP4, WebM, AVI, MOV, MKV, FLV, WMV, OGG)
  - Audio (MP3, WAV, FLAC, OGG, AAC, WMA, M4A, AIFF)
  - Code & text with syntax highlighting via [highlight.js](https://highlightjs.org/) (40+ languages)
  - PDF documents
  - Markdown (rendered via [marked](https://marked.js.org/) with HTML sanitization)
  - Font files (TTF, OTF, WOFF, WOFF2)
- **Quick Look** — spacebar preview overlay (macOS-inspired)
- **Properties panel** — file size, type, created/modified dates, attributes
- **Folder sizes** and recursive item counts
- **Image EXIF metadata** extraction
- **PDF, audio, video, and Office file metadata**
- **Checksums** — MD5, SHA-1, and SHA-256 for file integrity verification
- **File comparison** — side-by-side text diff with change highlighting

### Organization & Customization

- **Color labels / tags** — categorize files with color-coded tags
- **Configurable columns** — choose and resize columns in list view (persisted)
- **List and grid views** — switch between detailed list and icon grid
- **Dark, light, and system themes** — follows Windows appearance or set manually
- **Saved workspace layout** — window size, pane configuration, and view preferences persist across sessions
- **Custom startup location** — choose where SimpleFile opens
- **Remappable keyboard shortcuts**

### Developer Tools

- **Git integration** — branch name, status counts, per-file status indicators
- **Git pull / push** directly from the file manager
- **Open in terminal** — launch PowerShell, Command Prompt, Git Bash, or Windows Terminal
- **Elevated PowerShell** launch
- **Open With** — choose which application opens a file

### System Integration

- Built-in **auto-updater** with signed update verification
- **Duplicate file finder** — identify and manage duplicate files
- **Disk cleanup utilities**
- **System tray** integration
- **Start with Windows** option
- Custom frameless window with native window shadows

---

## Installation

Download the latest Windows installer from [**GitHub Releases**](https://github.com/conniecombs/SimpleFile-Windows/releases).

| Installer | Use Case |
| --- | --- |
| `SimpleFile_1.1.0_x64-setup.exe` | **Recommended** — NSIS installer for standard installation |
| `SimpleFile_1.1.0_x64_en-US.msi` | MSI package for enterprise / GPO deployment |

After the first manual install, subsequent updates can be checked and applied from **Settings → Updates** within the app.

> **Requirements:** Windows 10 or later (x64).

---

## Development

### Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | 24+ | Frontend tooling and build scripts |
| [Rust](https://rustup.rs/) | Stable | Backend compilation |
| [Tauri CLI v2](https://v2.tauri.app/start/create-project/) | 2.x | Desktop app bundling (installed via npm) |
| Windows SDK (`rc.exe` on PATH) | — | Resource stamping for Rust tests |
| [WiX Toolset](https://wixtoolset.org/) | — | Only needed for local MSI validation |

### Quick Start

```powershell
# 1. Clone the repository
git clone https://github.com/conniecombs/SimpleFile-Windows.git
cd SimpleFile-Windows

# 2. Install frontend dependencies
npm ci --prefix frontend

# 3. Run in development mode (hot-reload)
npm run dev

# 4. Run all quality checks
npm run check
```

### Available Scripts

All scripts are run from the **repository root** via `npm run <script>`.

| Script | Description |
| --- | --- |
| `dev` | Start the Tauri development server with hot-reload |
| `build` | Build the frontend for production (`vite build`) |
| `check` | Run all frontend migration checks, API parity, behavior guards, Svelte type checks, smoke settings UI, and frontend build |
| `check:rust` | Rust formatting (`cargo fmt`), tests, and Clippy with warnings denied |
| `check:security` | Rust dependency audit via `cargo-audit` |
| `check:release` | Combined frontend + Rust + security gate — full release-quality validation |
| `build:tauri:local` | Build unsigned NSIS and MSI installers locally |
| `release:local` | Run release checks then build local installers |
| `smoke:settings` | Startup and settings persistence smoke test |
| `smoke:release` | Built executable startup smoke test |
| `smoke:msi` | MSI artifact extraction and launch smoke test |
| `smoke:installer` | NSIS install, launch, and uninstall smoke test |

---

## Project Structure

```
SimpleFile-Windows/
├── frontend/                        Svelte 5 + Vite + TypeScript frontend
│   ├── index.html                   HTML entry point
│   ├── package.json                 Frontend dependencies and scripts
│   ├── svelte.config.js             Svelte compiler configuration
│   ├── vite.config.ts               Vite bundler configuration
│   ├── tsconfig.json                TypeScript configuration
│   ├── src/
│   │   ├── main.ts                  Svelte app bootstrap
│   │   ├── App.svelte               Root Svelte component
│   │   ├── css/                     Stylesheets and theme definitions
│   │   ├── lib/
│   │   │   ├── api.ts               Typed frontend → backend API wrapper
│   │   │   ├── tauri.ts             Tauri IPC boundary and browser-dev fallback
│   │   │   ├── types.ts             Shared TypeScript type definitions
│   │   │   ├── app/                 Workflow orchestration and business logic
│   │   │   └── components/          Svelte UI components
│   │   └── vanilla-js/runtime/      Shared typed runtime helpers
│   ├── scripts/                     Frontend migration and guard checks
│   └── public/                      Static assets
│
├── src-tauri/                       Rust backend (Tauri 2)
│   ├── Cargo.toml                   Rust dependencies and metadata
│   ├── tauri.conf.json              Production Tauri configuration
│   ├── tauri.local.conf.json        Local build configuration (unsigned)
│   ├── capabilities/default.json    Tauri v2 permission grants
│   ├── icons/                       Application icons (PNG, ICO)
│   └── src/
│       ├── main.rs                  App entry point and Tauri builder
│       ├── lib.rs                   Command registration and plugin setup
│       ├── models.rs                IPC data models and structs
│       ├── state.rs                 Application state management
│       ├── fs_ops.rs                Filesystem operations (copy, move, delete, rename)
│       ├── progress.rs              Cancellable copy/move with progress events
│       ├── dir_list.rs              Directory listing and sorting
│       ├── drives.rs                Windows drive and network share metadata
│       ├── search.rs                Recursive file and content search
│       ├── smart_folders.rs         Saved search / smart folder persistence
│       ├── archive.rs               ZIP, TAR, GZ, and RAR archive handling
│       ├── rar_installer.rs         Optional RAR tooling installer
│       ├── preview.rs               File preview content loading
│       ├── metadata.rs              File metadata, EXIF, PDF info, audio tags
│       ├── checksum.rs              MD5, SHA-1, SHA-256 hashing
│       ├── compare.rs               Side-by-side text file comparison
│       ├── cleanup.rs               Disk cleanup and duplicate detection
│       ├── git.rs                   Git status, branch info, pull/push
│       ├── tags.rs                  Color label / tag management
│       ├── terminal.rs              Terminal launcher (PowerShell, CMD, etc.)
│       ├── open_with.rs             "Open With" application handling
│       ├── updater.rs               App version and update commands
│       ├── watcher.rs               Filesystem change watcher (notify crate)
│       ├── native_accel.rs          Native keyboard accelerators
│       ├── db.rs                    SQLite-backed persistence (rusqlite)
│       └── utils.rs                 Shared utility functions
│
├── scripts/                         Repository-level tooling
│   ├── cargo-audit-release.mjs      Rust dependency security audit
│   ├── check-tauri-invokes.mjs      Ensures frontend invokes match Rust commands
│   ├── check-provider-surface.mjs   Guards against out-of-scope provider code
│   ├── check-windows-assets.mjs     Validates Windows packaging assets
│   ├── release.mjs                  Release automation helper
│   ├── smoke-nsis-install.ps1       NSIS installer smoke test
│   ├── smoke-msi-artifact.ps1       MSI artifact smoke test
│   ├── smoke-release-startup.ps1    Release binary smoke test
│   └── smoke-settings-startup.mjs   Settings persistence smoke test
│
├── docs/                            Documentation
│   ├── CHANGELOG.md                 Release changelog
│   ├── ROADMAP.md                   Feature roadmap
│   ├── CONTRIBUTING.md              Contribution guidelines
│   ├── CODE_OF_CONDUCT.md           Code of conduct
│   ├── SECURITY.md                  Security policy and reporting
│   ├── SUPPORT.md                   Support guide
│   ├── UPDATER_RELEASE.md           Updater release process
│   ├── RELEASE_1.1.0.md             v1.1.0 release notes
│   └── assets/screenshots/          Application screenshots
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                   CI pipeline (push/PR to main)
│   │   ├── release.yml              Release build and publish
│   │   ├── installer-smoke.yml      Installer smoke tests
│   │   └── dependabot-automerge.yml Dependabot auto-merge
│   ├── ISSUE_TEMPLATE/              Issue templates
│   ├── PULL_REQUEST_TEMPLATE.md     PR template
│   ├── RELEASE.md                   Release checklist
│   └── dependabot.yml               Dependabot configuration
│
├── build_notes/                     Internal build and configuration notes
├── base_icon.png                    Source application icon (1024×1024)
├── package.json                     Root npm scripts (dev, build, checks)
├── LICENSE                          Proprietary license
└── .gitignore
```

The shipping frontend starts at `frontend/src/main.ts`, and shared typed runtime helpers live under `frontend/src/vanilla-js/runtime/`.

---

## Architecture

SimpleFile follows a clean **frontend ↔ backend** split via Tauri's IPC bridge:

```
┌─────────────────────────────────────────────────────┐
│                   Svelte 5 Frontend                 │
│                                                     │
│  Components ──→ App Logic ──→ api.ts ──→ tauri.ts   │
│                                  │                  │
│                          Tauri IPC invoke            │
└──────────────────────────────────┬──────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────┐
│                    Rust Backend                      │
│                                                     │
│  lib.rs (command registration)                      │
│    ├── fs_ops.rs      File operations               │
│    ├── progress.rs    Async progress + cancellation  │
│    ├── drives.rs      Windows drive enumeration      │
│    ├── search.rs      Recursive + content search     │
│    ├── archive.rs     ZIP/TAR/GZ/RAR handling        │
│    ├── metadata.rs    EXIF, PDF, audio metadata      │
│    ├── git.rs         Git status and actions          │
│    ├── watcher.rs     Live filesystem events          │
│    └── ...            20+ specialized modules        │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **No `__TAURI__` global** — all Tauri access is routed through `frontend/src/lib/tauri.ts`, with a browser-dev fallback for frontend-only development.
- **Typed API boundary** — `api.ts` provides a fully typed wrapper over every Rust command, enforced by automated parity checks.
- **Vanilla CSS theming** — light, dark, and system themes controlled via CSS custom properties.
- **Async progress** — long-running file operations emit progress events to the frontend via Tauri event channels, with full cancellation support.

---

## Verification & Testing

### Automated Quality Gates

| Command | What it checks |
| --- | --- |
| `npm run check` | Frontend migration guards, API parity, behavior bridges, Svelte type-checking, settings UI smoke, and production build |
| `npm run check:rust` | `cargo fmt`, `cargo test`, and `cargo clippy -D warnings` |
| `npm run check:security` | Rust dependency audit via `cargo-audit` |
| `npm run check:release` | All of the above combined — the full release-quality gate |

### Smoke Tests

| Command | What it validates |
| --- | --- |
| `npm run smoke:settings` | App startup and settings persistence round-trip |
| `npm run smoke:release` | Built release executable launches successfully |
| `npm run smoke:msi` | MSI artifact extracts and launches correctly |
| `npm run smoke:installer` | Full NSIS install → launch → uninstall cycle |

### Project Boundary Guards

The `check` pipeline also enforces architectural invariants:

- Out-of-scope provider and mount-management surfaces are excluded from this branch
- All renderer Tauri access is channeled through `frontend/src/lib/tauri.ts`
- The global `__TAURI__` bridge is disabled
- Modal HTML paths sanitize content before insertion
- Packaging assets and bundle targets remain Windows-only
- Tauri command registrations stay aligned with frontend typed wrappers

> **Note:** Full installer smoke tests are intentionally excluded from the PR pipeline because packaging is slow. Run the **Installer Smoke** workflow manually or rely on its nightly schedule before cutting a release.

---

## Release & Packaging

### Bundle Targets

SimpleFile produces two Windows installer formats:

| Format | File | Notes |
| --- | --- | --- |
| NSIS | `SimpleFile_<version>_x64-setup.exe` | Per-user install, recommended for end users |
| MSI | `SimpleFile_<version>_x64_en-US.msi` | Per-machine install for enterprise deployment |

### Auto-Updater

Production builds include signed updater artifacts (`latest.json` + `.sig` files). After the first manual install, the app checks for and applies updates via the built-in updater (Settings → Updates).

### Build Configurations

| Config File | Purpose |
| --- | --- |
| `src-tauri/tauri.conf.json` | **Production** — enables signing, updater artifacts, and full bundle targets |
| `src-tauri/tauri.local.conf.json` | **Local development** — same bundle targets with signing disabled |

### Release Workflow

The [release workflow](.github/workflows/release.yml) is triggered by pushing a `v*` tag or manual dispatch:

1. **Validate** — ensures the tag version matches `tauri.conf.json` and `Cargo.toml`
2. **Quality gates** — runs the full `check:release` pipeline
3. **Build** — compiles Windows x64 NSIS + MSI installers with signed updater artifacts
4. **Publish** — creates a GitHub Release (draft by default) with all assets attached

### Version Management

Use the version update script to synchronize versions across all config files:

```powershell
# Updates package.json, tauri.conf.json, and Cargo.toml simultaneously
powershell -File scripts/update_version.ps1 -Version "1.2.0"
```

---

## Documentation

| Document | Description |
| --- | --- |
| [Changelog](docs/CHANGELOG.md) | Version history and release notes |
| [v1.1.0 Release Notes](docs/RELEASE_1.1.0.md) | Detailed notes for the current release |
| [Roadmap](docs/ROADMAP.md) | Planned features and milestones |
| [Contributing](docs/CONTRIBUTING.md) | How to contribute to SimpleFile |
| [Code of Conduct](docs/CODE_OF_CONDUCT.md) | Community standards |
| [Support](docs/SUPPORT.md) | How to get help |
| [Security Policy](docs/SECURITY.md) | Vulnerability reporting and security checklist |
| [Updater Release Guide](docs/UPDATER_RELEASE.md) | How to publish signed updates |
| [Release Checklist](.github/RELEASE.md) | Step-by-step release process |

---

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Ctrl+Z` | Undo last operation |
| `Delete` | Move to Recycle Bin |
| `Shift+Delete` | Permanent delete |
| `F2` | Rename selected item |
| `Ctrl+A` | Select all |
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+N` | New window |
| `Ctrl+F` | Search / Find |
| `Ctrl+L` | Focus address bar |
| `Alt+Left` / `Alt+Right` | Navigate back / forward |
| `Ctrl+Shift+N` | New folder |
| `F5` | Refresh |
| `Ctrl+H` | Toggle hidden files |
| `Space` | Quick Look preview |

> Shortcuts are remappable from **Settings → Keyboard Shortcuts**.

---

## Security

- **Do not commit** signing keys, updater private keys, `.env` files, local secrets, personal settings exports, or logs containing private paths.
- HTML content injected into modals and the markdown preview pane is sanitized via [sanitize-html](https://www.npmjs.com/package/sanitize-html) to prevent XSS.
- The Content Security Policy restricts script and resource loading to `'self'` only.
- See [docs/SECURITY.md](docs/SECURITY.md) for the full vulnerability reporting policy and release security checklist.

---

## License

SimpleFile is **proprietary software**. Copyright © 2024–2026 conniecombs. All rights reserved.

See [LICENSE](LICENSE) for full terms. Third-party dependencies remain under their own respective licenses.
