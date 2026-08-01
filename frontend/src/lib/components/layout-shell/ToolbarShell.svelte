<script lang="ts">
import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import BreadcrumbTrail from '../breadcrumb/BreadcrumbTrail.svelte';
  import type { BreadcrumbSegment } from '../breadcrumb/BreadcrumbTrail.svelte';

  type ToolbarCommand =
    | 'back'
    | 'clipboard-history'
    | 'color-label'
    | 'copy'
    | 'cut'
    | 'delete'
    | 'disk-cleanup'
    | 'dual-pane'
    | 'folder-metrics'
    | 'forward'
    | 'new-file'
    | 'new-folder'
    | 'operation-history'
    | 'paste'
    | 'preview-toggle'
    | 'redo'
    | 'rename'
    | 'refresh'
    | 'terminal'
    | 'theme-toggle'
    | 'undo'
    | 'up'
    | 'view-toggle';

  let moreActionsWrapper: HTMLDivElement | undefined = $state();
  let searchInputElement: HTMLInputElement | undefined = $state();
  let isMoreActionsOpen = $state(false);
  let activeSelection = $derived(appState.activePane === 'secondary'
    ? (appState.secondarySelectedEntries || new Set())
    : appState.selectedEntries);
  let activeEntries = $derived(appState.activePane === 'secondary'
    ? (appState.secondaryFilteredEntries || [])
    : (appState.filteredEntries || []));
  let hasSelection = $derived(activeSelection.size > 0);
  let hasClipboard = $derived((appState.clipboard?.length || 0) > 0);
  let hasRedo = $derived((appState.redoStack || []).some((entry: any) => typeof entry?.redo === 'function'));
  let hasUndo = $derived((appState.undoStack?.length || 0) > 0);
  let hasFolderSelection = $derived.by(() => {
    const selectedPaths = new Set(activeSelection);
    return activeEntries.some((entry: any) => selectedPaths.has(entry.path) && entry.is_dir);
  });

  let pathSegments = $derived.by(() => {
    if (!appState.currentPath) return [];
    const parts = appState.currentPath.split(/[/\\]/).filter(Boolean);
    let currentAccumulated = '';
    return parts.map((part: string, index: number) => {
      const isDrive = index === 0 && part.endsWith(':');
      currentAccumulated += index === 0 ? (isDrive ? part + '\\' : part) : '\\' + part;
      return {
        label: part,
        path: currentAccumulated,
        current: index === parts.length - 1
      } as BreadcrumbSegment;
    });
  });

  const SEARCH_CANCEL_EVENT = 'simplefile:search-cancel';
  const SEARCH_CLEAR_EVENT = 'simplefile:search-clear';
  const SEARCH_OPEN_ADVANCED_EVENT = 'simplefile:search-open-advanced';
  const SEARCH_SUBMIT_EVENT = 'simplefile:search-submit';
  const TOOLBAR_COMMAND_EVENT = 'simplefile:toolbar-command';
  const TOOLBAR_ICON_SIZE_EVENT = 'simplefile:toolbar-icon-size';

  function setMoreActionsOpen(open: boolean) {
    isMoreActionsOpen = open;
  }

  function toggleMoreActions(event: MouseEvent) {
    event.stopPropagation();
    setMoreActionsOpen(!isMoreActionsOpen);
  }

  function closeMoreActions() {
    setMoreActionsOpen(false);
  }

  function emitFromTarget(type: string, event: Event, detail = {}) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail,
    }));
  }

  function emitToolbarCommand(event: MouseEvent, command: ToolbarCommand) {
    emitFromTarget(TOOLBAR_COMMAND_EVENT, event, { command });
  }

  function emitMoreActionCommand(event: MouseEvent, command: ToolbarCommand) {
    emitToolbarCommand(event, command);
    closeMoreActions();
  }

  function emitIconSize(event: Event, commit = false) {
    const target = event.currentTarget as HTMLInputElement | null;
    emitFromTarget(TOOLBAR_ICON_SIZE_EVENT, event, {
      commit,
      value: Number(target?.value || 0),
    });
  }

  function currentSearchQuery() {
    return searchInputElement?.value?.trim() || '';
  }

  function emitSearchSubmit(event: MouseEvent | KeyboardEvent) {
    emitFromTarget(SEARCH_SUBMIT_EVENT, event, { query: currentSearchQuery() });
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      emitSearchSubmit(event);
      return;
    }

    if (event.key === 'Escape') {
      emitFromTarget(SEARCH_CLEAR_EVENT, event);
    }
  }

  $effect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && moreActionsWrapper?.contains(target)) {
        return;
      }
      setMoreActionsOpen(false);
    }

    function handleDocumentKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !isMoreActionsOpen) {
        return;
      }

      setMoreActionsOpen(false);
      document.getElementById('btn-more-actions')?.focus();
    }

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleDocumentKeydown);
    };
  });
