# Support

Use this file when collecting information for SimpleFile Windows support issues.

## Before Reporting

1. Confirm you are on the `Windows-Focused` branch or a Windows release built from it.
2. Run `npm run check` when reporting a development issue.
3. For installer issues, also run `npm run smoke:msi` and `npm run smoke:installer`.
4. For startup issues, capture whether the app window appears, whether settings load, and whether the updater check starts.

## Include In Reports

- Windows version and architecture.
- SimpleFile version from the About dialog.
- Whether the issue is in the dev app, unpacked build, NSIS installer, or MSI installer.
- The exact folder path involved, with personal details redacted.
- Whether the path is local storage, removable media, or a mapped network drive.
- Any console output, Rust panic output, or installer smoke-test output.

## Common Areas

- Drive names and mapped network shares: check `src-tauri/src/drives.rs`.
- Folder navigation opening outside the app: check `frontend/src/lib/fileNavigationPrimary.ts` and `src-tauri/src/preview.rs`.
- Settings startup behavior: check `frontend/src/lib/app/setup.ts` and `frontend/src/vanilla-js/runtime/startup-location.js`.
- Archive behavior: check `src-tauri/src/archive.rs`.
- Release and updater behavior: check `.github/RELEASE.md`, `docs/UPDATER_RELEASE.md`, and `scripts/check-updater-config.mjs`.
