<script lang="ts">
  type ContextMenuEntry =
    | { kind: 'divider' }
    | {
        children?: ContextMenuEntry[];
        disabled?: boolean;
        hidden?: boolean;
        id: string;
        kind: 'item';
        label: string;
      };

  // @ts-ignore
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte.js';

  let entries = $derived.by<ContextMenuEntry[]>(() => {
    const activePane = appState.activePane === 'secondary' ? 'secondary' : 'primary';
    const activeSelection = activePane === 'secondary'
      ? (appState.secondarySelectedEntries || new Set())
      : appState.selectedEntries;
    const selectionCount = activeSelection.size;
    const hasClipboard = (appState.clipboard?.length || 0) > 0;
    const selectedPaths = new Set(activeSelection);
    const entriesInView = [
      ...(activePane === 'secondary' ? (appState.secondaryEntries || []) : (appState.entries || [])),
      ...(activePane === 'secondary' ? (appState.secondaryFilteredEntries || []) : (appState.filteredEntries || [])),
    ];
    const selectedEntries = entriesInView.filter((entry: any, index: number, source: any[]) =>
      selectedPaths.has(entry.path)
      && source.findIndex((candidate: any) => candidate.path === entry.path) === index
    );
    const selectedSingle = selectedEntries[0] || null;
    const selectedExtension = String(selectedSingle?.extension || selectedSingle?.name?.split('.').pop() || '').toLowerCase();
    const archiveExtensions = new Set(['zip', 'tar', 'gz', 'tgz', 'rar']);
    const isArchive = selectionCount === 1 && selectedSingle && !selectedSingle.is_dir && archiveExtensions.has(selectedExtension);
    const archiveFolderName = archiveExtractFolderName(selectedSingle?.name || '');
    const hasOtherPane = Boolean(appState.dualPaneEnabled && appState.secondaryPath);
    const canCompare = selectionCount === 2 && selectedEntries.every((entry: any) => !entry.is_dir);
    const canUnpack = selectionCount === 1 && Boolean(selectedSingle?.is_dir);
    const hasFolderSelection = selectedEntries.some((entry: any) => Boolean(entry.is_dir));

    return [
      { kind: 'item', id: 'ctx-open', label: 'Open', disabled: selectionCount !== 1 },
      { kind: 'item', id: 'ctx-open-with', label: 'Open With...', disabled: selectionCount !== 1 || Boolean(selectedSingle?.is_dir) },
      { kind: 'item', id: 'ctx-preview', label: 'Quick Look', disabled: selectionCount !== 1 },
      { kind: 'item', id: 'ctx-compare', label: 'Compare Files', disabled: !canCompare },
      { kind: 'item', id: 'ctx-terminal', label: 'Open Terminal Here' },
      { kind: 'item', id: 'ctx-powershell-admin', label: 'Open PowerShell as Administrator' },
      { kind: 'divider' },
      { kind: 'item', id: 'ctx-color-label', label: 'Color Label...', disabled: selectionCount === 0 },
      { kind: 'item', id: 'ctx-folder-metrics', label: 'Calculate Folder Metrics', disabled: !hasFolderSelection },
      { kind: 'item', id: 'ctx-cleanup', label: 'Analyze Cleanup Here' },
      { kind: 'divider' },
      { kind: 'item', id: 'ctx-rename', label: 'Rename', disabled: selectionCount !== 1 },
      { kind: 'item', id: 'ctx-advanced-rename', label: 'Advanced Rename...', disabled: selectionCount === 0 },
      { kind: 'item', id: 'ctx-copy', label: 'Copy', disabled: selectionCount === 0 },
      { kind: 'item', id: 'ctx-cut', label: 'Cut', disabled: selectionCount === 0 },
      { kind: 'item', id: 'ctx-paste', label: 'Paste', disabled: !hasClipboard },
      { kind: 'item', id: 'ctx-copy-to-pane', label: 'Copy to Other Pane', disabled: selectionCount === 0 || !hasOtherPane },
      { kind: 'item', id: 'ctx-move-to-pane', label: 'Move to Other Pane', disabled: selectionCount === 0 || !hasOtherPane },
      { kind: 'divider' },
      { kind: 'item', id: 'ctx-pack', label: 'Pack into Folder...', disabled: selectionCount === 0 },
      { kind: 'item', id: 'ctx-unpack', label: 'Unpack Folder Here', disabled: !canUnpack },
      { kind: 'item', id: 'ctx-compress', label: 'Compress...', disabled: selectionCount === 0 },
      {
        kind: 'item',
        id: 'ctx-extract-menu',
        label: 'Extract',
        disabled: !isArchive,
        children: [
          { kind: 'item', id: 'ctx-extract-folder', label: archiveFolderName ? `Extract to ${archiveFolderName}/` : 'Extract to Folder', disabled: !isArchive },
          { kind: 'item', id: 'ctx-extract', label: 'Extract Here', disabled: !isArchive },
          { kind: 'item', id: 'ctx-extract-to', label: 'Extract To...', disabled: !isArchive },
        ],
      },
      { kind: 'divider' },
      { kind: 'item', id: 'ctx-delete', label: 'Delete', disabled: selectionCount === 0 },
      { kind: 'divider' },
      { kind: 'item', id: 'ctx-info', label: 'Properties', disabled: selectionCount !== 1 },
    ];
  });

  let visibleEntries = $derived.by<ContextMenuEntry[]>(() => visibleMenuEntries(entries));

  function archiveExtractFolderName(name: string) {
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();
    if (lower.endsWith('.tar.gz')) return trimmed.slice(0, -7);
    if (lower.endsWith('.tgz')) return trimmed.slice(0, -4);
    const dotIndex = trimmed.lastIndexOf('.');
    return dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  }

  function visibleMenuEntries(sourceEntries: ContextMenuEntry[]) {
    const visible: ContextMenuEntry[] = [];

    for (const entry of sourceEntries) {
      if (entry.kind === 'divider') {
        if (visible.length > 0 && visible[visible.length - 1].kind !== 'divider') {
          visible.push(entry);
        }
        continue;
      }

      if (entry.hidden || entry.disabled) {
        continue;
      }

      if (entry.children?.length) {
        const children = visibleMenuEntries(entry.children);
        if (children.length === 0) {
          continue;
        }

        visible.push({ ...entry, children });
        continue;
      }

      visible.push(entry);
    }

    while (visible[visible.length - 1]?.kind === 'divider') {
      visible.pop();
    }

    return visible;
  }
</script>

{#snippet menuItem(entry: ContextMenuEntry)}
  {#if entry.kind === 'divider'}
    <hr class="context-divider" />
  {:else if !entry.hidden}
    {#if entry.children?.length}
      <div class:disabled={entry.disabled} class="context-submenu-root" role="none">
        <button
          class="context-item context-submenu-trigger"
          disabled={entry.disabled}
          type="button"
          aria-haspopup="menu"
        >
          <span>{entry.label}</span>
          <span class="context-submenu-arrow" aria-hidden="true">&#9654;</span>
        </button>
        <div class="context-submenu" role="menu" aria-label={entry.label}>
          {#each entry.children as child, index (child.kind === 'item' ? child.id : `divider-${index}`)}
            {@render menuItem(child)}
          {/each}
        </div>
      </div>
    {:else}
      <button
        class="context-item"
        id={entry.id}
        role="menuitem"
        disabled={entry.disabled}
        type="button"
      >
        {entry.label}
      </button>
    {/if}
  {/if}
{/snippet}

{#each visibleEntries as entry}
  {@render menuItem(entry)}
{/each}
