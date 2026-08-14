# SimpleFile WinUI 3 host (migration)

Native shell for the Svelte/Tauri → WinUI 3 migration. The first UI slice is **primary-pane navigation**: drives, sidebar roots, directory listing, breadcrumbs / path entry, and open-folder-in-app.

The existing Svelte/Tauri app remains the shipping UI. See `docs/winui-migration/parity-navigation.md` for the checklist and gaps.

## What this host does

- Starts `simplefile-service` (job object `KILL_ON_JOB_CLOSE`) and speaks named-pipe JSON-RPC.
- `SimpleFile.Ipc` multiplexes request/response, `list_directory.chunk` notifications, client-side cancellation, and typed `IpcException`s.
- `SimpleFile.Core.ExplorerWorkspace` ports Svelte `loadDirectory` / history / `getParentPath` / Quick Access / drive status.
- `SimpleFile.App` shows a dark explorer chrome: sidebar (Quick Access + My PC), back/forward/up, breadcrumbs, path edit, list columns.

Not ported yet: dual pane, tabs, tree expand, watcher, open-file, archives, search, transfers, tags, settings persistence.

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
