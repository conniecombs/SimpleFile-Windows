<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte.js';
  import { fileType, formatFileSize, formatModified } from '../../coreFileManager';
  import FileListItems from './FileListItems.svelte';
  import type { FileListViewItem } from './FileListItems.svelte';

  let { pane = 'primary' }: { pane?: 'primary' | 'secondary' } = $props();

  let visibleColumns = $derived(appState.settings?.visibleColumns || ['size', 'date', 'type']);

  function columnWidth(column: string) {
    const width = Number(appState.settings?.columnWidths?.[column] || 0);
    return width > 0 ? `${width}px` : `var(--col-${column}-width)`;
  }

  function fileListColumns() {
    return [
      columnWidth('name'),
      ...visibleColumns.map((column: string) => columnWidth(column)),
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

  let displayItems = $derived.by(() => {
    const sourceEntries = pane === 'primary' ? appState.filteredEntries : (appState.secondaryFilteredEntries || []);
    const selectedSet = pane === 'primary' ? appState.selectedEntries : (appState.secondarySelectedEntries || new Set());

    return sourceEntries.map((entry: any, i: number): FileListViewItem => {
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
        itemCount: entry.itemCount || '',
        modified: formatModified(entry.modified),
        name: entry.name,
        path: entry.path,
        size: sizeText,
        tag: tagForPath(entry.path),
        type: fileType(entry),
      };
    });
  });
</script>

<div
  class="file-list"
  class:list-view={!appState.isGridView}
  class:grid-view={appState.isGridView}
  id={pane === 'primary' ? 'file-list' : 'secondary-file-list'}
  role="listbox"
  aria-label="Files and folders"
  aria-multiselectable="true"
  style={`height: 100%; overflow: auto; --file-list-columns: ${fileListColumns()};`}
>
  <FileListItems
    items={displayItems}
    isGrid={appState.isGridView}
    {pane}
    visibleColumns={visibleColumns}
  />
</div>
