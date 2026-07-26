<script lang="ts">
  import { onMount } from 'svelte';
  import { localState } from './lib/app/localState.svelte';
  import OverlayShell from './lib/components/OverlayShell.svelte';
  import { initApp } from './lib/app/setup';

  onMount(() => {
    return initApp();
  });
</script>

<div
  bind:this={localState.appContainer}
  class="app-container"
  role="application"
  aria-label="SimpleFile File Explorer"
></div>

<OverlayShell />
