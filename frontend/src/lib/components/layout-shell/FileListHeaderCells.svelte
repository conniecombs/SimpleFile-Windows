<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte.js';

  export type FileListHeaderColumn = {
    className?: string;
    id: string;
    label: string;
    resizable?: boolean;
    sort: string;
  };

  type Props = {
    columns?: FileListHeaderColumn[];
    pane?: 'primary' | 'secondary';
  };

  const columnDefinitions: FileListHeaderColumn[] = [
    { className: 'name-col', id: 'name', label: 'Name', sort: 'name' },
    { className: 'size-col', id: 'size', label: 'Size', sort: 'size' },
    { className: 'items-col', id: 'items', label: 'Items', sort: 'items' },
    { className: 'date-col', id: 'date', label: 'Modified', sort: 'modified' },
    { className: 'type-col', id: 'type', label: 'Type', sort: 'type' },
  ];

  let { columns = undefined, pane = 'primary' }: Props = $props();

  let visibleColumns = $derived(appState.settings?.visibleColumns || ['size', 'date', 'type']);
  let displayColumns = $derived.by(() => (
    columns || columnDefinitions.filter((column) => column.id === 'name' || visibleColumns.includes(column.id))
  ));

  function getColumnClass(column: FileListHeaderColumn) {
    return column.className || `${column.id}-col`;
  }

  function emitSort(event: MouseEvent | KeyboardEvent, column: FileListHeaderColumn) {
    event.currentTarget?.dispatchEvent(new CustomEvent('simplefile:file-list-sort', {
      bubbles: true,
      detail: {
        pane,
        sort: column.sort,
      },
    }));
  }

  function handleKeydown(event: KeyboardEvent, column: FileListHeaderColumn) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    emitSort(event, column);
  }
</script>

{#each displayColumns as column, index}
  {@const nextColumn = displayColumns[index + 1]}
  <div
    class={`header-cell ${getColumnClass(column)} sortable`}
    data-column={column.id}
    data-sort={column.sort}
    data-pane={pane}
    role="columnheader"
    aria-sort="none"
    tabindex="0"
    onclick={(event) => emitSort(event, column)}
    onkeydown={(event) => handleKeydown(event, column)}
  >
    <span>{column.label}</span>
    <span class="sort-indicator" aria-hidden="true"></span>
    {#if nextColumn && column.resizable !== false}
      <button
        type="button"
        class="column-resize-handle"
        data-column-resize={column.id}
        aria-label={`Resize ${column.label} column`}
      ></button>
    {/if}
  </div>
{/each}
