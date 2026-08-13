<script lang="ts">
  import {
    DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
    normalizeVisibleColumns,
  } from '../../fileListColumns';
  import type { ColumnId } from '../../types';

  export type FileListTag = {
    color: string;
    emoji: string;
    label: string;
  };

  export type FileListViewItem = {
    fixedHeight?: number | null;
    icon: string;
    index: number;
    isCut: boolean;
    isDir: boolean;
    isFocused: boolean;
    isImage: boolean;
    isPdf: boolean;
    isSelected: boolean;
    isSymlink: boolean;
    itemCount: string;
    extension: string;
    gitStatus: string;
    modified: string;
    name: string;
    parent: string;
    parentPath: string;
    path: string;
    size: string;
    symlinkTarget: string;
    git_status?: string | null;
    tag?: FileListTag | null;
    thumbnail?: string | null;
    type: string;
  };

  let {
    isGrid = false,
    items = [],
    mode = 'simple',
    pane = 'primary',
    virtualOffset = 0,
    virtualTotalSize = 0,
    visibleColumns = DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
  }: {
    isGrid?: boolean;
    items?: FileListViewItem[];
    mode?: 'simple' | 'virtual';
    pane?: 'primary' | 'secondary';
    virtualOffset?: number;
    virtualTotalSize?: number;
    visibleColumns?: ColumnId[];
  } = $props();

  function itemClass(item: FileListViewItem) {
    return [
      'file-item',
      isGrid ? 'grid-item' : 'list-item',
      item.isSelected ? 'selected' : '',
      item.isCut ? 'cut' : '',
      item.isFocused ? 'focused' : '',
      item.git_status ? `git-${item.git_status}` : '',
    ].filter(Boolean).join(' ');
  }

  let normalizedVisibleColumns = $derived(normalizeVisibleColumns(visibleColumns));

  function columnValue(item: FileListViewItem, column: ColumnId) {
    switch (column) {
      case 'size':
        return item.size;
      case 'items':
        return item.itemCount;
      case 'date':
        return item.modified;
      case 'type':
        return item.type;
      case 'extension':
        return item.extension;
      case 'git':
        return item.gitStatus;
      case 'path':
        return item.path;
      case 'parent':
        return item.parent;
      case 'symlink':
        return item.symlinkTarget;
      default:
        return '';
    }
  }

  function columnTitle(item: FileListViewItem, column: ColumnId) {
    if (column === 'parent') {
      return item.parentPath || item.parent;
    }
    return columnValue(item, column);
  }

  function columnDataPath(item: FileListViewItem, column: ColumnId) {
    if ((column === 'size' || column === 'items') && item.isDir) {
      return item.path;
    }
    return '';
  }

  function emitItemInteraction(type: string, event: MouseEvent | KeyboardEvent, item: FileListViewItem) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: {
        ctrlKey: event.ctrlKey,
        index: item.index,
        isDir: item.isDir,
        metaKey: event.metaKey,
        pane,
        path: item.path,
        shiftKey: event.shiftKey,
      },
    }));
  }

  function handleItemKeydown(event: KeyboardEvent, item: FileListViewItem) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    emitItemInteraction('simplefile:file-list-item-open', event, item);
  }
</script>

{#snippet pdfIcon()}
  <svg class="file-pdf-icon" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 0 L34 0 L42 8 L42 56 L6 56 Z" fill="#e53935" rx="2" />
    <path d="M34 0 L42 8 L34 8 Z" fill="#ffcdd2" />
    <rect x="34" y="0" width="8" height="8" fill="#ef9a9a" />
    <rect x="6" y="28" width="36" height="18" rx="2" fill="rgba(0,0,0,0.18)" />
    <text
      x="24"
      y="42"
      font-size="13"
      font-weight="700"
      fill="#ffffff"
      text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif"
      letter-spacing="1"
    >
      PDF
    </text>
  </svg>
{/snippet}

{#snippet tagBadge(tag: FileListTag)}
  <span
    class="file-tag-badge"
    style="color: {tag.color};"
    title={`${tag.label} label`}
    aria-label={`${tag.label} label`}
  >
    {tag.emoji}
  </span>
{/snippet}

{#snippet symlinkBadge()}
  <span class="symlink-badge" title="Symbolic link" aria-label="symlink">&#128279;</span>
{/snippet}

{#snippet fileItem(item: FileListViewItem)}
  <div
    class={itemClass(item)}
    data-path={item.path}
    data-index={item.index}
    data-is-dir={item.isDir}
    data-is-image={isGrid ? item.isImage : undefined}
    data-fixed-height={item.fixedHeight || undefined}
    role="option"
    aria-selected={item.isSelected}
    tabindex={item.isFocused ? 0 : -1}
    draggable="true"
    onclick={(event) => emitItemInteraction('simplefile:file-list-item-click', event, item)}
    ondblclick={(event) => emitItemInteraction('simplefile:file-list-item-open', event, item)}
    onkeydown={(event) => handleItemKeydown(event, item)}
  >
    {#if isGrid}
      <div class="file-icon" aria-hidden="true">
        {#if item.thumbnail}
          <img class="file-thumbnail" src={`data:image/jpeg;base64,${item.thumbnail}`} alt="" />
        {:else if item.isPdf}
          {@render pdfIcon()}
        {:else}
          {item.icon}
        {/if}
        {#if item.isSymlink}
          {@render symlinkBadge()}
        {/if}
        {#if item.tag}
          {@render tagBadge(item.tag)}
        {/if}
      </div>
      <div class="file-name" title={item.name}>{item.name}</div>
    {:else}
      <div class="file-cell name-col">
        <span class="file-icon" aria-hidden="true">{item.icon}</span>
        <span class="file-name" title={item.name}>{item.name}</span>
        {#if item.isSymlink}
          {@render symlinkBadge()}
        {/if}
        {#if item.tag}
          {@render tagBadge(item.tag)}
        {/if}
      </div>
      {#each normalizedVisibleColumns as column}
        <div
          class={`file-cell ${column}-col`}
          data-path={columnDataPath(item, column)}
          title={columnTitle(item, column)}
        >
          {columnValue(item, column)}
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#if mode === 'virtual'}
  <div class="virtual-spacer" style={`height: ${virtualTotalSize}px;`}>
    <div
      class={`virtual-content${isGrid ? ' virtual-content--grid' : ''}`}
      style={`transform: translateY(${virtualOffset}px);`}
    >
      {#each items as item (item.path)}
        {@render fileItem(item)}
      {/each}
    </div>
  </div>
{:else if isGrid}
  <div class="grid-items-container">
    {#each items as item (item.path)}
      {@render fileItem(item)}
    {/each}
  </div>
{:else}
  {#each items as item (item.path)}
    {@render fileItem(item)}
  {/each}
{/if}
