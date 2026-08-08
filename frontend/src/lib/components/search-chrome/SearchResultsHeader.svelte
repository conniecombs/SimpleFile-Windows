<script lang="ts">
  let {
    clearLabel = 'Clear',
    saveLabel = 'Save Search',
    label = '',
    showSave = true,
    onClear = undefined,
    onSave = undefined,
  }: {
    clearLabel?: string;
    saveLabel?: string;
    label?: string;
    showSave?: boolean;
    onClear?: () => void;
    onSave?: () => void;
  } = $props();

  const SEARCH_RESULTS_CLEAR_EVENT = 'simplefile:search-results-clear';
  const SEARCH_RESULTS_SAVE_EVENT = 'simplefile:search-results-save';

  function handleClear(event: MouseEvent) {
    event.currentTarget?.dispatchEvent(new CustomEvent(SEARCH_RESULTS_CLEAR_EVENT, {
      bubbles: true,
    }));
    onClear?.();
  }

  function handleSave(event: MouseEvent) {
    // handled=true only when a parent callback owns the save path.
    event.currentTarget?.dispatchEvent(new CustomEvent(SEARCH_RESULTS_SAVE_EVENT, {
      bubbles: true,
      detail: { handled: Boolean(onSave) },
    }));
    onSave?.();
  }
</script>

<span class="search-results-count">{label}</span>
{#if showSave}
  <button class="btn btn-secondary btn-sm search-save-btn" type="button" onclick={handleSave}>
    {saveLabel}
  </button>
{/if}
<button class="btn btn-secondary btn-sm search-clear-btn" type="button" onclick={handleClear}>
  {clearLabel}
</button>
