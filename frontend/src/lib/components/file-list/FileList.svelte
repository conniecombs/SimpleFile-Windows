<script lang="ts">
  import { onMount } from 'svelte';
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import { localState } from '../../app/localState.svelte';
  import { isProgressVisible, progressUi } from '../../app/progressUi.svelte';
  import { fileType, formatFileSize, formatModified, visibleEntries } from '../../coreFileManager';
  import {
    applyPassiveFolderMetricsToState,
    clearThumbnailCache,
    ensureVisibleFolderMetrics,
    ensureVisibleThumbnails,
    getCachedThumbnail,
    getThumbnailRevision,
    isImageFileName,
    subscribeThumbnailCache,
  } from '../../fileListLazyData';
  import type { ColumnId, FileEntry, PathString } from '../../types';
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
  let previousIconSize = $state(0);
  let thumbnailRevision = $state(getThumbnailRevision());
  let measureFrame = 0;
  let lazyMetricsFrame = 0;
  let lazyThumbnailsFrame = 0;

  let visibleColumns = $derived(appState.settings?.visibleColumns || ['size', 'date', 'type']);
  let sourceEntries = $derived(
    pane === 'primary' ? appState.filteredEntries : (appState.secondaryFilteredEntries || []),
  );
  let selectedSet = $derived(
    pane === 'primary' ? appState.selectedEntries : (appState.secondarySelectedEntries || new Set()),
  );
  let cutPathSet = $derived.by(() => {
    if (appState.clipboardAction !== 'cut' || !appState.clipboard?.length) {
      return null;
    }
    return new Set(appState.clipboard);
  });
  let iconSize = $derived(Number(appState.iconSize || appState.settings?.defaultIconSize || 64));
  let showFolderSizes = $derived(appState.settings?.showFolderSizes !== false);
  let showItemCounts = $derived(visibleColumns.includes('items'));
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

  function formatDirectorySize(entry: FileEntry) {
    const folderSize = appState.folderSizes?.get(entry.path);
    if (typeof folderSize === 'number') {
      return formatFileSize(folderSize);
    }
    if (showFolderSizes) {
      return '…';
    }
    return formatFileSize(entry.size, true);
  }

  function formatItemCount(entry: FileEntry) {
    if (entry.itemCount != null && entry.itemCount !== '') {
      return String(entry.itemCount);
    }
    if (entry.is_dir && showItemCounts) {
      return '…';
    }
    return '';
  }

  let displayItems = $derived.by(() => {
    // Depend on thumbnail revision so cached thumbs re-render into the virtual window.
    thumbnailRevision;

    return sourceEntries
      .slice(visibleRange.start, visibleRange.end)
      .map((entry: FileEntry, offset: number): FileListViewItem => {
        const i = visibleRange.start + offset;
        const isImage = isImageFileName(entry.name);
        const thumbnail = appState.isGridView && isImage
          ? (getCachedThumbnail(entry.path) ?? null)
          : null;

        return {
          icon: entry.is_dir ? '\u{1f4c1}' : '\u{1f4c4}',
          index: i,
          isCut: cutPathSet?.has(entry.path) === true,
          isDir: entry.is_dir,
          isFocused: i === appState.focusedIndex && appState.activePane === pane,
          isImage,
          isPdf: entry.name.toLowerCase().endsWith('.pdf'),
          isSelected: selectedSet.has(entry.path),
          isSymlink: entry.is_symlink,
          itemCount: formatItemCount(entry),
          git_status: entry.git_status || null,
          modified: formatModified(entry.modified),
          name: entry.name,
          path: entry.path,
          size: entry.is_dir ? formatDirectorySize(entry) : formatFileSize(entry.size, entry.is_dir),
          tag: tagForPath(entry.path),
          thumbnail,
          type: fileType(entry),
        };
      });
  });

  function queueVisibleThumbnails(imagePaths: PathString[]) {
    if (lazyThumbnailsFrame) {
      cancelAnimationFrame(lazyThumbnailsFrame);
    }

    lazyThumbnailsFrame = requestAnimationFrame(() => {
      lazyThumbnailsFrame = 0;
      if (!appState.isGridView || imagePaths.length === 0) {
        return;
      }

      const thumbSize = Math.max(64, Math.round(iconSize * 1.5));
      void ensureVisibleThumbnails(imagePaths, thumbSize).then((revision) => {
        if (revision !== thumbnailRevision) {
          thumbnailRevision = revision;
        }
      });
    });
  }

  function queueVisibleFolderMetrics(entries: FileEntry[]) {
    if (lazyMetricsFrame) {
      cancelAnimationFrame(lazyMetricsFrame);
    }

    lazyMetricsFrame = requestAnimationFrame(() => {
      lazyMetricsFrame = 0;

      if (!showFolderSizes && !showItemCounts) {
        return;
      }

      // Avoid racing the shared backend size/count cancel flags while an
      // exclusive progress dialog (explicit folder metrics, transfers, etc.) is open.
      // Avoid racing shared backend size/count cancel flags while exclusive progress is open.
      if (isProgressVisible() || progressUi.onCancel) {
        return;
      }

      const folders = entries.filter((entry) => entry.is_dir);
      if (folders.length === 0) {
        return;
      }

      const requests = folders.map((folder) => ({
        path: folder.path,
        needCount: showItemCounts && (folder.itemCount == null || folder.itemCount === ''),
        needSize: showFolderSizes && typeof appState.folderSizes?.get(folder.path) !== 'number',
      }));

      void ensureVisibleFolderMetrics(
        requests,
        appState.folderSizes,
        (path) => {
          const entry = folders.find((folder) => folder.path === path);
          return entry != null && entry.itemCount != null && entry.itemCount !== '';
        },
      ).then((result) => {
        if (result.sizes.size === 0 && result.counts.size === 0) {
          return;
        }
        applyPassiveFolderMetricsToState(appState, result.sizes, result.counts, {
          primary: () => {
            appState.filteredEntries = visibleEntries(appState.entries, {
              filterQuery: appState.filterQuery,
              showHidden: appState.showHiddenFiles,
              sortAsc: appState.sortAsc,
              sortBy: appState.sortBy,
            });
          },
          secondary: () => {
            appState.secondaryFilteredEntries = visibleEntries(appState.secondaryEntries || [], {
              filterQuery: '',
              showHidden: appState.showHiddenFiles,
              sortAsc: appState.sortAsc,
              sortBy: appState.sortBy,
            });
          },
        });
      });
    });
  }

  onMount(() => {
    updateViewportMeasurements();
    const resizeObserver = new ResizeObserver(updateViewportMeasurements);
    if (fileListElement) {
      resizeObserver.observe(fileListElement);
    }
    window.addEventListener('resize', updateViewportMeasurements);
    const unsubscribeThumbnails = subscribeThumbnailCache(() => {
      thumbnailRevision = getThumbnailRevision();
    });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewportMeasurements);
      unsubscribeThumbnails();
      if (measureFrame) {
        cancelAnimationFrame(measureFrame);
      }
      if (lazyMetricsFrame) {
        cancelAnimationFrame(lazyMetricsFrame);
      }
      if (lazyThumbnailsFrame) {
        cancelAnimationFrame(lazyThumbnailsFrame);
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
    if (previousIconSize === 0) {
      previousIconSize = iconSize;
      return;
    }

    if (Math.abs(iconSize - previousIconSize) / Math.max(1, previousIconSize) > 0.5) {
      clearThumbnailCache();
      thumbnailRevision = getThumbnailRevision();
    }
    previousIconSize = iconSize;
  });

  $effect(() => {
    if (appState.activePane !== pane) {
      return;
    }

    scrollIndexIntoView(appState.focusedIndex);
  });

  $effect(() => {
    const visibleEntries = sourceEntries.slice(visibleRange.start, visibleRange.end);
    const imagePaths = appState.isGridView
      ? visibleEntries
        .filter((entry) => !entry.is_dir && isImageFileName(entry.name))
        .map((entry) => entry.path)
      : [];

    queueVisibleThumbnails(imagePaths);
    queueVisibleFolderMetrics(visibleEntries);
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
