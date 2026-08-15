# UI And Backend Review

## Current State

The Windows-focused branch ships a WinUI 3 host plus a Rust named-pipe IPC
service. The active surface includes drive listing, directory browsing,
dual-pane navigation, tabs, transfers, archive operations, search, smart
folders, previews, metadata, checksums, Git status, cleanup tools, updater
actions, and Windows installer support.

## Strengths

- The 74-command IPC schema is checked by `npm run check:ipc-schema` against
  `SimpleFile.Ipc.Protocol` and leftover `src-tauri/src/lib.rs` command names.
- WinUI parity-gate required rows stay `PASS` or `WAIVED`.
- Windows drive display names use native volume and mapped-share lookups.
- Directory opens from file list, tree, and breadcrumb events stay in-app.
- Archive paths are handled before normal filesystem commands.
- Release checks cover updater metadata and workflow configuration.

## Risks

- Leftover `src-tauri/src` domain (tags, smart folders, git, cleanup, terminal,
  RAR, db) is not a workspace crate yet; some methods still fall through the
  IPC MVP dispatcher.
- Large local folders can still make metadata operations expensive.
- Installer and updater behavior need smoke testing on real Windows machines
  before release.

## Recommended Checks

```powershell
npm run check
npm run check:winui
npm run check:rust
npm run check:security
npm run build:winui:release
```
