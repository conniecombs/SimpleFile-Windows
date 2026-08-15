# SimpleFile Updater Releases

SimpleFile publishes WinUI updater metadata to GitHub Releases. Installed apps
check:

```text
https://github.com/conniecombs/SimpleFile-Windows/releases/latest/download/latest-winui.json
```

## One-time signing setup

The updater private key must never be committed. Store it locally under
`.secrets/` (gitignored) and in GitHub secrets:

```text
SIMPLEFILE_SIGNING_PRIVATE_KEY
SIMPLEFILE_SIGNING_PRIVATE_KEY_PASSWORD
```

Legacy `TAURI_SIGNING_PRIVATE_KEY` secrets are still accepted by
`scripts/build-winui-release.ps1` if the new names are unset.

## Release flow

1. Update the version in `src-winui/Directory.Build.props` and
   `crates/simplefile-service/Cargo.toml`.
2. Commit the version bump and release notes.
3. Create a tag such as `v1.1.0`, or run the `Release` GitHub Actions workflow
   manually with that version.
4. The release workflow runs quality gates, builds the WinUI host and Rust IPC
   service, uploads NSIS/MSI/portable artifacts, and uploads `latest-winui.json`.
5. Publish the GitHub release when ready. Draft releases are not returned by the
   `releases/latest` endpoint, so installed apps only see published releases.

## Validation

Run these before pushing a release branch:

```powershell
npm run check:release
```

That command runs IPC schema/updater/workflow checks, WinUI packaging and
parity-gate checks, Rust formatting, Rust tests, Clippy, and the Rust
dependency audit using the same advisory ignore policy as CI.

To also prove that local Windows installer packaging works, run:

```powershell
npm run release:build
```

That command runs the WinUI release script, smoke-tests the payload executable
and available installers, and prints the generated artifact paths.

To build release-quality artifacts on GitHub without publishing a release, run
the `Release build` workflow from the Actions tab.
