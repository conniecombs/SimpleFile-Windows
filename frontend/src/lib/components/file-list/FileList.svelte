<script lang="ts">
  import { onMount } from 'svelte';
import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import { fileType, formatFileSize, formatModified } from '../../coreFileManager';
  import type { ColumnId, FileEntry } from '../../types';
  import FileListItems from './FileListItems.svelte';
  import type { FileListViewItem } from './FileListItems.svelte';

  let { pane = 'primary' }: { pane?: 'primary' | 'secondary' } = $props();

  const LIST_ROW_HEIGHT = 36;
  const LIST_OVERSCAN_ROWS = 10;
  const GRID_GAP = 12;
  const GRID_ITEM_EXTRA_HEIGHT = 56;
  const GRID_ITEM_EXTRA_WIDTH = 48;
  const GRID_OVERSCAN_ROWS = 3;

  let fileListElement: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let viewportWidth = $state(0);
  let previousPath = $state('');
  let measureFrame = 0;

  let visibleColumns = $derived(appState.settings?.visibleColumns || ['size', 'date', 'type']);
  let sourceEntries = $derived(
    pane === 'primary' ? appState.filteredEntries : (appState.secondaryFilteredEntries || []),
  );
  let selectedSet = $derived(
    pane === 'primary' ? appState.selectedEntries : (appState.secondarySelectedEntries || new Set()),
  );
  let iconSize = $derived(Number(appState.iconSize || appState.settings?.defaultIconSize || 64));
  let gridItemWidth = $derived(Math.max(96, iconSize + GRID_ITEM_EXTRA_WIDTH));
  let gridItemHeight = $derived(Math.max(96, iconSize + GRID_ITEM_EXTRA_HEIGHT));
  let gridColumnCount = $derived.by(() => {
    if (!appState.isGridView) {
      return 1;
    }

    const itemPitch = gridItemWidth + GRID_GAP;
    return Math.max(1, Math.floor((Math.max(1, viewportWidth) + GRID_GAP) / itemPitch));
  });
  let rowPitch = $derived(appState.isGridView ? gridItemHeight + GRID_GAP : LIST_ROW_HEIGHT);
  let virtualTotalSize = $derived.by(() => {
    if (sourceEntries.length === 0) {
      return 0;
    }

    if (appState.isGridView) {
      return Math.ceil(sourceEntries.length / gridColumnCount) * rowPitch;
    }

    return sourceEntries.length * LIST_ROW_HEIGHT;
  });
  let visibleRange = $derived.by(() => {
    const totalItems = sourceEntries.length;
    if (totalItems === 0) {
      return { end: 0, offset: 0, start: 0 };
    }

    if (appState.isGridView) {
      const totalRows = Math.ceil(totalItems / gridColumnCount);
      const visibleRows = viewportHeight > 0 ? Math.ceil(viewportHeight / rowPitch) : 12;
      const firstRow = Math.max(0, Math.floor(scrollTop / rowPitch) - GRID_OVERSCAN_ROWS);
      const endRow = Math.min(totalRows, firstRow + visibleRows + (GRID_OVERSCAN_ROWS * 2));
      return {
        end: Math.min(totalItems, endRow * gridColumnCount),
        offset: firstRow * rowPitch,
        start: Math.min(totalItems, firstRow * gridColumnCount),
      };
    }

    const visibleRows = viewportHeight > 0 ? Math.ceil(viewportHeight / LIST_ROW_HEIGHT) : 40;
    const start = Math.max(0, Math.floor(scrollTop / LIST_ROW_HEIGHT) - LIST_OVERSCAN_ROWS);
    return {
      end: Math.min(totalItems, start + visibleRows + (LIST_OVERSCAN_ROWS * 2)),
      offset: start * LIST_ROW_HEIGHT,
      start,
    };
  });

  type FileListColumnId = 'name' | ColumnId;

  function columnWidth(column: FileListColumnId) {
    const width = Number(appState.settings?.columnWidths?.[column] || 0);
    return width > 0 ? `${width}px` : `var(--col-${column}-width)`;
  }

  function fileListColumns() {
    return [
      columnWidth('name'),
      ...visibleColumns.map((column: ColumnId) => columnWidth(column)),
    ].join(' ');
  }

  function tagForPath(path: string) {
    const tag = appState.fileTags?.[path];
    if (!tag) return null;
    const label = tag.label || tag.name || 'Label';
    return {
      color: tag.color || '#64748b',
      emoji: tag.emoji || '\u25cf',
      label,
    };
  }

  function updateViewportMeasurements() {
    if (!fileListElement) {
      return;
    }

    viewportHeight = fileListElement.clientHeight;
    viewportWidth = fileListElement.clientWidth;
    scrollTop = fileListElement.scrollTop;
  }

  function queueViewportMeasurement() {
    if (measureFrame) {
      cancelAnimationFrame(measureFrame);
    }
    measureFrame = requestAnimationFrame(() => {
      measureFrame = 0;
      updateViewportMeasurements();
    });
  }

  function handleScroll(event: Event) {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }

  function scrollIndexIntoView(index: number) {
    if (!fileListElement || index < 0 || index >= sourceEntries.length) {
      return;
    }

    const columns = appState.isGridView ? gridColumnCount : 1;
    const itemTop = appState.isGridView
      ? Math.floor(index / columns) * rowPitch
      : index * LIST_ROW_HEIGHT;
    const itemBottom = itemTop + (appState.isGridView ? gridItemHeight : LIST_ROW_HEIGHT);
    const viewportTop = fileListElement.scrollTop;
    const viewportBottom = viewportTop + fileListElement.clientHeight;

    if (itemTop < viewportTop) {
      fileListElement.scrollTop = itemTop;
    } else if (itemBottom > viewportBottom) {
      fileListElement.scrollTop = Math.max(0, itemBottom - fileListElement.clientHeight);
    }
  }

  let displayItems = $derived.by(() => {
    return sourceEntries
      .slice(visibleRange.start, visibleRange.end)
      .map((entry: FileEntry, offset: number): FileListViewItem => {
        const i = visibleRange.start + offset;
        const folderSize = appState.folderSizes?.get(entry.path);
        const sizeText = entry.is_dir && typeof folderSize === 'number'
          ? formatFileSize(folderSize)
          : formatFileSize(entry.size, entry.is_dir);

        return {
          icon: entry.is_dir ? '\u{1f4c1}' : '\u{1f4c4}',
          index: i,
          isCut: false,
          isDir: entry.is_dir,
          isFocused: i === appState.focusedIndex && appState.activePane === pane,
          isImage: entry.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) !== null,
          isPdf: entry.name.toLowerCase().endsWith('.pdf'),
          isSelected: selectedSet.has(entry.path),
          isSymlink: entry.is_symlink,
          itemCount: entry.itemCount == null ? '' : String(entry.itemCount),
          git_status: entry.git_status || null,
          modified: formatModified(entry.modified),
          name: entry.name,
          path: entry.path,
          size: sizeText,
          tag: tagForPath(entry.path),
          type: fileType(entry),
        };
      });
  });

  onMount(() => {
    updateViewportMeasurements();
    const resizeObserver = new ResizeObserver(updateViewportMeasurements);
    if (fileListElement) {
      resizeObserver.observe(fileListElement);
    }
    window.addEventListener('resize', updateViewportMeasurements);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewportMeasurements);
      if (measureFrame) {
        cancelAnimationFrame(measureFrame);
      }
    };
  });

  $effect(() => {
    const currentPath = pane === 'primary' ? appState.currentPath : appState.secondaryPath;
    if (currentPath === previousPath) {
      return;
    }

    previousPath = currentPath;
    scrollTop = 0;
    if (fileListElement) {
      fileListElement.scrollTop = 0;
    }
  });

  $effect(() => {
    appState.isGridView;
    appState.iconSize;
    visibleColumns.join('|');
    queueViewportMeasurement();
  });

  $effect(() => {
    if (appState.activePane !== pane) {
      return;
    }

    scrollIndexIntoView(appState.focusedIndex);
  });
</script>

<div
  bind:this={fileListElement}
  class="file-list"
  class:list-view={!appState.isGridView}
  class:grid-view={appState.isGridView}
  id={pane === 'primary' ? 'file-list' : 'secondary-file-list'}
  role="listbox"
  aria-label="Files and folders"
  aria-multiselectable="true"
  onscroll={handleScroll}
  style={`height: 100%; overflow: auto; --file-list-columns: ${fileListColumns()}; --file-list-row-height: ${LIST_ROW_HEIGHT}px; --file-list-grid-item-width: ${gridItemWidth}px; --file-list-grid-item-height: ${gridItemHeight}px;`}
>
  <FileListItems
    items={displayItems}
    isGrid={appState.isGridView}
    mode="virtual"
    {pane}
    virtualOffset={visibleRange.offset}
    virtualTotalSize={virtualTotalSize}
    visibleColumns={visibleColumns}
  />
</div>
