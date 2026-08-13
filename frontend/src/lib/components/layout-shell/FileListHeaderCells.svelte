<script lang="ts">
  import { saveSettings, state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import {
    clampFileListColumnWidth,
    columnDefinition,
    DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
    defaultFileListColumnWidth,
    normalizeVisibleColumns,
    type FileListColumnId,
  } from '../../fileListColumns';

  export type FileListHeaderColumn = {
    className?: string;
    id: FileListColumnId;
    label: string;
    resizable?: boolean;
    sort: string;
  };

  type Props = {
    columns?: FileListHeaderColumn[];
    pane?: 'primary' | 'secondary';
  };

  let { columns = undefined, pane = 'primary' }: Props = $props();

  let visibleColumns = $derived(appState.settings?.visibleColumns || DEFAULT_VISIBLE_FILE_LIST_COLUMNS);
  let displayColumns = $derived.by(() => (
    columns || (['name', ...normalizeVisibleColumns(visibleColumns)] as FileListColumnId[]).map((id): FileListHeaderColumn => {
      const definition = columnDefinition(id);
      return {
        className: `${id}-col`,
        id,
        label: definition.label,
        sort: definition.sort,
      };
    })
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

  function currentColumnWidth(column: FileListColumnId, element?: HTMLElement | null) {
    const renderedWidth = element?.closest<HTMLElement>('.header-cell')?.getBoundingClientRect().width || 0;
    if (renderedWidth > 0) {
      return renderedWidth;
    }
    return Number(appState.settings?.columnWidths?.[column] || defaultFileListColumnWidth(column));
  }

  function setColumnWidth(column: FileListColumnId, width: number) {
    appState.settings = {
      ...appState.settings,
      columnWidths: {
        ...appState.settings.columnWidths,
        [column]: clampFileListColumnWidth(column, width),
      },
    };
  }

  function emitAutoFit(event: Event, column: FileListHeaderColumn) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.dispatchEvent(new CustomEvent('simplefile:column-autofit', {
      bubbles: true,
      detail: {
        column: column.id,
        pane,
      },
    }));
  }

  function emitHeaderMenu(event: MouseEvent, column: FileListHeaderColumn) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.dispatchEvent(new CustomEvent('simplefile:column-header-menu', {
      bubbles: true,
      detail: {
        column: column.id,
        pane,
        x: event.clientX,
        y: event.clientY,
      },
    }));
  }

  function beginColumnResize(event: PointerEvent, column: FileListHeaderColumn) {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startWidth = currentColumnWidth(column.id, handle);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.classList.add('column-resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return;
      }
      setColumnWidth(column.id, startWidth + moveEvent.clientX - startX);
    };

    const stopResize = (upEvent?: Event) => {
      if (upEvent instanceof PointerEvent && upEvent.pointerId !== event.pointerId) {
        return;
      }
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', stopResize);
      document.removeEventListener('pointercancel', stopResize);
      window.removeEventListener('blur', stopResize);
      document.body.classList.remove('column-resizing');
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      saveSettings();
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', stopResize);
    document.addEventListener('pointercancel', stopResize);
    window.addEventListener('blur', stopResize);
  }

  function handleResizeKeydown(event: KeyboardEvent, column: FileListHeaderColumn) {
    const target = event.currentTarget as HTMLElement;
    const step = event.shiftKey ? 32 : 16;
    let nextWidth: number | null = null;

    if (event.key === 'ArrowLeft') {
      nextWidth = currentColumnWidth(column.id, target) - step;
    } else if (event.key === 'ArrowRight') {
      nextWidth = currentColumnWidth(column.id, target) + step;
    } else if (event.key === 'Home') {
      nextWidth = defaultFileListColumnWidth(column.id);
    } else if (event.key === 'Enter') {
      emitAutoFit(event, column);
      return;
    }

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setColumnWidth(column.id, nextWidth);
    saveSettings();
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
    oncontextmenu={(event) => emitHeaderMenu(event, column)}
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
        aria-keyshortcuts="ArrowLeft ArrowRight Home Enter"
        title={`Resize ${column.label} column`}
        onclick={(event) => event.stopPropagation()}
        ondblclick={(event) => emitAutoFit(event, column)}
        onkeydown={(event) => handleResizeKeydown(event, column)}
        onpointerdown={(event) => beginColumnResize(event, column)}
      ></button>
    {/if}
  </div>
{/each}
