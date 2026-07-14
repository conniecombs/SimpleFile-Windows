# Bugs And Follow-Ups

This file tracks current Windows-focused follow-up areas.

## Active Areas To Watch

| Area | Notes |
| --- | --- |
| Drive listing | Preserve volume labels and mapped network share names. |
| Folder navigation | Directory clicks should stay inside SimpleFile. |
| Transfers | Conflict handling must preserve skip, replace, keep-both, and cancellation behavior. |
| Archives | Virtual archive paths must not bypass destination validation. |
| Preview | Large files should respect preview limits and avoid blocking the UI. |
| Installer smoke | NSIS and MSI artifacts should be verified before release. |
| Updater | Release metadata should prefer the Windows installer path and passive install mode. |

## Useful Commands

```powershell
npm run check
npm run check:rust
npm run smoke:settings
npm run smoke:release
npm run smoke:msi
npm run smoke:installer
```

## Regression Notes

- When drive labels regress, start in `src-tauri/src/drives.rs`.
- When folder clicks open Windows Explorer, check whether the frontend passed `isDir` into the shared open handler.
- When settings regress, check `frontend/src/lib/components/settings-body/SettingsBody.svelte` and `frontend/src/lib/app/setup.ts`.
