throw @'
The one-shot Svelte component migration script is retired.

The shipping app now lives under frontend/src, Tauri builds ../frontend/dist,
and plain JavaScript belongs under frontend/src/vanilla-js.

Use these gates instead:
  npm --prefix frontend run check:migration
  npm --prefix frontend run check:behavior-bridges
'@
