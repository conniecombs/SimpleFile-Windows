<script lang="ts">
  import { onMount } from 'svelte';
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import {
    clearActiveSelection,
    selectPaths,
    selectSecondaryPaths,
    updateStatusBar,
  } from '../../app/core';
  import { isProgressVisible, progressUi } from '../../app/progressUi.svelte';
  import {
    basename,
    fileType,
    formatFileSize,
    formatModified,
    getParentPath,
    visibleEntries,
  } from '../../coreFileManager';
  import {
    buildFileListColumns,
    DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
  } from '../../fileListColumns';
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
  import {
    MARQUEE_AUTO_SCROLL_EDGE_PX,
    MARQUEE_AUTO_SCROLL_SPEED_PX,
    clientPointToContent,
    exceededMarqueeThreshold,
    indicesInMarquee,
    isPointOnScrollbar,
    mergeMarqueeSelection,
    normalizeRect,
    type MarqueeLayout,
  } from '../../marqueeSelection';
  import type { FileEntry, PathString } from '../../types';
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
  /** Network paths defer folder metrics / thumbs until idle after listing settles. */
  let networkHeavyWorkReady = $state(false);
  let marqueeFrame = 0;
  let marqueeAutoScrollFrame = 0;
  let marqueeRectElement: HTMLDivElement | null = null;
  let marqueeSession: {
    additive: boolean;
    basePaths: PathString[];
    contentWidth: number;
    dragging: boolean;
    lastClientX: number;
    lastClientY: number;
    paddingLeft: number;
    paddingTop: number;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startContentX: number;
    startContentY: number;
  } | null = null;

  let visibleColumns = $derived(appState.settings?.visibleColumns || DEFAULT_VISIBLE_FILE_LIST_COLUMNS);
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
  let paneIsNetwork = $derived(
    pane === 'primary' ? appState.primaryPathIsNetwork : appState.secondaryPathIsNetwork,
  );
  let paneListingInProgress = $derived(
    pane === 'primary' ? appState.primaryListingInProgress : appState.secondaryListingInProgress,
  );
  /** Skip expensive Intl re-format while network listing is still streaming. */
  let lightDateFormat = $derived(paneIsNetwork && (paneListingInProgress || !networkHeavyWorkReady));
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
        const parentPath = getParentPath(entry.path) || '';

        return {
          extension: entry.is_dir ? '' : (entry.extension || ''),
          gitStatus: entry.git_status || '',
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
          // On network paths, keep the backend's compact timestamp until idle so
          // we avoid Intl.DateTimeFormat work across large remote listings.
          modified: lightDateFormat ? (entry.modified || '') : formatModified(entry.modified),
          name: entry.name,
          parent: parentPath ? basename(parentPath) : '',
          parentPath,
          path: entry.path,
          size: entry.is_dir ? formatDirectorySize(entry) : formatFileSize(entry.size, entry.is_dir),
          symlinkTarget: entry.symlink_target || '',
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
      // Network: wait until listing settles and the browser is idle.
      if (paneIsNetwork && !networkHeavyWorkReady) {
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

  function listPadding(list: HTMLElement) {
    const styles = getComputedStyle(list);
    return {
      left: Number.parseFloat(styles.paddingLeft) || 0,
      right: Number.parseFloat(styles.paddingRight) || 0,
      top: Number.parseFloat(styles.paddingTop) || 0,
    };
  }

  function currentMarqueeLayout(list: HTMLElement): MarqueeLayout {
    const padding = listPadding(list);
    const contentWidth = Math.max(1, list.clientWidth - padding.left - padding.right);
    if (appState.isGridView) {
      return {
        mode: 'grid',
        itemCount: sourceEntries.length,
        columns: gridColumnCount,
        itemWidth: gridItemWidth,
        itemHeight: gridItemHeight,
        gap: GRID_GAP,
      };
    }

    return {
      mode: 'list',
      itemCount: sourceEntries.length,
      rowHeight: LIST_ROW_HEIGHT,
      contentWidth,
    };
  }

  function ensureMarqueeRectElement() {
    if (marqueeRectElement) {
      return marqueeRectElement;
    }

    const element = document.createElement('div');
    element.className = 'selection-rect';
    element.setAttribute('aria-hidden', 'true');
    element.style.display = 'none';
    document.body.appendChild(element);
    marqueeRectElement = element;
    return element;
  }

  function hideMarqueeRect() {
    if (marqueeRectElement) {
      marqueeRectElement.style.display = 'none';
    }
  }

  function updateMarqueeRectVisual(x1: number, y1: number, x2: number, y2: number) {
    const element = ensureMarqueeRectElement();
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    element.style.display = 'block';
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }

  function applyMarqueeSelectionFromContent(
    contentX: number,
    contentY: number,
    list: HTMLElement,
  ) {
    const session = marqueeSession;
    if (!session) {
      return;
    }

    const rect = normalizeRect(
      session.startContentX,
      session.startContentY,
      contentX,
      contentY,
    );
    const layout = currentMarqueeLayout(list);
    const hitIndices = indicesInMarquee(rect, layout);
    const hitPaths = hitIndices
      .map((index) => sourceEntries[index]?.path)
      .filter((path): path is PathString => Boolean(path));
    const nextPaths = mergeMarqueeSelection(session.basePaths, hitPaths, session.additive) as PathString[];
    const focusIndex = hitIndices.length > 0
      ? hitIndices[hitIndices.length - 1]
      : -1;

    if (pane === 'secondary') {
      selectSecondaryPaths(nextPaths, focusIndex);
    } else {
      selectPaths(nextPaths, focusIndex);
    }

    // Keep the marquee anchor stable for shift-click ranges after the drag.
    if (hitIndices.length > 0) {
      appState.lastSelectedIndex = hitIndices[0];
      appState.focusedIndex = focusIndex;
    }
  }

  function pointerToContent(list: HTMLElement, clientX: number, clientY: number, session: NonNullable<typeof marqueeSession>) {
    const listRect = list.getBoundingClientRect();
    return clientPointToContent(
      clientX,
      clientY,
      listRect,
      list.scrollLeft,
      list.scrollTop,
      session.paddingLeft,
      session.paddingTop,
    );
  }

  function contentPointToClient(
    list: HTMLElement,
    contentX: number,
    contentY: number,
    session: NonNullable<typeof marqueeSession>,
  ) {
    const listRect = list.getBoundingClientRect();
    return {
      x: listRect.left + session.paddingLeft + contentX - list.scrollLeft,
      y: listRect.top + session.paddingTop + contentY - list.scrollTop,
    };
  }

  function processMarqueePointer(clientX: number, clientY: number) {
    const list = fileListElement;
    const session = marqueeSession;
    if (!list || !session) {
      return;
    }

    session.lastClientX = clientX;
    session.lastClientY = clientY;

    if (!session.dragging) {
      if (!exceededMarqueeThreshold(
        session.startClientX,
        session.startClientY,
        clientX,
        clientY,
      )) {
        return;
      }
      session.dragging = true;
      list.classList.add('marquee-selecting');
      document.body.classList.add('marquee-selecting');
    }

    const content = pointerToContent(list, clientX, clientY, session);
    // Anchor stays in content space so auto-scroll keeps the band stable.
    const startClient = contentPointToClient(
      list,
      session.startContentX,
      session.startContentY,
      session,
    );
    updateMarqueeRectVisual(startClient.x, startClient.y, clientX, clientY);
    applyMarqueeSelectionFromContent(content.x, content.y, list);
  }

  function queueMarqueePointer(clientX: number, clientY: number) {
    if (marqueeFrame) {
      cancelAnimationFrame(marqueeFrame);
    }
    marqueeFrame = requestAnimationFrame(() => {
      marqueeFrame = 0;
      processMarqueePointer(clientX, clientY);
    });
  }

  function stopMarqueeAutoScroll() {
    if (marqueeAutoScrollFrame) {
      cancelAnimationFrame(marqueeAutoScrollFrame);
      marqueeAutoScrollFrame = 0;
    }
  }

  function tickMarqueeAutoScroll() {
    marqueeAutoScrollFrame = 0;
    const list = fileListElement;
    const session = marqueeSession;
    if (!list || !session || !session.dragging) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    let delta = 0;
    if (session.lastClientY < listRect.top + MARQUEE_AUTO_SCROLL_EDGE_PX) {
      delta = -MARQUEE_AUTO_SCROLL_SPEED_PX;
    } else if (session.lastClientY > listRect.bottom - MARQUEE_AUTO_SCROLL_EDGE_PX) {
      delta = MARQUEE_AUTO_SCROLL_SPEED_PX;
    }

    if (delta !== 0) {
      const previous = list.scrollTop;
      list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, previous + delta));
      if (list.scrollTop !== previous) {
        scrollTop = list.scrollTop;
        processMarqueePointer(session.lastClientX, session.lastClientY);
      }
    }

    marqueeAutoScrollFrame = requestAnimationFrame(tickMarqueeAutoScroll);
  }

  function startMarqueeAutoScroll() {
    stopMarqueeAutoScroll();
    marqueeAutoScrollFrame = requestAnimationFrame(tickMarqueeAutoScroll);
  }

  function endMarqueeSession(commitEmptyClick: boolean) {
    const session = marqueeSession;
    const list = fileListElement;
    marqueeSession = null;
    stopMarqueeAutoScroll();
    if (marqueeFrame) {
      cancelAnimationFrame(marqueeFrame);
      marqueeFrame = 0;
    }
    hideMarqueeRect();
    list?.classList.remove('marquee-selecting');
    document.body.classList.remove('marquee-selecting');

    if (!session) {
      return;
    }

    // Click empty space without dragging: clear selection (Explorer-like).
    if (commitEmptyClick && !session.dragging && !session.additive) {
      appState.activePane = pane;
      clearActiveSelection();
      updateStatusBar();
    }
  }

  function onMarqueePointerMove(event: PointerEvent) {
    if (!marqueeSession || event.pointerId !== marqueeSession.pointerId) {
      return;
    }
    event.preventDefault();
    queueMarqueePointer(event.clientX, event.clientY);
  }

  function onMarqueePointerUp(event: PointerEvent) {
    if (!marqueeSession || event.pointerId !== marqueeSession.pointerId) {
      return;
    }
    event.preventDefault();
    // Flush any pending rAF so the final pointer position is applied.
    if (marqueeFrame) {
      cancelAnimationFrame(marqueeFrame);
      marqueeFrame = 0;
    }
    if (marqueeSession.dragging) {
      processMarqueePointer(event.clientX, event.clientY);
    }
    try {
      fileListElement?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released.
    }
    window.removeEventListener('pointermove', onMarqueePointerMove);
    window.removeEventListener('pointerup', onMarqueePointerUp);
    window.removeEventListener('pointercancel', onMarqueePointerUp);
    endMarqueeSession(true);
  }

  function handleMarqueePointerDown(event: PointerEvent) {
    if (event.button !== 0 || event.altKey) {
      return;
    }

    const list = fileListElement;
    if (!list || event.currentTarget !== list) {
      return;
    }

    const target = event.target as HTMLElement | null;
    // Item drag-and-drop / click selection own pointer interactions on rows.
    if (target?.closest('.file-item')) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    if (isPointOnScrollbar(
      event.clientX,
      event.clientY,
      listRect,
      list.clientWidth,
      list.clientHeight,
    )) {
      return;
    }

    // Don't start marquee while a modal transfer dialog is open.
    if (isProgressVisible()) {
      return;
    }

    const padding = listPadding(list);
    const content = clientPointToContent(
      event.clientX,
      event.clientY,
      listRect,
      list.scrollLeft,
      list.scrollTop,
      padding.left,
      padding.top,
    );

    const baseSet = pane === 'primary'
      ? appState.selectedEntries
      : (appState.secondarySelectedEntries || new Set<PathString>());
    const additive = event.ctrlKey || event.metaKey;

    marqueeSession = {
      additive,
      basePaths: [...baseSet] as PathString[],
      contentWidth: Math.max(1, list.clientWidth - padding.left - padding.right),
      dragging: false,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      paddingLeft: padding.left,
      paddingTop: padding.top,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startContentX: content.x,
      startContentY: content.y,
    };

    appState.activePane = pane;
    updateStatusBar();

    // Prevent native text selection while deciding whether this is a drag.
    event.preventDefault();

    try {
      list.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best-effort; window listeners still track the gesture.
    }

    window.addEventListener('pointermove', onMarqueePointerMove);
    window.addEventListener('pointerup', onMarqueePointerUp);
    window.addEventListener('pointercancel', onMarqueePointerUp);
    startMarqueeAutoScroll();
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

      // Network folder size/count walks are extremely expensive over SMB — wait
      // until listing is done and the UI is idle.
      if (paneIsNetwork && !networkHeavyWorkReady) {
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
      window.removeEventListener('pointermove', onMarqueePointerMove);
      window.removeEventListener('pointerup', onMarqueePointerUp);
      window.removeEventListener('pointercancel', onMarqueePointerUp);
      endMarqueeSession(false);
      if (marqueeRectElement) {
        marqueeRectElement.remove();
        marqueeRectElement = null;
      }
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

  // Gate heavy network work: only after listing completes, then on idle.
  $effect(() => {
    const isNetwork = paneIsNetwork;
    const listingBusy = paneListingInProgress;
    const path = pane === 'primary' ? appState.currentPath : appState.secondaryPath;

    if (!isNetwork) {
      networkHeavyWorkReady = true;
      return;
    }

    networkHeavyWorkReady = false;
    if (listingBusy) {
      return;
    }

    let cancelled = false;
    const enable = () => {
      if (!cancelled) {
        networkHeavyWorkReady = true;
      }
    };

    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleHandle = win.requestIdleCallback(enable, { timeout: 1800 });
    } else {
      timeoutHandle = window.setTimeout(enable, 450);
    }

    return () => {
      cancelled = true;
      if (idleHandle != null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null) {
        window.clearTimeout(timeoutHandle);
      }
      // Re-run when path changes.
      void path;
    };
  });
</script>

<div
  bind:this={fileListElement}
  class="file-list"
  class:list-view={!appState.isGridView}
  class:grid-view={appState.isGridView}
  id={pane === 'primary' ? 'file-list' : 'secondary-file-list'}
  role="listbox"
  tabindex="0"
  aria-label="Files and folders"
  aria-multiselectable="true"
  onscroll={handleScroll}
  onpointerdown={handleMarqueePointerDown}
  style={`height: 100%; overflow: auto; --file-list-columns: ${buildFileListColumns(appState.settings, visibleColumns)}; --file-list-row-height: ${LIST_ROW_HEIGHT}px; --file-list-grid-item-width: ${gridItemWidth}px; --file-list-grid-item-height: ${gridItemHeight}px;`}
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
