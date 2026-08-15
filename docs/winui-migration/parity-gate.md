# WinUI parity gate

**Date:** 2026-08-15  
**Source tree:** `R:\Repos\SimpleFile-Windows`  
**Contract:** [`inventory.md`](inventory.md) (74 commands / emitted events / Svelte workflows)  
**Hosts:** Svelte/Tauri remains shippable; WinUI + `simplefile-service` is the dual-stack replacement.

This is the **retirement lock**. Do not delete `frontend/` or Tauri glue in `src-tauri/` until every **required** row below is `PASS` or `WAIVED`. `OPEN` rows block retirement. `MANUAL` rows are implemented and still need a human smoke before a retirement PR.

Inspected for this gate: `src-tauri/src/lib.rs` `generate_handler!`, `frontend/src/lib/types.ts`, `frontend/scripts/check-*.mjs`, `crates/simplefile-service/src/dispatch.rs`, `src-winui/**`, `ipc/schema/v1/`, `package.json`, `.github/workflows/*`.

---

## Status legend

| Status | Meaning |
| --- | --- |
| `PASS` | Implemented in WinUI/IPC and covered by an automated check that still runs. |
| `MANUAL` | Implemented; no automated UI driver. Must be exercised with the smoke plan before retirement. |
| `OPEN` | Missing or only partial vs Svelte. Blocks deleting legacy UI. |
| `WAIVED` | Explicitly not required for WinUI (contract-only, unused event, or host-owned replacement). Reason is in the row. |

Required = every row except those marked `WAIVED`.

---

## How to run the plan

```powershell
# Automated (CI + local)
npm run check                 # includes check:winui-parity-gate + Svelte stage checks + updater/workflows
npm run check:winui           # xUnit: navigation, IPC, transfers, polish
npm run check:ipc-schema      # 74-command schema vs Rust/C#/Svelte
npm run check:winui-packaging
cargo test --locked --all-features

# WinUI smokes (after npm run build:winui:release)
npm run smoke:winui
npm run smoke:winui-msi       # needs WiX MSI
npm run smoke:winui-installer # needs NSIS setup

# Legacy Tauri smokes (keep until retirement)
npm run smoke:release
npm run smoke:msi
npm run smoke:installer
```

Manual host: `npm run dev:winui` or `dist\winui\payload\SimpleFile.exe`.

---

## 1. Process / IPC host

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `host.service` | UI starts `simplefile-service` via job object | `BackendSession` + `ServiceLocator` | `BackendSessionTests` | Launch exe; service process appears | `PASS` |
| `host.pipe` | Named pipe JSON-RPC length-prefix | `NamedPipeJsonClient` | `FrameCodecTests`, `NamedPipeJsonClientTests` | — | `PASS` |
| `host.handshake` | `ipc.handshake` first | Client + service dispatch | `BackendSessionTests`, service unit tests | — | `PASS` |
| `host.errors` | `-32000` exact `Err(String)`; `CONFLICT:`; `TRASH_UNAVAILABLE:`; `HOST_OWNED:` | `IpcException` + `FileOperationService` | `IpcExceptionTests`, `FileOperationServiceTests` | Conflict / trash fallback dialogs | `PASS` |
| `host.select_directory` | Folder picker is host-owned | `FolderPicker` in Settings / extract-to | Service returns `HOST_OWNED:`; `BackendSessionTests` | Browse custom start path | `PASS` |
| `show_main_window` | Service no-op; UI `Activate()` | IPC method kept | Schema + client method | — | `WAIVED` | Service `Ok(())`; no Svelte live caller |
| `host.convertFileSrc` | Media via filesystem path | Preview uses path / base64 | — | Open image preview | `PASS` |
| `host.browser-dev-fs` | In-memory Tauri DEV FS | Not ported | — | — | `WAIVED` | Inventory §5.5: do not ship |

---

## 2. IPC commands (74)

Each command must appear here. Service registry is `crates/simplefile-service/src/dispatch.rs`. C# names are `SimpleFile.Ipc.Protocol` + `ISimpleFileIpc`.

