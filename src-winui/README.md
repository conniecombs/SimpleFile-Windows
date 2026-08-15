# SimpleFile WinUI 3 host (migration)

Native shell for the Svelte/Tauri → WinUI 3 migration. The first UI slice is **primary-pane navigation**: drives, sidebar roots, directory listing, breadcrumbs / path entry, and open-folder-in-app.

The existing Svelte/Tauri app remains the shipping UI. See `docs/winui-migration/parity-navigation.md` for the checklist and gaps.

## What this host does

- Starts `simplefile-service` (job object `KILL_ON_JOB_CLOSE`) and speaks named-pipe JSON-RPC.
- `SimpleFile.Ipc` multiplexes request/response, `list_directory.chunk` notifications, transfer progress, watcher/search notifications, client-side cancellation, and typed `IpcException`s.
- `SimpleFile.Core.ExplorerWorkspace` ports Svelte `loadDirectory` / history / `getParentPath` / Quick Access / drive status.
- `SimpleFile.App` shows a dark explorer chrome: sidebar (Quick Access + My PC), dual pane (F6), pane-local tabs, back/forward/up, breadcrumbs, path edit, list columns.

Native chrome now includes a command palette (Ctrl+Shift+P), full Svelte context-menu IDs, drag/drop transfers, resizable columns, light/dark theme, empty/loading states, keyboard-help / Quick Look / properties modals, and AutomationProperties names on the main chrome. Workspace tabs, dual-pane, sort, sidebar collapse, and settings persist through the Rust settings IPC. Tree expand is still incremental.

## Projects

| Project | Role |
| --- | --- |
| `SimpleFile.App` | Unpackaged WinUI 3 explorer window |
| `SimpleFile.Ipc` | Length-prefixed JSON-RPC named-pipe client |
| `SimpleFile.Core` | Service lifetime + navigation workspace |
| `SimpleFile.Tests` | Framing, DTO, client, path, and navigation tests |

Target: Windows 10 2004+ / Windows 11 x64, `net8.0-windows10.0.19041.0`, Windows App SDK self-contained.

## Build

From the repository root:

```powershell
cargo build -p simplefile-service
dotnet build src-winui/SimpleFile.sln -c Debug
dotnet test src-winui/SimpleFile.Tests/SimpleFile.Tests.csproj -c Debug
```

Or:

```powershell
npm run build:winui
npm run check:winui
npm run dev:winui
```

`dev:winui` builds `simplefile-service` then runs `SimpleFile.App`. Override the service path with `SIMPLEFILE_SERVICE_PATH` if needed.

## Runnable folder (Release)

The unpackaged exe needs `resources.pri` (WinUI theme map) and the `*.xbf` pages next to `SimpleFile.App.exe`. A normal `dotnet publish` omitted those; the project now copies them.

```powershell
dotnet publish src-winui\SimpleFile.App\SimpleFile.App.csproj -c Release -r win-x64 --self-contained true
Copy-Item src-tauri\target\release\simplefile-service.exe `
  src-winui\SimpleFile.App\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\ -Force
Start-Process src-winui\SimpleFile.App\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\SimpleFile.App.exe
```

If the window never appears, check `%LOCALAPPDATA%\SimpleFile\startup.log`. The usual cause is a missing `resources.pri` or `MainWindow.xbf`.

## Dual-stack packaging

Tauri NSIS/MSI/`latest.json` remains the shipping updater until retirement. WinUI artifacts are extra:

```powershell
npm run build:winui:release
```

Writes `dist/winui/`:

- `payload\` — `SimpleFile.exe` + `simplefile-service.exe` + WASDK files
- `SimpleFile_*_x64-winui-portable.zip`
- `SimpleFile_*_x64-winui-setup.exe` (NSIS, if `makensis` is installed)
- `SimpleFile_*_x64-winui.msi` (WiX v3, if `candle`/`heat`/`light` are installed)
- `latest-winui.json`

Smokes: `npm run smoke:winui`, `npm run smoke:winui-msi`, `npm run smoke:winui-installer`.
The old `release:build` / `smoke:release` / `smoke:msi` / `smoke:installer` scripts stay until the Tauri retirement PR.
