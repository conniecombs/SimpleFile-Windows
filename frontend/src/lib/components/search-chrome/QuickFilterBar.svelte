<script lang="ts">
  let {
    initialCount = '',
    initialQuery = '',
    onClear = undefined,
    onInput = undefined,
  }: {
    initialCount?: string;
    initialQuery?: string;
    onClear?: () => void;
    onInput?: (query: string) => void;
  } = $props();

  let inputElement: HTMLInputElement | undefined = $state();
  let countText = $state('');
  let query = $state('');

  const QUICK_FILTER_CLEAR_EVENT = 'simplefile:quick-filter-clear';
  const QUICK_FILTER_INPUT_EVENT = 'simplefile:quick-filter-input';

  $effect(() => {
    countText = initialCount;
    query = initialQuery;
  });

  export function setCount(nextCount: string) {
    countText = nextCount;
  }

  export function setQuery(nextQuery: string) {
    query = nextQuery;
  }

  export function focusInput() {
    inputElement?.focus();
  }

  function emitQuickFilterEvent(type: string, event: Event, detail = {}) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail,
    }));
  }

  function handleInput(event: Event) {
    emitQuickFilterEvent(QUICK_FILTER_INPUT_EVENT, event, { query });
    onInput?.(query);
  }

  function handleClear(event: MouseEvent | KeyboardEvent) {
    emitQuickFilterEvent(QUICK_FILTER_CLEAR_EVENT, event);
    onClear?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      handleClear(event);
    }
  }
</script>

<span class="quick-filter-icon" aria-hidden="true">&#128270;</span>
<input
  bind:this={inputElement}
  bind:value={query}
  class="quick-filter-input"
  id="filter-input"
  placeholder="Filter files... (Escape to clear)"
  aria-label="Filter current directory"
  type="text"
  oninput={handleInput}
  onkeydown={handleKeydown}
/>
<span class="quick-filter-count" id="filter-count">{countText}</span>
<button
  class="quick-filter-clear"
  id="filter-clear"
  title="Clear filter (Escape)"
  aria-label="Clear filter"
  type="button"
  onclick={handleClear}
>
  &times;
</button>
