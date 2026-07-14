# UI And Backend Review

## Current State

The Windows-focused branch has a local-file UI backed by typed Tauri commands. The active surface includes drive listing, directory browsing, dual-pane navigation, tabs, transfers, archive operations, search, smart folders, previews, metadata, checksums, Git status, cleanup tools, updater actions, and Windows installer support.

## Strengths

- Tauri command registration and frontend command contracts are checked by `scripts/check-tauri-invokes.mjs`.
- Windows drive display names use native volume and mapped-share lookups.
- Directory opens from file list, tree, and breadcrumb events carry directory intent.
- Archive paths are handled before normal filesystem commands.
- Release checks cover updater metadata and workflow configuration.

## Risks

- Generated migration-audit artifacts can drift from live Svelte source.
- Large local folders can still make metadata operations expensive.
- Installer and updater behavior need smoke testing on real Windows machines before release.

## Recommended Checks

```powershell
npm run check
npm run check:rust
npm run check:security
npm run build:tauri:local
```
