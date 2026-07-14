# Linux Native File Manager Implementation Plan

This plan outlines the steps necessary to elevate SimpleFile from a standard Tauri desktop app into a first-class citizen of the Linux Desktop Environment, capable of being set as the default file manager.

## Options

Please select how deep you want the native integration to go:

**Option 1: The Basics (Phase 1 Only)**
Focuses on making the app usable as the default system file manager. Handles `.desktop` registration, single-instance window routing, and dynamic XDG base directories.

**Option 2: Full Native Experience (Phase 1 & 2)**
Adds essential Linux-specific filesystem features, including a permissions editor (`chmod`/`chown`) and integration with the system's shared thumbnail cache.

**Option 3: The Complete Desktop Bridge (Phases 1, 2, & 3)**
The ultimate integration. Adds complex D-Bus bindings for instant USB hotplug detection (`udisks2`) and tackles outward native drag-and-drop. *(Note: Phase 3 is highly complex and may require unstable GTK workarounds).*

---

## Phase 1: Foundations & System Integration

### System Registration (`.desktop`)
#### [MODIFY] [tauri.conf.json](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/tauri.conf.json)
- Add `bundle.linux` configuration to generate a proper `.desktop` file.
- Register the `inode/directory` MIME type so the OS knows SimpleFile can handle opening folders.

### Single-Instance & Routing
#### [MODIFY] [Cargo.toml](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/Cargo.toml) & [lib.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/lib.rs)
- Add `tauri-plugin-single-instance`.
- Implement event forwarding so if a user runs `xdg-open ~/Downloads`, it sends the path to the already-running SimpleFile process instead of launching a new memory-heavy webview.

### XDG Base Directories
#### [MODIFY] [Cargo.toml](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/Cargo.toml) & [fs_ops.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/fs_ops.rs)
- Add the `directories` crate.
- Expose a `get_xdg_dirs` command to fetch the localized paths for Desktop, Documents, Downloads, Music, Pictures, and Videos.
#### [MODIFY] [tauri.ts](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/frontend/src/lib/tauri.ts) & [SidebarShell.svelte](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/frontend/src/lib/components/layout-shell/SidebarShell.svelte)
- Update the sidebar to use these dynamic XDG paths instead of hardcoded strings.

---

## Phase 2: Linux-Native Data Handling

### Permissions & Ownership UI
#### [MODIFY] [models.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/models.rs) & [fs_ops.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/fs_ops.rs)
- Extend `FileInfo` metadata to include UNIX `mode`, `uid`, and `gid`.
- Create `chmod_file` and `chown_file` Tauri commands using `std::os::unix::fs::PermissionsExt`.
#### [NEW] `PermissionsTab.svelte` (Frontend)
- Build a Properties dialogue tab exposing Read/Write/Execute toggles for Owner/Group/Others.

### Freedesktop Thumbnails
#### [MODIFY] [preview.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/preview.rs)
- Update thumbnail generation to follow the Freedesktop Thumbnail Managing Standard.
- Check `~/.cache/thumbnails/normal` before generating.
- Save newly generated thumbnails to the cache to share the workload with the rest of the OS.

---

## Phase 3: Advanced Integrations

### D-Bus Udisks2 Hotplugging
#### [NEW] [drives_dbus.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/drives_dbus.rs)
- Add the `zbus` crate.
- Subscribe to `org.freedesktop.UDisks2` signals to instantly detect when a USB drive is inserted or removed, pushing an event to the frontend sidebar to update immediately.

### Outward Native Drag-and-Drop
#### [MODIFY] [lib.rs](file:///home/vox/Desktop/Ramdisk/SimpleFile-Svelte/src-tauri/src/lib.rs)
- Investigate injecting GTK drag event handlers to bridge the webview's HTML5 drag events to the native X11/Wayland drag buffers, allowing users to drag files *out* of SimpleFile into other applications.

---

## Verification Plan

### Automated Tests
- Run `cargo check` and `npm run check:svelte` to ensure the new crates and frontend types compile cleanly.

### Manual Verification
- Validate the `.desktop` file integration using `xdg-mime default`.
- Launch a second instance from the terminal with a directory argument and verify it routes to the primary window.
- Verify XDG directories match `~/.config/user-dirs.dirs`.