### 2.1 Filesystem and listing

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `get_home_dir` | Home path | `ExplorerWorkspace.InitializeAsync` | `ExplorerWorkspaceTests` | Starts at home | `PASS` |
| `select_directory` | Host picker | Settings / extract-to | `HOST_OWNED` test | Browse | `PASS` |
| `list_drives` | This PC | Sidebar drive list | `ExplorerWorkspaceTests` | Offline badge | `PASS` |
| `list_directory` | Listing + chunks | `list_directory.chunk` then result | `ExplorerWorkspaceTests` huge-folder / `RESULT_TOO_LARGE` | First paint on large folder | `PASS` |
| `list_subdirectories` | Sidebar tree children | IPC client exists; **no tree UI** | Schema/client only | — | `OPEN` |
| `create_directory` | New folder | Dialog + IPC | `FileOperationServiceTests` | Ctrl+Shift+N | `PASS` |
| `create_file` | New file | Dialog + IPC | `FileOperationServiceTests` | Ctrl+N | `PASS` |
| `delete_entry` | Permanent delete | Shift+Delete confirm | `FileOperationServiceTests` | Shift+Delete | `PASS` |
| `move_to_trash` | Recycle Bin | Delete / setting | `FileOperationServiceTests` trash prefix | Delete; network `TRASH_UNAVAILABLE:` | `PASS` |
| `rename_entry` | Rename | F2 dialog | `FileOperationServiceTests` | F2 | `PASS` |
| `batch_rename` | Advanced rename apply | Prefix/suffix/number dialog | IPC wrapper | Advanced rename on 3 files | `MANUAL` |
| `copy_entry` | Legacy single copy | IPC kept | Schema | — | `PASS` |
| `move_entry` | Legacy single move | IPC kept | Schema | — | `PASS` |
| `copy_entry_resolved` | Conflict-aware copy / undo | Undo stack redo | `UndoStack` tests | Undo a copy | `PASS` |
| `move_entry_resolved` | Conflict-aware move / undo | Undo stack | `UndoStack` tests | Undo a move | `PASS` |
| `get_entry_info` | Properties / type probe | Properties dialog | IPC wrapper | Properties on file | `MANUAL` |
| `copy_with_progress` | Copy + progress | Paste / drop / pane copy | `FileOperationServiceTests` | Copy large folder; cancel | `PASS` |
| `move_with_progress` | Move + progress | Cut-paste / drop | `FileOperationServiceTests` | Move across folders | `PASS` |
| `cancel_operation` | Progress cancel | Progress panel | `FileOperationServiceTests` | Cancel mid-copy | `MANUAL` |
| `watch_directory` | Live refresh | After navigate | Client + MainWindow watch | Create file in Explorer; pane reloads | `MANUAL` |
| `unwatch_directory` | Drop watch | Shutdown / navigate | Client | — | `PASS` |
| `calculate_folder_size` | Folder metrics | Metrics dialog | IPC wrapper | Folder metrics on a folder | `MANUAL` |
| `count_folder_items` | Folder metrics | Metrics dialog | IPC wrapper | Same dialog | `MANUAL` |
| `cancel_folder_size` | Abort size on nav | Wired on IPC | Schema/client | Navigate during metrics | `MANUAL` |
| `cancel_folder_item_count` | Abort counts | IPC | Schema/client | — | `PASS` |
| `cancel_count_items` | Unused wrapper | IPC kept | Schema | — | `WAIVED` | No live Svelte caller |

### 2.2 Preview, open, inspection

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `read_file_preview` | Preview pane / Quick Look | Preview + Space dialog | `FileOperationServiceTests` | Text + image files | `PASS` |
| `generate_thumbnail` | Single thumb | Preview image fallback | IPC wrapper | Image without inline preview | `MANUAL` |
| `generate_thumbnails` | Batch thumbs | IPC only; **no list thumbs** | Schema/client | — | `OPEN` |
| `open_file` | Default app / archive materialize | Double-click file | `ExplorerWorkspace` + FileOps | Double-click `.txt` | `PASS` |
| `reveal_in_folder` | Explorer select | Preview Reveal | IPC | Reveal selected | `MANUAL` |
| `open_external_url` | http(s) only | About / GitHub | IPC | About link | `MANUAL` |
| `open_file_with` | Named app | Open With dialog | IPC | Open With notepad | `MANUAL` |
| `compare_files` | Two-file diff | Compare dialog | IPC | Select two files → Compare | `MANUAL` |
| `compute_checksum` | MD5/SHA1/SHA256 | Preview checksums | IPC | Checksums button | `MANUAL` |
| `get_image_metadata` | EXIF | Preview metadata | IPC | JPEG with EXIF | `MANUAL` |
| `get_file_metadata` | Unified metadata | Preview metadata | IPC | PDF / audio | `MANUAL` |

