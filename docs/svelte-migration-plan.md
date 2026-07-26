# Svelte Migration Plan

SimpleFile's shipping frontend has completed its Svelte/Vite migration. This
document now records the current ownership boundaries and the checks that keep
the old layout from returning.

## Current Checkpoint

The desktop app ships from `frontend/src/main.ts`. That entry mounts
`frontend/src/App.svelte`, loads the shared CSS bundle, and renders the
Svelte-owned shell. Tauri points at `../frontend/dist`, and its dev/build hooks
run `npm --prefix frontend run build` before packaging or desktop launch.

The Svelte migration is complete for the shipping frontend.

## Active Boundaries

- `frontend/src/lib/components/` owns Svelte-rendered shell and surface
  components.
- `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, and
  `frontend/src/lib/tauri.ts` own the typed Tauri API boundary.
- `frontend/src/lib/` owns workflow modules, provider plugins, and mount
  helpers used by the Svelte shell.
- `frontend/src/lib/components/OverlayShell.svelte` owns the remaining overlay
  hosts with stable DOM IDs for workflows that still need concrete targets.
- `frontend/src/vanilla-js/runtime/` is the clearly defined home for typed
  runtime helpers imported by Svelte.
- `frontend/scripts/` and root `scripts/` contain Node/PowerShell tooling only;
  they are not runtime frontend modules.

## Retired Paths

These paths are retired and must not regain ownership:

- `svelte-frontend/`
- `frontend/js/`
- `frontend/src/legacy/`
- `frontend/src/lib/state.svelte`
- `frontend/src/lib/components/js/`
- `frontend/src/lib/components/legacy-overlays.ts`
- `frontend/src/lib/components/legacy-shell-template.html`
- `frontend/src/vanilla-js/generated-svelte/`
- `../svelte-frontend/dist`

The old one-shot `frontend/scripts/migrate-components.ps1` script is also
retired. It remains as a guard that fails immediately if someone tries to run
it; it must not move, delete, or rewrite source files.

## Completed Migration Slices

1. Svelte entry and typed API boundary. Done:
   The shipping bootstrap, API wrappers, command contracts, and local Tauri
   fallback are under `frontend/src`.
2. Shell and visible rendering ownership. Done:
   The app shell, toolbar, sidebar, tabs, breadcrumbs, file lists, tree view,
   preview panes, modals, settings body, context menus, archive surfaces, and
   search, transfer, archive, settings, and local navigation surfaces are Svelte-rendered.
3. File navigation workflow retirement. Done:
   File navigation behavior is routed through focused workflow modules under
   `frontend/src/lib`, while Svelte components emit stable interaction events.
4. Dialog and command workflow retirement. Done:
   Generic modal bodies, settings panels, command/help/about surfaces, archive
   dialogs, properties/open-with/tag flows, and local command actions are split
   from the old monolithic frontend controller.
5. Search and transfer workflow retirement. Done:
   Search, transfer queue actions, dual-pane transfer helpers, and local
   navigation behavior live behind Svelte-side workflow and component
   boundaries.
6. Legacy event and DOM bridge removal. Done:
   Svelte surfaces emit stable custom events for file-list, tree, tab,
   breadcrumb, toolbar, search, and drag/drop interactions.
   Compatibility overlay IDs now live in native `OverlayShell.svelte` markup
   where older action code still needs a concrete DOM host.
7. Final cleanup and release verification. Done:
   Tauri builds `../frontend/dist`; typed runtime helpers are consolidated
   under `frontend/src/vanilla-js/runtime`; generated audit bundles are retired;
   stale source paths are guarded by migration and behavior-bridge checks.

## Safety Rules

- Keep `src-tauri/tauri.conf.json` pointed at `../frontend/dist`.
- Put new Svelte components under `frontend/src/lib/components/`.
- Put new frontend workflow/provider modules under `frontend/src/lib/`.
- Put typed runtime helpers under
  `frontend/src/vanilla-js/runtime/`.
- Add or update typed Tauri wrappers in `frontend/src/lib/api.ts` and command
  contracts in `frontend/src/lib/types.ts`; Svelte components should not call
  raw `invoke()` directly.
- Keep `app.withGlobalTauri` disabled in `src-tauri/tauri.conf.json`; active
  frontend code should not use the global `__TAURI__` API or import Tauri APIs
  outside `frontend/src/lib/tauri.ts`.
- Route shared modal HTML through `frontend/src/lib/modalHtmlSecurity.mjs`
  before DOM insertion or Svelte `{@html}` rendering.
- Do not restore retired folders or script references.

## Checks

Run the frontend migration and bridge gates from the repository root:

```powershell
npm --prefix frontend run check:migration
npm --prefix frontend run check:behavior-bridges
```

Run the complete frontend gate:

```powershell
npm --prefix frontend run check
```

Run the complete repository gate:

```powershell
npm run check
```

For release-level steps, run:

```powershell
npm run check:release
```

That expands to the frontend gates plus Rust formatting, tests, Clippy, and the
security audit. On Windows, Rust tests and release builds require the MSVC
linker (`link.exe`) and Windows SDK Resource Compiler (`rc.exe`) to be
available on `PATH`.
