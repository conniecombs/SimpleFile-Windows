# Code Analysis

SimpleFile is split across a WinUI 3 host and a Rust IPC service.

## UI host

- `src-winui/SimpleFile.App` is the unpackaged explorer window.
- `src-winui/SimpleFile.Core` owns workspace, menus, transfers, search, and settings.
- `src-winui/SimpleFile.Ipc` is the length-prefixed named-pipe JSON-RPC client.
- `src-winui/SimpleFile.Tests` covers navigation, IPC, transfers, and polish.

## Backend

- `crates/simplefile-service` is the shipping named-pipe process.
- `crates/simplefile-core` holds reusable filesystem, archive, preview, and settings domain.
- `crates/simplefile-ipc` holds framing, protocol constants, and schema tests.
- Leftover `src-tauri/src` modules remain until tags, smart folders, git,
  cleanup, terminal, RAR, and db live solely in `simplefile-core`.

## Important Contracts

- Every domain command must appear in `ipc/schema/v1/commands.json` and
  `src-winui/SimpleFile.Ipc/Protocol.cs`.
- Folder navigation must keep directory intent until it reaches the in-app open path.
- Mapped network drives are normal Windows filesystem entries and must remain visible in drive listing.