</script>

<header class="toolbar" role="toolbar" aria-label="Navigation and actions">
  <div class="toolbar-nav" role="group" aria-label="Navigation">
    <button class="toolbar-btn" id="btn-back" title="Go Back" aria-label="Go back" disabled={appState.historyIndex <= 0} onclick={(event) => emitToolbarCommand(event, 'back')}>
      <span class="icon" aria-hidden="true">◀</span>
    </button>
    <button class="toolbar-btn" id="btn-forward" title="Go Forward" aria-label="Go forward" disabled={appState.historyIndex >= appState.history.length - 1} onclick={(event) => emitToolbarCommand(event, 'forward')}>
      <span class="icon" aria-hidden="true">▶</span>
    </button>
    <button class="toolbar-btn" id="btn-up" title="Go Up" aria-label="Go to parent folder" onclick={(event) => emitToolbarCommand(event, 'up')}>
      <span class="icon" aria-hidden="true">▲</span>
    </button>
    <button class="toolbar-btn" id="btn-refresh" title="Refresh" aria-label="Refresh current folder" onclick={(event) => emitToolbarCommand(event, 'refresh')}>
      <span class="icon" aria-hidden="true">🔄</span>
    </button>
  </div>

  <div class="path-bar" id="path-bar" role="navigation" aria-label="Breadcrumb navigation">
    <BreadcrumbTrail segments={pathSegments} />
    <input type="text" id="path-input" class="path-input" placeholder="Enter path..." autocomplete="off" />
    <div class="path-autocomplete" id="path-autocomplete" role="listbox" aria-label="Path suggestions" style="display:none;"></div>
  </div>

  <div class="search-bar" role="search">
    <input bind:this={searchInputElement} type="text" id="search-input" class="search-input" placeholder="Search files..." aria-label="Search files" onkeydown={handleSearchKeydown} />
    <button class="search-btn" id="search-btn" title="Search" aria-label="Start search" onclick={emitSearchSubmit}>🔍</button>
    <button class="search-btn" id="search-advanced" title="Advanced Search" aria-label="Advanced search options" onclick={(event) => emitFromTarget(SEARCH_OPEN_ADVANCED_EVENT, event)}>
      <svg class="search-advanced-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h10" />
        <path d="M18 7h2" />
        <path d="M4 17h2" />
        <path d="M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    </button>
    <button class="search-clear-btn" id="search-cancel" title="Cancel Search" aria-label="Cancel search" style="display: none;" onclick={(event) => emitFromTarget(SEARCH_CANCEL_EVENT, event)}>■</button>
    <button class="search-clear-btn" id="search-clear" title="Clear Search" aria-label="Clear search results" style="display: none;" onclick={(event) => emitFromTarget(SEARCH_CLEAR_EVENT, event)}>✕</button>
  </div>

  <div class="toolbar-actions" role="group" aria-label="Actions">
    <button class="toolbar-btn" id="btn-new-folder" title="New Folder (Ctrl+Shift+N)" aria-label="Create new folder" onclick={(event) => emitToolbarCommand(event, 'new-folder')}>
      <span class="icon" aria-hidden="true">📁+</span>
    </button>
    <button class="toolbar-btn" id="btn-view-toggle" title="Toggle View (List/Grid)" aria-label="Toggle between list and grid view" aria-pressed={appState.isGridView} onclick={(event) => emitToolbarCommand(event, 'view-toggle')}>
      <span class="icon" aria-hidden="true">⊞</span>
    </button>
    <div class="more-actions-wrapper" bind:this={moreActionsWrapper}>
      <button
        class="toolbar-btn"
        id="btn-more-actions"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={isMoreActionsOpen}
        onclick={toggleMoreActions}
      >
        <span class="icon" aria-hidden="true">⋯</span>
      </button>
      <div
        class:open={isMoreActionsOpen}
        class="more-actions-dropdown"
        id="more-actions-dropdown"
        role="menu"
        aria-label="More actions"
        tabindex="-1"
      >
        <div class="more-actions-group">
          <button class="more-actions-item toolbar-btn" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!hasUndo} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'undo')}>
            <span class="icon" aria-hidden="true">↩</span>
            <span class="more-actions-label">Undo</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!hasRedo} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'redo')}>
            <span class="icon" aria-hidden="true">↪</span>
            <span class="more-actions-label">Redo</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-clipboard-history" title="Clipboard History (Ctrl+Shift+V)" aria-label="Show clipboard history" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'clipboard-history')}>
            <span class="icon" aria-hidden="true">📋</span>
            <span class="more-actions-label">Clipboard History</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-operation-history" title="Operation History" aria-label="Show operation history" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'operation-history')}>
            <span class="icon" aria-hidden="true">↺</span>
            <span class="more-actions-label">Operation History</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <button class="more-actions-item toolbar-btn" id="btn-new-file" title="New File (Ctrl+N)" aria-label="Create new file" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'new-file')}>
            <span class="icon" aria-hidden="true">📄+</span>
            <span class="more-actions-label">New File</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-rename" title="Rename (F2)" aria-label="Rename selected item" disabled={!hasSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'rename')}>
            <span class="icon" aria-hidden="true">✎</span>
            <span class="more-actions-label">Rename</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-copy" title="Copy (Ctrl+C)" aria-label="Copy selected items" disabled={!hasSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'copy')}>
            <span class="icon" aria-hidden="true">⧉</span>
            <span class="more-actions-label">Copy</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-cut" title="Cut (Ctrl+X)" aria-label="Cut selected items" disabled={!hasSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'cut')}>
            <span class="icon" aria-hidden="true">✂</span>
            <span class="more-actions-label">Cut</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-paste" title="Paste (Ctrl+V)" aria-label="Paste copied items" disabled={!hasClipboard} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'paste')}>
            <span class="icon" aria-hidden="true">▣</span>
            <span class="more-actions-label">Paste</span>
          </button>
          <button class="more-actions-item toolbar-btn danger-action" id="btn-delete" title="Delete" aria-label="Delete selected items" disabled={!hasSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'delete')}>
            <span class="icon" aria-hidden="true">⌫</span>
            <span class="more-actions-label">Delete</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <button class="more-actions-item toolbar-btn" id="btn-color-label" title="Set Color Label" aria-label="Set color label for selected items" disabled={!hasSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'color-label')}>
            <span class="icon" aria-hidden="true">#</span>
            <span class="more-actions-label">Color Label</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-folder-metrics" title="Calculate Folder Metrics" aria-label="Calculate selected folder size and item count" disabled={!hasFolderSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'folder-metrics')}>
            <span class="icon" aria-hidden="true">S</span>
            <span class="more-actions-label">Folder Metrics</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-disk-cleanup" title="Analyze Cleanup" aria-label="Analyze large and duplicate files in this folder" disabled={appState.cleanupInProgress} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'disk-cleanup')}>
            <span class="icon" aria-hidden="true">C</span>
            <span class="more-actions-label">Analyze Cleanup</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <button class="more-actions-item toolbar-btn" id="btn-preview-toggle" title="Toggle Preview Pane" aria-label="Toggle preview pane" data-active={appState.showPreviewPane} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'preview-toggle')}>
            <span class="icon" aria-hidden="true">◧</span>
            <span class="more-actions-label">Preview Pane</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-theme-toggle" title="Toggle Theme" aria-label="Toggle dark/light theme" data-active={appState.theme === 'light'} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'theme-toggle')}>
            <span class="icon" aria-hidden="true">🌙</span>
            <span class="more-actions-label">Toggle Theme</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-dual-pane" title="Toggle Dual Pane (F6)" aria-label="Toggle dual pane view" data-active={appState.dualPaneEnabled} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'dual-pane')}>
            <span class="icon" aria-hidden="true">▯▯</span>
            <span class="more-actions-label">Dual Pane</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-terminal" title="Open Terminal Here" aria-label="Open terminal in current folder" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'terminal')}>
            <span class="icon" aria-hidden="true">💻</span>
            <span class="more-actions-label">Open Terminal</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-row icon-size-control" id="icon-size-control">
          <span class="icon" aria-hidden="true">⊞</span>
          <span class="more-actions-label">Icon Size</span>
          <input type="range" id="icon-size-slider" min="48" max="128" value={appState.iconSize} title="Icon Size" aria-label="Adjust icon size" oninput={(event) => emitIconSize(event)} onchange={(event) => emitIconSize(event, true)} />
        </div>
      </div>
    </div>
  </div>
</header>
