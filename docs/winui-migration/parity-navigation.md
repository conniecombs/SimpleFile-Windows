# Navigation parity checklist (WinUI slice 1)

First WinUI 3 feature slice: **drives, sidebar root, directory listing, breadcrumbs / path entry, primary-pane navigation, open folder in-app**.

Svelte/Tauri remains the shipping UI. This document compares the live Svelte paths (`frontend/src/lib/app/core.ts`, `fileNavigationPrimary.ts`, `ContentShell.svelte`, `SidebarShell.svelte`, `coreFileManager.ts`) to `src-winui`.

Sources of truth for this slice:

- `loadDirectory` / `openEntryPath` / `navigateHistory` / `navigateSpecial` / `refreshDrives` in `frontend/src/lib/app/core.ts`
- `pathSegments()` in `frontend/src/lib/components/layout-shell/ContentShell.svelte`
- Quick Access + My PC in `frontend/src/lib/components/layout-shell/SidebarShell.svelte`
- Path helpers + `visibleEntries` in `frontend/src/lib/coreFileManager.ts`
- Startup default `startLocation: 'home'` in `frontend/src/lib/appState.ts`

## In scope

| Behavior | Svelte | WinUI | Status |
| --- | --- | --- | --- |
| Start IPC service, handshake, `get_home_dir`, `list_drives` | Tauri invoke | `BackendSession` + `ExplorerWorkspace.InitializeAsync` | Done |
| Start at home | `resolveStartupLocation` mode `home` | Navigate to `get_home_dir` | Done |
| Sidebar Quick Access: Home / Desktop / Downloads / Documents / Pictures | `navigateSpecial` + `joinPath(home, name)` | Same commands and join rule | Done |
| Sidebar My PC drive roots | `list_drives`, fallback drive, status badge/description | `DrivePresentation` + drive list | Done |
| Refresh drives | `simplefile:refresh-drives` | ↻ button | Done |
| Collapse Quick Access / My PC | `localStorage` `simplefile-sidebar-collapse-state` | In-session only | **Gap** — not persisted |
| Directory listing via `list_directory` | Channel chunks then full listing | `list_directory.chunk` then result | Done |
| First chunk paints before enumeration finishes | `primaryListingInProgress` + progressive concat | Same token + progressive list | Done |
| `RESULT_TOO_LARGE` keeps streamed chunks | Architecture / Gate 5 | Workspace treats as success + status | Done |
| Hide `.` files by default | `showHiddenFiles: false` | Same | Done |
| Sort dirs-first then name (default) | `visibleEntries` / `sortEntries` | `EntryPresentation` | Done |
| Header sort name / size / date / type | Click header toggles direction | Same | Done |
| Columns Name, Size, Modified, Type | Default visible columns | Same four | Done (fixed widths) |
| Breadcrumb segments | `path.split(/[/\\]/)` + `C:\` for drive | `BreadcrumbBuilder` | Done |
| Click breadcrumb navigates | `loadDirectoryForPane` | `NavigateToAsync` | Done |
| Path edit (✎), Enter navigates, Escape cancels | `ContentShell` path bar | Same | Done |
| Back / Forward history | `recordHistory` + `navigateHistory` with mode `none` | Same | Done |
| Up uses `getParentPath`; no-op on drive root | `if (parent) loadDirectoryForPane` | Same | Done |
| Open folder in-app (double-click / Enter) | `openEntryPath` → `loadDirectory` | Same | Done |
| Click file selects (does not open) | `file-list-item-click` | List click selects | Done (single select only) |
| Network drive offline → retry dialog | `offerNetworkDriveReconnect` | `ContentDialog` Retry/Cancel | Done (simplified copy) |
| F5 refresh, Alt+Left/Right/Up | Keyboard map (subset) | Keyboard accelerators | Done (subset) |
| Status: path / item count / errors | Status bar | Bottom bar + InfoBar | Done |

## Gaps (this slice)

These are intentional. They stay on Svelte until a later PR.

| Gap | Svelte today | Why WinUI does not match |
| --- | --- | --- |
| Dual pane, sidebar Left/Right target | `fileNavigationDualPane.ts`, `SidebarShell` | Out of slice (architecture PR 14) |
| Tabs | `fileNavigationTabs.ts` | Out of slice |
| Expandable folder tree | `listSubdirectories` / `loadTreeChildren` | IPC MVP returns `-32601` for `list_subdirectories` |
| `watch_directory` live refresh | Watcher after `loadDirectory` | IPC MVP has no watch command |
| Open file in default app | `open_file` / `openEntryPath` | IPC MVP has no `open_file`; UI reports “not ported yet” |
| `get_entry_info` for unknown path types | Used when click source has no `is_dir` | Path bar / breadcrumbs always navigate via `list_directory` |
| Archive-as-folder | `isArchiveFile` then `navigateTo` | Archive VFS still Tauri-only |
| Git status overlay on rows | `getGitFileStatuses` after listing | Not in IPC MVP |
| Thumbnails, folder sizes, item counts | Lazy metrics / thumbs | Out of slice |
| Grid / photo folder view | `isGridView`, `applyContextualFolderView` | List only |
| Multi-select, range, type-ahead, marquee | `fileNavigationSelection.ts` | Single select only |
| Quick filter bar | `filterQuery` | Sort/hide-dot only |
| Bookmarks, recents, smart folders | Sidebar below Quick Access | Out of slice |
| Settings / `startLocation` last or custom | `localStorage` settings | Always home |
| Persist sidebar collapse | `simplefile-sidebar-collapse-state` | Session only |
| Theme toggle / light theme | `data-theme` | Dark chrome only |
| Preview pane, search, transfers, tags, context menus | Rest of the app | Out of slice |
| UNC breadcrumb first segment | Svelte accumulates `server` not `\\server` | **Matched on purpose** (same quirk) |
| Breadcrumb path after drive | `C:\` + `\Users` → `C:\\Users` | **Matched on purpose** (Win32 still opens the folder) |
| Modified-date exact `Intl` string | `DateTimeFormat` locale options | `DateTimeOffset.ToString("g")` — same instant, locale format may differ slightly |
| Column resize / presets / extra columns | `fileListColumns.ts` | Fixed Name/Size/Modified/Type |
| Virtualized huge lists | `FileList.svelte` windowing | `ListView` default virtualization only |
| Startup `last` tabs/history restore | `resolveStartupLocation` | Always `home` |

## Blocked on later IPC methods

Do not invent client-side substitutes for these until the service implements them:

- `list_subdirectories` — tree expand
- `watch_directory` / `unwatch_directory` — live pane refresh
- `open_file` — double-click file
- `get_entry_info` — type probe
- `get_git_file_statuses` — git column
- archive listing path

## How to verify

```powershell
cargo build -p simplefile-service
dotnet test src-winui/SimpleFile.Tests/SimpleFile.Tests.csproj -c Debug
dotnet build src-winui/SimpleFile.sln -c Debug
npm run dev:winui
```

Manual: start at home, open a folder, breadcrumb back, path-bar Enter, drive click, Quick Access Desktop, Up at `C:\` does nothing, double-click file shows the not-ported InfoBar.
