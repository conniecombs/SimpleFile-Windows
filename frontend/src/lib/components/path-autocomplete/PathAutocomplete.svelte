<script module lang="ts">
  export type PathAutocompleteItem = {
    name: string;
    path: string;
  };
</script>

<script lang="ts">
  let {
    items = [],
    onChoose = undefined,
    onDismiss = undefined,
    separator = '/',
  }: {
    items?: PathAutocompleteItem[];
    onChoose?: (path: string) => void;
    onDismiss?: () => void;
    separator?: string;
  } = $props();

  let rootElement: HTMLDivElement | undefined = $state();

  function withTrailingSeparator(path: string) {
    return path.endsWith('/') || path.endsWith('\\') ? path : `${path}${separator}`;
  }

  function choose(path: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    onChoose?.(withTrailingSeparator(path));
  }

  function optionElements() {
    return Array.from(rootElement?.querySelectorAll<HTMLElement>('.autocomplete-item') ?? []);
  }

  function focusByOffset(offset: number) {
    const options = optionElements();
    if (options.length === 0) {
      return;
    }

    const currentIndex = options.findIndex((option) => option === document.activeElement);
    const nextIndex = currentIndex === -1
      ? (offset > 0 ? 0 : options.length - 1)
      : (currentIndex + offset + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  function focusEdge(edge: 'first' | 'last') {
    const options = optionElements();
    const target = edge === 'first' ? options[0] : options[options.length - 1];
    target?.focus();
  }

  function activeOption() {
    const active = document.activeElement;
    return active instanceof HTMLElement ? active.closest<HTMLElement>('.autocomplete-item') : null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      focusByOffset(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      focusByOffset(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      focusEdge('first');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      focusEdge('last');
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      const option = activeOption();
      const path = option?.dataset.path;
      if (!path) {
        return;
      }

      choose(path, event);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onDismiss?.();
    }
  }
</script>

<div bind:this={rootElement} class="path-autocomplete-items">
  {#each items as item (item.path)}
    <div
      class="autocomplete-item"
      data-path={item.path}
      aria-selected="false"
      role="option"
      tabindex="-1"
      title={item.path}
      onkeydown={handleKeydown}
      onmousedown={(event) => choose(item.path, event)}
    >
      <span class="autocomplete-icon" aria-hidden="true">&#128193;</span>
      <span class="autocomplete-name">{item.name}</span>
    </div>
  {/each}
</div>
