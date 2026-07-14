<script lang="ts">
  import { onMount } from 'svelte';
  import { localState } from './lib/app/localState.svelte';
  import { legacyOverlayMarkup } from './lib/components/legacy-overlays';
  // Keep import for migration checks
  import { renderLayoutShell } from './lib/components/layout-shell';
  import { initApp } from './lib/app/setup';

  onMount(() => {
    // @ts-ignore
    window.renderLayoutShell = renderLayoutShell; // prevent unused import warning
    return initApp();
  });
</script>

<div
  bind:this={localState.appContainer}
  class="app-container"
  role="application"
  aria-label="SimpleFile File Explorer"
></div>

{@html legacyOverlayMarkup}
