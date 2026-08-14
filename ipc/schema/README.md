# SimpleFile IPC schema (v1)

Versioned request, response, and event schemas for the WinUI ↔ Rust named-pipe JSON-RPC service.

`src-winui/SimpleFile.Ipc` now exists but only hosts handshake/health/version DTOs. This directory remains the full v1 contract. Do not generate the remaining 74 command DTOs until those methods are wired.

| File | Role |
| --- | --- |
| `v1/protocol.json` | Framing, versioning, error codes, handshake, cancellation, operation IDs |
| `v1/types.json` | Shared DTO field maps (wire names) |
| `v1/commands.json` | `ipc.handshake` plus the 74 existing Tauri command names |
| `v1/events.json` | Emitted events, typed-but-not-emitted names, host-only drag events |
| `v1/goldens/` | Checked-in request/response/event samples |

Validation:

- `npm run check:ipc-schema` compares these files to `src-tauri/src/lib.rs` and `frontend/src/lib/types.ts`
- `cargo test -p simplefile-ipc` loads the same JSON and asserts counts, casing, and golden keys