### 2.3 Search, smart folders, organization

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `search_files` | Search + batches | Sidebar search box | Client batch callbacks | Search current folder | `MANUAL` |
| `cancel_search` | Cancel / Escape | Cancel button + Escape | Client | Cancel long search | `MANUAL` |
| `load_smart_folders` | Sidebar list | Initialize load | Workspace init | Sidebar shows saved folders | `MANUAL` |
| `save_smart_folder` | Save current search | Core API; **no save UI** | IPC wrapper | — | `OPEN` |
| `delete_smart_folder` | Sidebar × | Delete button | Workspace method | Delete a smart folder | `MANUAL` |
| `disk_cleanup` | Large-file analyze | Disk cleanup dialog | IPC + progress | Analyze a folder | `MANUAL` |
| `cancel_disk_cleanup` | Cancel analyze | IPC | Schema/client | — | `PASS` |
| `duplicate_check` | Duplicate groups | Duplicate checker dialog | IPC + progress | Find duplicates | `MANUAL` |
| `cancel_duplicate_check` | Cancel scan | IPC | Schema/client | — | `PASS` |

### 2.4 Archives and WinRAR

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `list_archive` | Archive viewer | `ArchiveViewerDialog` | `ArchivePaths` tests | Open a zip | `MANUAL` |
| `extract_archive` | Extract here / folder / to | Context extract + dialog | IPC | Extract zip | `MANUAL` |
| `create_archive` | zip/tar/tar.gz/rar | Create archive dialog | IPC | Compress selection | `MANUAL` |
| `check_rar_installed` | Tools badge | Settings → Tools | Settings load | Tools tab | `MANUAL` |
| `prepare_rar_install` | Stage installer | Settings install flow | IPC | Install RAR (optional) | `MANUAL` |
| `discard_rar_install` | Cancel staged | Settings cancel | IPC | Cancel confirm | `MANUAL` |
| `install_rar` | Silent install | Settings confirm | IPC | — | `MANUAL` |

### 2.5 Git, terminals, tags, settings, updater

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `get_git_status` | Repo status | IPC only | Schema/client | — | `WAIVED` | Typed; no live Svelte caller |
| `get_git_file_statuses` | Git column | IPC; **no row overlay** | Schema/client | — | `OPEN` |
| `git_pull` | Palette Git pull | Command palette | Catalog test | Git pull in a repo | `MANUAL` |
| `git_push` | Palette Git push | Command palette | Catalog test | Git push | `MANUAL` |
| `open_terminal` | F4 / context | IPC | — | F4 | `MANUAL` |
| `open_powershell_admin` | Context | IPC | Context menu ID | Elevate PS | `MANUAL` |
| `get_all_tags` | Color labels | Tag picker | Workspace seed | Set label | `MANUAL` |
| `create_tag` | Seed defaults | Empty-DB seed | Workspace `DefaultTags` | Fresh profile | `MANUAL` |
| `update_tag` | Tag editor | IPC | Schema/client | — | `OPEN` | No WinUI tag editor |
| `delete_tag` | Tag editor | IPC | Schema/client | — | `OPEN` | No WinUI tag editor |
| `get_tags_for_path` | Per-file tags | IPC | Schema/client | Properties | `MANUAL` |
| `set_tags_for_path` | Apply label | Tag picker | Workspace `SetColorLabelAsync` | Set / clear label | `MANUAL` |
| `get_files_with_tag` | Filter by label | IPC | Schema/client | — | `OPEN` | No filter-by-label UI |
| `get_all_file_tags` | Color dots | Loaded; **no list dots** | Workspace load | — | `OPEN` |
| `get_db_setting` | Settings KV | Settings dialog | Workspace restore test | Change theme; relaunch | `PASS` |
| `set_db_setting` | Persist settings | Settings save | Workspace save | Same | `PASS` |
| `get_app_version` | Updates tab | Settings | Settings load | Settings → Updates | `MANUAL` |
| `get_app_about_info` | About | Settings About + dialog | IPC | About panel | `MANUAL` |
| `check_for_update` | Check updates | Settings Updates | IPC (may stub) | Check for updates | `MANUAL` |
| `install_update` | Install + restart handshake | Settings install | IPC + `update-chunk` | Only on a signed build | `MANUAL` |

---

