# Release Process

This document describes how to create a new SimpleFile release from the `main` branch.

## Automated Releases

Releases are automated with GitHub Actions through `.github/workflows/release.yml`.

### 1. Update Version Numbers

Update the version in these files and keep them identical:

- `src-tauri/tauri.conf.json` — `version` field
- `src-tauri/Cargo.toml` — package `version` field
- [`README.md`](../README.md) — version badge
- [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) — release notes and compare links

Release workflow validation fails if the tag/manual version does not match both Rust/Tauri manifest versions.
`src-tauri/Cargo.lock` must also be committed and current so release builds use the reviewed dependency graph.
For releases that change drive enumeration, process launching, updater behavior, or installer behavior,
update [`docs/CLOUD_DRIVES.md`](../docs/CLOUD_DRIVES.md),
[`docs/SECURITY.md`](../docs/SECURITY.md), [`docs/SUPPORT.md`](../docs/SUPPORT.md),
and the relevant README sections.

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
3. Build for all configured platforms:
   - Windows x64
   - macOS x64 / Intel
   - macOS ARM64 / Apple Silicon
   - Linux x64
4. Verify the updater signing secret is available for release builds.
5. Create or update a draft GitHub release and upload installer artifacts, signed updater
   artifacts, signatures, and `latest.json` through
   `tauri-apps/tauri-action@action-v0.6.2`.
6. Keep tag-triggered releases as drafts by default so assets can be reviewed before publishing.
7. Publish the release only after all platform builds succeed when manual `draft=false` is selected.

### 5. Manual Release

You can also trigger a release manually:

1. Go to Actions → Release.
2. Click **Run workflow**.
3. Enter the version, for example `v1.0.0`.
4. Choose whether to create a draft release.

If `draft` is set to `false`, the workflow publishes the release after all platform builds succeed.

## Release Artifacts

Each release may include the following artifacts, depending on Tauri bundler output for the platform:

| Platform | Installer Type | Example File |
|----------|----------------|--------------|
| Windows | MSI / NSIS | `SimpleFile_x.x.x_x64_en-US.msi`, `SimpleFile_x.x.x_x64-setup.exe` |
| macOS Intel | DMG / app bundle | `SimpleFile_x.x.x_x64.dmg` |
| macOS Apple Silicon | DMG / app bundle | `SimpleFile_x.x.x_aarch64.dmg` |
| Linux | AppImage / Debian package | `simplefile_x.x.x_amd64.AppImage`, `simplefile_x.x.x_amd64.deb` |
| Updater | Static JSON / signatures | `latest.json`, updater bundle signatures, and platform updater artifacts |

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
| `ci.yml` | Push/PR to `main`, manual dispatch | Rust format, Clippy, tests, Svelte and legacy frontend checks, frontend/backend invoke checks, dependency audit/review, and Linux/macOS/Windows backend builds with the committed lockfile |
| `release.yml` | Tag push (`v*`), manual dispatch | Version validation, release quality gates, cross-platform Tauri release packaging, installer upload via Tauri Action, optional publishing |
| `dependabot.yml` | Weekly schedule | Dependency update pull requests for Cargo and GitHub Actions |

## Code Signing

### Windows

Add these secrets for Windows code signing when ready:

- `WINDOWS_CERTIFICATE` — base64-encoded `.pfx` file
- `WINDOWS_CERTIFICATE_PASSWORD` — certificate password

### macOS

Add these secrets for macOS code signing and notarization when ready:

- `APPLE_CERTIFICATE` — base64-encoded `.p12` file
- `APPLE_CERTIFICATE_PASSWORD` — certificate password
- `APPLE_SIGNING_IDENTITY` — for example, `Developer ID Application: Your Name`
- `APPLE_ID` — Apple ID email
- `APPLE_PASSWORD` — app-specific password
- `APPLE_TEAM_ID` — Apple Team ID

## Versioning

SimpleFile follows Semantic Versioning:

- **MAJOR**: breaking changes
- **MINOR**: backward-compatible features
- **PATCH**: backward-compatible fixes and release/process improvements

Pre-release examples: `v1.0.0-beta.1`, `v1.0.0-rc.1`.
