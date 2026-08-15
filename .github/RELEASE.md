# Release Process

This document describes how to create a Windows-only SimpleFile release from the
`main` branch.

## Automated Releases

Releases are automated with GitHub Actions through `.github/workflows/release.yml`.

## Windows Build Prerequisites

Local release validation requires Node.js 24 or newer, stable Rust, and the
Windows SDK Resource Compiler (`rc.exe`) on `PATH`. GitHub-hosted
`windows-latest` runners provide the Windows SDK; local shells should expose
the x64 SDK bin directory before running Rust/Tauri release gates.

### 1. Update Version Numbers

Update the version in these files and keep them identical:

- `src-tauri/tauri.conf.json` — `version` field
- `src-tauri/Cargo.toml` — package `version` field
- [`README.md`](../README.md) — version badge
- [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) — release notes and compare links

Release workflow validation fails if the tag/manual version does not match both Rust/Tauri manifest versions.
`src-tauri/Cargo.lock` must also be committed and current so release builds use the reviewed dependency graph.
For releases that change Windows drive enumeration, mapped network drive display,
process launching, updater behavior, installer behavior, or release smoke tests,
update [`docs/SECURITY.md`](../docs/SECURITY.md),
[`docs/SUPPORT.md`](../docs/SUPPORT.md), and the relevant README sections.

### 2. Merge the Version Bump

Open a pull request into `main`, wait for CI, then merge.

```bash
git checkout main
git pull origin main
```

### 3. Create a Git Tag

Tags must use `vMAJOR.MINOR.PATCH` format, for example `v1.0.0`.

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 4. Automated Build Process

The release workflow will:

1. Validate the release version against `Cargo.toml` and `tauri.conf.json`.
2. Run release quality gates: Rust formatting, Clippy, tests, Svelte build/type checks,
   frontend/backend invoke checks, updater configuration checks, and Rust dependency audit.
3. Build the Windows release target:
   - Windows x64 (`x86_64-pc-windows-msvc`)
4. Verify the updater signing secret is available for release builds.
5. Build the signed Windows NSIS/MSI installers, stage a portable executable zip,
   and upload those artifacts plus signed updater artifacts, signatures, and
   `latest.json` to the draft GitHub release.
   The same job also builds the dual-stack WinUI host (`scripts/build-winui-release.ps1`):
   `SimpleFile_*_x64-winui-setup.exe`, `SimpleFile_*_x64-winui.msi`,
   `SimpleFile_*_x64-winui-portable.zip` (inner `SimpleFile.exe` + `simplefile-service.exe`),
   and `latest-winui.json`. Tauri `latest.json` remains the shipping updater until Gate 6.
6. Keep tag-triggered releases as drafts by default so assets can be reviewed before publishing.
7. Publish the release only after the Windows build succeeds when manual
   `draft=false` is selected.

### 5. Manual Release

You can also trigger a release manually:

1. Go to Actions → Release.
2. Click **Run workflow**.
3. Enter the version, for example `v1.0.0`.
4. Choose whether to create a draft release.

If `draft` is set to `false`, the workflow publishes the release after the
Windows build succeeds.

## Release Artifacts

Each release may include the following Windows artifacts, depending on Tauri
bundler output:

| Platform | Installer Type | Example File |
|----------|----------------|--------------|
| Windows x64 | NSIS setup executable | `SimpleFile_x.x.x_x64-setup.exe` |
| Windows x64 | MSI installer | `SimpleFile_x.x.x_x64_en-US.msi` |
| Windows x64 | Portable executable zip | `SimpleFile_x.x.x_x64-portable.zip` |
| Windows updater | Static JSON / signatures | `latest.json`, updater bundle signatures, and Windows updater artifacts |

## Auto-Update

SimpleFile uses Tauri's updater plugin with GitHub Releases as the static update server.
The app checks `https://github.com/conniecombs/SimpleFile-Windows/releases/latest/download/latest.json`.

### Setup Requirements

1. **Generate signing keys:**
   ```bash
   cargo tauri signer generate -w .secrets/simplefile-updater.key
   ```

2. **Add secrets to GitHub:**
   - `TAURI_SIGNING_PRIVATE_KEY` — private signing key content
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — optional private key passphrase

3. **Keep `src-tauri/tauri.conf.json` updater settings enabled:**
   - `bundle.createUpdaterArtifacts` must be `true`.
   - `plugins.updater.pubkey` must contain the updater public key.
   - `plugins.updater.endpoints` must point at the GitHub release `latest.json`.

The first updater-enabled release must be installed manually by existing users.
After that, future published releases can be installed through Settings -> App Updates.
See [`docs/UPDATER_RELEASE.md`](../docs/UPDATER_RELEASE.md) for the operational checklist.

## CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to `main`, manual dispatch | Rust format, Clippy, tests, Svelte/frontend checks, frontend/backend invoke checks, updater/workflow/provider-surface checks, Rust dependency audit, and Windows x64 backend build with the committed lockfile |
| `release.yml` | Tag push (`v*`), manual dispatch | Version validation, release quality gates, Windows x64 Tauri release packaging, installer/portable/updater asset upload, optional publishing |
| `dependabot.yml` | Weekly schedule | Dependency update pull requests for Cargo, npm, and GitHub Actions |

## Code Signing

### Windows

Add these secrets for Windows code signing when ready:

- `WINDOWS_CERTIFICATE` — base64-encoded `.pfx` file
- `WINDOWS_CERTIFICATE_PASSWORD` — certificate password

## Versioning

SimpleFile follows Semantic Versioning:

- **MAJOR**: breaking changes
- **MINOR**: backward-compatible features
- **PATCH**: backward-compatible fixes and release/process improvements

Pre-release examples: `v1.0.0-beta.1`, `v1.0.0-rc.1`.