## 3. Events

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `file-change` | Watcher refresh | MainWindow subscription | Client `On<T>` | External create/delete | `MANUAL` |
| `operation-progress` | Copy/move/cleanup/dup | Progress panel | `FileOperationServiceTests` | Watch bar + cancel | `PASS` |
| `search-results-batch` | Incremental search | Search box batches | Client | Search streams rows | `MANUAL` |
| `search-complete` | Count notification | Status text | Client complete callback | Search finishes | `PASS` |
| `update-chunk` | Updater download | Settings install progress | Client `On<long[]>` | Install update | `MANUAL` |
| `list_directory.chunk` | First-chunk paint | Workspace progressive list | `ExplorerWorkspaceTests` | Huge folder | `PASS` |
| `operation-complete` | Unused typed event | Must **not** invent | Schema `typedNotEmitted` | — | `WAIVED` |
| `operation-error` | Unused typed event | Must **not** invent | Schema `typedNotEmitted` | — | `WAIVED` |
| `tauri://drag-*` | OS drag | WinUI `DragOver`/`Drop` | `DropDestination` tests | Drop files from Explorer | `PASS` |

---

## 4. Navigation, tabs, sidebar

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `nav.home-start` | Start at home | `ResolveStartPath` | `ExplorerWorkspaceTests` | Cold start | `PASS` |
| `nav.start-last` | `startLocation=last` | Settings + `LastPath` | `ResolveStartPath` unit | Set Last; relaunch | `MANUAL` |
| `nav.start-custom` | Custom start path | Settings + picker | `ResolveStartPath` unit | Set custom; relaunch | `MANUAL` |
| `nav.quick-access` | Home/Desktop/Downloads/Documents/Pictures | Sidebar list | Workspace constants | Click each | `PASS` |
| `nav.drives` | My PC + refresh | Drive list + ↻ | `RefreshDrives` tests | Refresh; offline retry | `PASS` |
| `nav.tree` | Expandable folder tree | **Not in XAML** | — | — | `OPEN` |
| `nav.breadcrumbs` | Click segments | `BreadcrumbBuilder` | `BreadcrumbBuilderTests` | Click crumb | `PASS` |
| `nav.path-edit` | Ctrl+L / Alt+D / Enter / Escape | Path box | — | Edit path | `MANUAL` |
| `nav.history` | Back/forward per pane | History stack | `ExplorerWorkspaceTests` | Alt+Left/Right | `PASS` |
| `nav.up` | Parent; no-op on root | `GoUpAsync` | `GoUp` test | Alt+Up at `C:\` | `PASS` |
| `nav.open-folder` | Double-click / Enter folder | `OpenEntryAsync` | Workspace tests | Open folder | `PASS` |
| `nav.open-archive-folder` | Zip as folder | `IsSupportedArchivePath` | `OpenArchiveFile_NavigatesIntoArchive` | Open zip | `PASS` |
| `nav.dual-pane` | F6; first enable copies path | `ToggleDualPaneAsync` | `DualPaneAndTabsTests` | F6 twice | `PASS` |
| `nav.pane-activate` | Click / Alt+1/2 / Ctrl+Shift+Left/Right | `ActivatePane` | Dual-pane tests | Switch panes | `PASS` |
| `nav.pane-tab` | Tab switches panes when not in text | `OnRootPreviewKeyDown` | — | Tab in dual | `MANUAL` |
| `nav.pane-resize` | 20–80% divider | Divider handlers | — | Drag divider | `MANUAL` |
| `nav.sidebar-target` | Left/Right follows active | `SidebarTarget` | Dual-pane tests | Dual + Desktop on right | `PASS` |
| `nav.tabs` | Per-pane tabs Ctrl+T/W/Tab | `FileTab` | `DualPaneAndTabsTests` | New/close/cycle | `PASS` |
| `nav.tabs-middle` | Middle-click close | Pointer handler | — | Middle-click tab | `MANUAL` |
| `nav.tabs-arrows` | Arrow wrap on tab | `OnTabKeyDown` | — | Focus tab; Left/Right | `MANUAL` |
| `nav.tabs-persist` | Restore workspace | `workspace-layout` IPC | `Initialize_RestoresSavedWorkspaceLayoutFromIpcSettings` | Relaunch after tabs | `PASS` |
| `nav.sidebar-collapse` | Persist Quick Access / My PC | Settings keys | Save/load settings | Collapse; relaunch | `MANUAL` |
| `nav.bookmarks` | Bookmark list | **No UI** | — | — | `OPEN` |
| `nav.recents` | Recent locations | Setting exists; **no list** | — | — | `OPEN` |
| `nav.network-retry` | Offline drive dialog | `PendingReconnect` | Workspace test | Offline mapped drive | `MANUAL` |

---

## 5. Lists, selection, columns, preview

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `list.hide-dot` | Hide `.` files by default | `ShowHiddenFiles` | `EntryPresentationTests` | Toggle show hidden | `PASS` |
| `list.sort` | Dirs-first; name/size/date/type | Header clicks | `EntryPresentationTests` | Click headers | `PASS` |
| `list.columns-default` | Name, Size, Modified, Type | Header + `FileRowView` | `ColumnLayout` tests | — | `PASS` |
| `list.columns-resize` | Drag header thumbs | `ColumnLayout.Resize` | Clamp/preset tests | Drag thumbs | `PASS` |
| `list.columns-presets` | details/media/developer/photo | Core presets | `ColumnLayout` tests | — | `OPEN` | No column menu UI |
| `list.extra-columns` | items/git/extension/path/parent/symlink | Definitions only | — | — | `OPEN` |
| `list.multi-select` | Ctrl/Shift multi | `ListView` Multiple | — | Ctrl-click range | `MANUAL` |
| `list.marquee` | Rubber-band | **Not ported** | Svelte `check:marquee-selection` only | — | `OPEN` |
| `list.typeahead` | Type-to-select | **Not ported** | — | — | `OPEN` |
| `list.quick-filter` | Filter box | `SetFilterQuery` | Presentation filter tests | Type in filter | `PASS` |
| `list.cut-dim` | Cut items dim | `FileRow.IsCut` | — | Cut; see opacity | `MANUAL` |
| `list.virtualize` | Huge folders | WinUI `ListView` default | — | Folder with 20k files | `MANUAL` |
| `list.thumbs` | Grid/list thumbs | **Not in list** | — | — | `OPEN` |
| `list.folder-sizes` | Passive sizes/counts | Setting exists; **no list metrics** | — | — | `OPEN` |
| `list.grid-photo` | Auto grid for photo folders | **List only** | — | — | `OPEN` |
| `preview.pane` | Side preview | Preview column | — | Select file | `MANUAL` |
| `preview.toggle` | Hide/show preview | Preview button | — | Toggle | `MANUAL` |
| `preview.quicklook` | Space | `ShowQuickLookAsync` | — | Space | `MANUAL` |
| `preview.markdown-html` | Sanitized markdown HTML | WinUI shows text/image, not HTML | Svelte `check:markdown-preview-safety` remains | — | `WAIVED` | Do not render unsanitized HTML; if HTML preview is added, this becomes `OPEN` |
| `preview.modal-html` | Modal HTML sinks | Native XAML dialogs | Svelte `check:html-sink-safety` remains | — | `WAIVED` | No `innerHTML` in WinUI |

---

## 6. File operations and progress

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `ops.new-folder` | Name prompt + validation | Dialog | FileOps tests | Ctrl+Shift+N | `PASS` |
| `ops.new-file` | Name prompt | Dialog | FileOps tests | Ctrl+N | `PASS` |
| `ops.rename` | F2 | Dialog | FileOps tests | F2 | `PASS` |
| `ops.advanced-rename` | Full templates/filters/numbering | Prefix/suffix/number only | — | — | `OPEN` | Partial vs Svelte AdvancedRename |
| `ops.delete-confirm` | Confirm setting | Settings + dialog | — | Toggle confirm | `MANUAL` |
| `ops.clipboard` | Copy/cut/paste | `ClipboardState` | `ClipboardStateTests` | Ctrl+C/X/V | `PASS` |
| `ops.copy-path` | Ctrl+Shift+C | System clipboard | — | Paste path in Notepad | `MANUAL` |
| `ops.conflict` | Probe + Skip/Replace/Keep Both | `ConflictDialog` + `DropDestination` | `DropDestination` tests | Paste onto existing name | `MANUAL` |
| `ops.progress` | Modal + cancel | `ProgressPanel` | FileOps progress | Large copy | `MANUAL` |
| `ops.escape-progress` | Escape hides UI, no cancel | Escape stack | — | Escape during copy | `MANUAL` |
| `ops.copy-to-pane` | Ctrl+Alt+C | `CopyOrMoveToOtherPaneAsync` | Context ID test | Dual-pane copy | `MANUAL` |
| `ops.move-to-pane` | Ctrl+Alt+M | Same | Context ID test | Dual-pane move | `MANUAL` |
| `ops.pack` | Pack into folder | `PackIntoFolderAsync` | — | Pack selection | `MANUAL` |
| `ops.unpack` | Unpack folder | `UnpackFolderAsync` | — | Unpack a folder | `MANUAL` |
| `ops.undo` | Ctrl+Z copy/move | `UndoStack` | `DesktopPolishTests` | Undo paste | `PASS` |
| `ops.redo` | Ctrl+Y / Ctrl+Shift+Z | `UndoStack` | Same | Redo | `PASS` |
| `ops.op-history` | Full retry log | Description list only | History property | Palette → Operation History | `OPEN` | No retry payloads |
| `ops.clipboard-history` | Ctrl+Shift+V | Status dump only | Catalog ID | — | `OPEN` |
| `ops.drop-internal` | Intra-app move/copy | Drag handlers | `DropDestination` | Drag between panes | `MANUAL` |
| `ops.drop-external` | OS drop copies in | `StorageItems` | `DropDestination` | Drop from Explorer | `MANUAL` |
| `ops.archive-aware-io` | Copy/move inside archive VFS | Service/core | Core tests via Rust | Copy inside zip | `MANUAL` |

---

## 7. Command palette, menus, shortcuts, chrome

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `ui.command-palette` | Ctrl+Shift+P | Overlay + `AppCommandCatalog` | `DesktopPolishTests` | Open; run Refresh | `PASS` |
| `go-home` | Palette Go Home | Catalog + handler | Catalog test | — | `PASS` |
| `refresh` | Palette/F5 | Handler | Catalog | F5 | `PASS` |
| `copy` `cut` `paste` | Palette clipboard | Handlers | Catalog + clipboard tests | — | `PASS` |
| `clipboard-history` | Palette | Incomplete | Catalog ID present | — | `OPEN` |
| `operation-history` | Palette | Incomplete | Catalog ID present | — | `OPEN` |
| `undo` `redo` | Palette | Undo stack | Tests | — | `PASS` |
| `delete` `rename` `new-folder` `new-file` | Palette | Dialogs | Catalog | — | `PASS` |
| `advanced-rename` | Palette | Partial dialog | Catalog | — | `OPEN` |
| `create-archive` | Palette | Dialog | Catalog | — | `MANUAL` |
| `terminal` | Palette / F4 | IPC | Catalog | F4 | `MANUAL` |
| `preview` | Toggle preview | Handler | Catalog | — | `MANUAL` |
| `dual-pane` | Toggle | Handler | Dual-pane tests | F6 | `PASS` |
| `search` | Focus search | Handler | Catalog | Ctrl+F | `MANUAL` |
| `quick-look` | Space | Handler | Catalog | Space | `MANUAL` |
| `properties` | Properties | Dialog | Catalog | — | `MANUAL` |
| `color-label` | Tag picker | Dialog | Catalog | — | `MANUAL` |
| `folder-metrics` | Metrics | Dialog | Catalog | — | `MANUAL` |
| `disk-cleanup` | Cleanup | Dialog | Catalog | — | `MANUAL` |
| `duplicate-checker` | Duplicates | Dialog | Catalog | — | `MANUAL` |
| `settings` | Settings | Dialog | Catalog | Ctrl+Shift+S | `MANUAL` |
| `keyboard-help` | F1 | Dialog | Catalog + shortcut map | F1 | `PASS` |
| `git-pull` `git-push` | Palette | IPC | Catalog | — | `MANUAL` |
| `ctx-open` | Context Open | `ContextMenuBuilder` | `DesktopPolishTests` | Right-click | `PASS` |
| `ctx-open-with` | Open With | Builder | Same | — | `PASS` |
| `ctx-preview` | Quick Look | Builder | Same | — | `PASS` |
| `ctx-compare` | Compare | Builder | Same | Two files | `PASS` |
| `ctx-terminal` | Terminal | Builder | Same | — | `PASS` |
| `ctx-powershell-admin` | Admin PS | Builder | Same | — | `PASS` |
| `ctx-color-label` | Color label | Builder | Same | — | `PASS` |
| `ctx-folder-metrics` | Metrics | Builder | Same | — | `PASS` |
| `ctx-cleanup` | Cleanup | Builder | Same | — | `PASS` |
| `ctx-duplicates` | Duplicates | Builder | Same | — | `PASS` |
| `ctx-rename` | Rename | Builder | Same | — | `PASS` |
| `ctx-advanced-rename` | Advanced rename | Builder | Same | — | `PASS` |
| `ctx-copy` `ctx-cut` `ctx-paste` | Clipboard | Builder | Same | — | `PASS` |
| `ctx-copy-to-pane` `ctx-move-to-pane` | Other pane | Builder | Same | Dual pane | `PASS` |
| `ctx-pack` `ctx-unpack` | Pack/unpack | Builder | Same | — | `PASS` |
| `ctx-compress` | Compress | Builder | Same | — | `PASS` |
| `ctx-extract-menu` `ctx-extract` `ctx-extract-folder` `ctx-extract-to` | Extract menu | Builder | Same | Archive | `PASS` |
| `ctx-delete` | Delete | Builder | Same | — | `PASS` |
| `ctx-info` | Properties | Builder | Same | — | `PASS` |
| `keys.path.focus` | Ctrl+L / Alt+D | Accelerators | `KeyboardShortcutMap` | Focus path | `PASS` |
| `keys.nav` | Alt+arrows, Backspace, F5 | Accelerators | Shortcut map | — | `PASS` |
| `keys.file` | F2 Del Shift+Del Ctrl+C/X/V/N | Accelerators | Shortcut map | — | `PASS` |
| `keys.tabs` | Ctrl+T/W/Tab | Accelerators | Dual-pane tests | — | `PASS` |
| `keys.panes` | F6 Alt+1/2 Ctrl+Alt+C/M | Accelerators | Dual-pane tests | — | `PASS` |
| `keys.escape-order` | Full overlay stack | Partial (palette, path, progress hide, search, filter, selection) | — | Escape through each overlay | `MANUAL` |
| `keys.help.ctrl` | Ctrl+? | **Not bound** | — | — | `OPEN` |
| `keys.shortcut-overrides` | Settings remaps | Map supports overrides; **no editor** | `ApplyOverrides` test | — | `OPEN` |
| `ui.theme` | Dark/light | ThemeDictionaries + settings | NormalizeTheme test | Switch theme | `MANUAL` |
| `ui.status` | Count / selection size / path | `StatusBarFormatter` | Formatter tests | Select files | `PASS` |
| `ui.empty-loading` | Empty / loading overlays | `UpdateEmptyStates` | — | Empty folder | `MANUAL` |
| `ui.a11y` | Automation names | XAML + tab/crumb names | — | Inspect with Accessibility Insights | `MANUAL` |
| `ui.window` | 1200×800 title | `MainWindow` ctor | Smoke title | — | `PASS` |

---

## 8. Settings, persistence, updater, packaging

| ID | Feature | WinUI verification | Automated | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| `set.theme` | Theme | Settings Appearance | Save/load | — | `MANUAL` |
| `set.showHidden` | Hidden files | Toggle | Workspace `SetShowHidden` | — | `PASS` |
| `set.useTrash` `set.confirmDelete` | Delete behavior | Settings Behavior | Settings apply | — | `MANUAL` |
| `set.startLocation` | home/last/custom | Settings Navigation | `ResolveStartPath` | — | `PASS` |
| `set.openInNewTab` | Open in tab | Setting persisted; **nav ignores** | Save/load | — | `OPEN` |
| `set.enableGit` | Git integration | Setting persisted; **no column** | Save/load | — | `OPEN` |
| `set.showFolderSizes` | Folder sizes | Setting persisted; **no list sizes** | Save/load | — | `OPEN` |
| `set.columnPreset` | Column preset | Core only | `ColumnLayout` | — | `OPEN` |
| `persist.workspace` | Tabs/dual/sort | `workspace-layout` | Restore test | Relaunch | `PASS` |
| `persist.appdata` | `%APPDATA%\com.simplefile.desktop` | Service `Host::app_data_dir` | Rust/service | Tags survive | `PASS` |
| `persist.startup-log` | `%LOCALAPPDATA%\SimpleFile\startup.log` | App crash log + service panic | Crash path exists | Force a parse error | `PASS` |
| `upd.latest-json` | Tauri `latest.json` | Unchanged | `check:updater` | — | `PASS` |
| `upd.latest-winui` | `latest-winui.json` | `write-latest-winui.mjs` | `check:winui-packaging` | — | `PASS` |
| `pkg.tauri` | NSIS/MSI/portable/`latest.json` | Existing scripts | `check:workflows` | `smoke:release` / msi / installer | `PASS` |
| `pkg.winui-portable` | `x64-winui-portable.zip` | `build-winui-release.ps1` | Packaging check + `smoke:winui` | Unzip and launch | `PASS` |
| `pkg.winui-nsis` | `x64-winui-setup.exe` | NSIS script | Packaging check | `smoke:winui-installer` on CI | `MANUAL` |
| `pkg.winui-msi` | `x64-winui.msi` | WiX `Product.wxs` | Packaging check | `smoke:winui-msi` on CI | `MANUAL` |
| `pkg.legacy-keep` | Do not delete Tauri packagers | `build-release.ps1` still Tauri | `check-winui-packaging` | — | `PASS` |

---

## 9. Automated check matrix

| Check | What it gates |
| --- | --- |
| `npm run check:winui-parity-gate` | This file lists every handler, ctx id, palette id, and a status |
| `npm run check:ipc-schema` | 74 commands + events vs Rust/Svelte/C# |
| `npm run check:invokes` / `check:api-parity` | Svelte still matches `generate_handler!` |
| `frontend` stage 3–11 checks | Svelte chrome still has toolbar/menu/search/transfer/nav contracts |
| `npm run check:winui` | xUnit: workspace, dual-pane, IPC, file ops, polish |
| `npm run check:winui-packaging` | NSIS/WiX/scripts/workflows dual-stack |
| `npm run check:updater` / `check:workflows` | Tauri updater + both artifact families |
| `npm run check:rust` | Core/service/Tauri tests + clippy |
| `npm run smoke:winui` | Payload exe title + service process |
| `npm run smoke:winui-msi` / `smoke:winui-installer` | Installer extract/install (CI) |
| Legacy `smoke:release` / `smoke:msi` / `smoke:installer` | Tauri artifacts still work |

---

## 10. Manual smoke script (required before retirement)

Use a clean folder with mixed files (txt, png, zip), a git repo, and a large folder if possible.

1. Launch `dist\winui\payload\SimpleFile.exe`. Title is **SimpleFile - File Explorer**. Home lists.
2. Quick Access: Desktop, Downloads, Documents, Pictures, Home.
3. Breadcrumb click; path edit Enter/Escape; Up at drive root is a no-op.
4. F6 dual pane; Alt+2; sidebar Desktop opens on the **right** only.
5. Ctrl+T / Ctrl+Tab / Ctrl+W / middle-click tab; relaunch restores tabs.
6. Multi-select, copy, paste, conflict Skip/Replace/Keep Both, Undo/Redo.
7. Delete (trash) and Shift+Delete; confirm setting off/on.
8. Drag between panes (move) and Ctrl-drag (copy); drop from Explorer (copy).
9. Search current folder; cancel; Escape clears search.
10. Right-click: Open, Open With, Quick Look, Compress, Extract, Pack, tags.
11. Preview pane: text, image, checksums, compare two files.
12. Settings: theme light/dark, show hidden, start last/custom, RAR status, check updates (expect stub or GitHub result).
13. Smart folder: open and delete an existing one (save is `OPEN`).
14. F4 terminal; F1 help; Ctrl+Shift+P command palette.
15. Watcher: create a file in Explorer; list refreshes.
16. Close app; confirm `simplefile-service` exits.

---

## Retirement lock

**Do not delete** `frontend/`, `src-tauri/` Tauri glue, or Tauri release scripts while any required row is `OPEN` or unverified `MANUAL`.

Current **OPEN** blockers (not waived):

- `list_subdirectories` tree UI
- `generate_thumbnails` list thumbs; folder size/count columns
- `get_git_file_statuses` git column; `set.enableGit`
- Tag editor / filter-by-label / list color dots
- `save_smart_folder` UI
- Bookmarks and recents lists
- `marquee` selection, type-ahead, grid/photo view, extra columns/presets
- Full advanced rename; clipboard history; operation-history retry
- `openInNewTab` / `showFolderSizes` behavior
- `keys.help.ctrl` and shortcut-override editor

A retirement PR must flip this document to **zero required `OPEN`**, attach smoke notes for remaining `MANUAL` rows, and keep this file in the same PR.

Gate check: `npm run check:winui-parity-gate`.
