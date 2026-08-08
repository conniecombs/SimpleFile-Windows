# SimpleFile Updater Releases

SimpleFile uses the Tauri 2 updater plugin with GitHub Releases as the static
update server. Release builds publish `latest.json`, signed update artifacts,
and `.sig` files to the latest GitHub release. Installed apps check:

```text
https://github.com/conniecombs/SimpleFile-Windows/releases/latest/download/latest.json
```

## One-time signing setup

The updater private key must never be committed. Generate it locally:

```powershell
New-Item -ItemType Directory -Force -Path .\.secrets | Out-Null
cargo tauri signer generate --write-keys .\.secrets\simplefile-updater.key
```

The public key from `.secrets\simplefile-updater.key.pub` belongs in
`src-tauri/tauri.conf.json`. The private key content belongs in the GitHub
repository secret named `TAURI_SIGNING_PRIVATE_KEY`.

If you generated the key with a password, also create this repository secret:

```text
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The current project `.gitignore` excludes `.secrets/` so local key files are not
tracked.

## Release flow

1. Update the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit the version bump and release notes.
3. Create a tag such as `v1.1.0`, or run the `Release` GitHub Actions workflow
   manually with that version.
4. The release workflow runs quality gates, builds the Windows x64 release
   target, signs updater artifacts, uploads signatures, and uploads
   `latest.json`.
5. Publish the GitHub release when ready. Draft releases are not returned by the
   `releases/latest` endpoint, so installed apps only see published releases.

## Validation

Run these before pushing a release branch:

```powershell
npm run check:release
```

That command runs the Svelte production build, frontend/backend bridge checks,
frontend syntax/invoke/updater checks, Rust formatting, Rust tests, Clippy, and
the Rust dependency audit using the same advisory ignore policy as CI.

On local Windows machines, make sure the Windows SDK Resource Compiler
(`rc.exe`) is available on `PATH` before running Rust tests or Tauri builds.

To also prove that local Windows installer packaging works without requiring
the updater private key, run the complete release build script:

```powershell
npm run release:build
```

That command installs frontend dependencies, runs the full release gate, builds
the local Windows installers, smoke-tests the release executable, MSI artifact,
and NSIS install path, and prints the generated artifact paths. It keeps release
signing enabled in `tauri.conf.json`, but passes the local Tauri config override
in `src-tauri/tauri.local.conf.json` so updater artifacts are not created.
Signed updater artifacts are still required for the real GitHub release flow.

To build release-quality artifacts on GitHub without publishing a release, run
the `Release build` workflow from the Actions tab. It runs `npm run
release:build` on a Windows runner, optionally runs installer smoke tests, and
uploads the generated executable, NSIS installer, and MSI installer as workflow
artifacts.

If you only need to build the local installers after checks, run:

```powershell
npm run release:local
```

The complete script is conservative about installing machine-wide tools. If
Tauri CLI or WiX Toolset are missing and you want the script to install them
where possible, run:

```powershell
npm run release:build -- -InstallMissingTools
```

After a local bundle build, smoke-test the release executable startup path:

```powershell
npm run smoke:release
```

The smoke test launches `src-tauri/target/release/simplefile.exe`, waits for the
main `SimpleFile - File Explorer` window, and closes only the process it
started.

To smoke-test settings persistence and startup location selection without
launching the desktop app, run:

```powershell
npm run smoke:settings
```

That script verifies `simplefile-settings`, `simplefile-tabs`, Custom Path
startup, Home startup, Last Used startup, stale active-tab fallback, and Custom
Path fallback when the saved path is blank.

To smoke-test the MSI artifact without modifying an existing SimpleFile
installation, run:

```powershell
npm run smoke:msi
```

That script performs an administrative MSI extraction to a temporary folder,
launches the extracted executable, waits for the main window, closes the process
it started, and removes the temporary extraction folder.

If SimpleFile is not already installed, run a full silent NSIS install smoke
test:

```powershell
npm run smoke:installer
```

The install smoke test installs the latest local NSIS setup executable, verifies
the uninstall registry entry and executable version, launches the installed app,
closes the process it started, and uninstalls the app. To keep the installed app
for manual testing, run the script directly with `-KeepInstalled`.

For a local signed Tauri bundle, load the private key content before building:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .\.secrets\simplefile-updater.key -Raw
cargo tauri build --ci
```

The first updater-enabled release must be installed manually by existing users.
After that, future published releases can be installed through Settings ->
App Updates.
