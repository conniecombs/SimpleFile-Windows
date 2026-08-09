<script lang="ts">
  import { onDestroy } from 'svelte';
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import { searchResultsLabel } from '../../app/searchUi.svelte';
  import FileListHeader from './FileListHeader.svelte';
  import FileList from '../file-list/FileList.svelte';
  import SearchResultsHeader from '../search-chrome/SearchResultsHeader.svelte';
  import TabsBar from '../tabs/TabsBar.svelte';

  type PaneId = 'primary' | 'secondary';

  const PANE_MIN_PERCENT = 20;
  const PANE_MAX_PERCENT = 80;

  let contentArea: HTMLDivElement | undefined = $state();
  let panePrimary: HTMLDivElement | undefined = $state();
  let paneSecondary: HTMLDivElement | undefined = $state();
  let primaryPathInput: HTMLInputElement | undefined = $state();
  let secondaryPathInput: HTMLInputElement | undefined = $state();
  let editingPathPane: PaneId | null = $state(null);
  let paneResizing = $state(false);
  let panePercent = $state(50);
  let cleanupPaneResize: (() => void) | undefined;

  let searchHeaderLabel = $derived(
    searchResultsLabel(
      String(appState.searchQuery || ''),
      appState.searchResults?.length || 0,
    ),
  );

  function pathSegments(path: string) {
    if (!path) return [];
    const parts = path.split(/[/\\]/).filter(Boolean);
    let currentAccumulated = '';
    return parts.map((part: string, index: number) => {
      const isDrive = index === 0 && part.endsWith(':');
      currentAccumulated += index === 0 ? (isDrive ? `${part}\\` : part) : `\\${part}`;
      return {
        current: index === parts.length - 1,
        label: part,
        path: currentAccumulated,
      };
    });
  }

  let primaryPathSegments = $derived.by(() => pathSegments(appState.currentPath));
  let secondaryPathSegments = $derived.by(() => pathSegments(appState.secondaryPath));

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function setPaneWidths(nextPrimaryWidth: number) {
    if (!panePrimary || !paneSecondary) {
      return;
    }

    const primaryWidth = clamp(nextPrimaryWidth, PANE_MIN_PERCENT, PANE_MAX_PERCENT);
    panePercent = Math.round(primaryWidth);
    panePrimary.style.width = `${primaryWidth}%`;
    paneSecondary.style.width = `${100 - primaryWidth}%`;
  }

  function currentPanePercent() {
    const inlineWidth = Number.parseFloat(panePrimary?.style.width ?? '');
    if (Number.isFinite(inlineWidth)) {
      return inlineWidth;
    }

    if (!contentArea || !panePrimary) {
      return panePercent;
    }

    const contentRect = contentArea.getBoundingClientRect();
    const primaryRect = panePrimary.getBoundingClientRect();
    if (contentRect.width <= 0) {
      return panePercent;
    }

    return (primaryRect.width / contentRect.width) * 100;
  }

  function handlePaneKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 5;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPaneWidths(currentPanePercent() - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPaneWidths(currentPanePercent() + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setPaneWidths(PANE_MIN_PERCENT);
    } else if (event.key === 'End') {
      event.preventDefault();
      setPaneWidths(PANE_MAX_PERCENT);
    }
  }

  function panePath(pane: PaneId) {
    return pane === 'secondary' ? appState.secondaryPath : appState.currentPath;
  }

  function paneHistoryIndex(pane: PaneId) {
    return pane === 'secondary' ? appState.secondaryHistoryIndex : appState.historyIndex;
  }

  function paneHistoryLength(pane: PaneId) {
    return pane === 'secondary' ? appState.secondaryHistory.length : appState.history.length;
  }

  function inputForPane(pane: PaneId) {
    return pane === 'secondary' ? secondaryPathInput : primaryPathInput;
  }

  function emitPaneCommand(event: Event, pane: PaneId, command: string, path = '') {
    event.currentTarget?.dispatchEvent(new CustomEvent('simplefile:pane-command', {
      bubbles: true,
      detail: { command, pane, path },
    }));
  }

  function beginPanePathEdit(event: Event | undefined, pane: PaneId) {
    event?.preventDefault();
    editingPathPane = pane;
    requestAnimationFrame(() => {
      const input = inputForPane(pane);
      if (!input) return;
      input.value = panePath(pane) || '';
      input.focus();
      input.select();
    });
  }

  function endPanePathEdit(pane: PaneId, resetValue = false) {
    const input = inputForPane(pane);
    if (resetValue && input) {
      input.value = panePath(pane) || '';
    }
    if (editingPathPane === pane) {
      editingPathPane = null;
    }
  }

  function handlePanePathKeydown(event: KeyboardEvent, pane: PaneId) {
    if (event.key === 'Escape') {
      event.preventDefault();
      endPanePathEdit(pane, true);
      return;
    }

    if (event.key !== 'Enter') return;
    const target = event.currentTarget as HTMLInputElement;
    const path = target.value.trim();
    if (!path) return;
    event.preventDefault();
    emitPaneCommand(event, pane, 'navigate', path);
    endPanePathEdit(pane);
  }

  function beginPaneResize(event: MouseEvent) {
    if (!contentArea || !panePrimary || !paneSecondary) {
      return;
    }

    event.preventDefault();
    cleanupPaneResize?.();
    paneResizing = true;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function handleMove(moveEvent: MouseEvent) {
      if (!contentArea || !panePrimary || !paneSecondary) {
        return;
      }

      const rect = contentArea.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setPaneWidths(percent);
    }

    function stopResize() {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', stopResize);
      window.removeEventListener('blur', stopResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      paneResizing = false;
      cleanupPaneResize = undefined;
    }

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', stopResize);
    window.addEventListener('blur', stopResize);
    cleanupPaneResize = stopResize;
  }

  onDestroy(() => {
    cleanupPaneResize?.();
  });
</script>

<div bind:this={contentArea} class:dual-pane={appState.dualPaneEnabled} class="content-area" id="content-area">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions: pane click activates dual-pane focus side -->
  <div
    bind:this={panePrimary}
    class="pane primary-pane"
    class:active={appState.dualPaneEnabled && appState.activePane === 'primary'}
    id="pane-primary"
    data-pane="primary"
    role="region"
    aria-label="Left file pane"
    aria-current={appState.dualPaneEnabled && appState.activePane === 'primary' ? 'true' : undefined}
    onmousedown={() => {
      if (appState.dualPaneEnabled && appState.activePane !== 'primary') {
        document.dispatchEvent(new CustomEvent('simplefile:activate-pane', {
          bubbles: true,
          detail: { pane: 'primary' },
        }));
      }
    }}
  >
    <div class="pane-tab-bar" id="primary-tab-bar" role="tablist" aria-label="Left pane tabs">
      <div class="tabs-container" id="primary-tabs-container">
        <TabsBar tabs={appState.tabs} activeTabId={appState.activeTabId} pane="primary" />
      </div>
    </div>
    <div class="pane-header" id="primary-pane-header">
      <div class="pane-nav-buttons">
        <button class="toolbar-btn pane-nav-btn" id="btn-primary-back" title="Go Back" aria-label="Go back in left pane" disabled={paneHistoryIndex('primary') <= 0} onclick={(event) => emitPaneCommand(event, 'primary', 'back')}>
          <span class="icon" aria-hidden="true">◀</span>
        </button>
        <button class="toolbar-btn pane-nav-btn" id="btn-primary-forward" title="Go Forward" aria-label="Go forward in left pane" disabled={paneHistoryIndex('primary') >= paneHistoryLength('primary') - 1} onclick={(event) => emitPaneCommand(event, 'primary', 'forward')}>
          <span class="icon" aria-hidden="true">▶</span>
        </button>
        <button class="toolbar-btn pane-nav-btn" id="btn-primary-up" title="Go Up" aria-label="Go to parent folder in left pane" disabled={!panePath('primary')} onclick={(event) => emitPaneCommand(event, 'primary', 'up')}>
          <span class="icon" aria-hidden="true">▲</span>
        </button>
      </div>
      <div
        class:editing={editingPathPane === 'primary'}
        class="pane-path-bar"
        id="primary-path-bar"
        role="navigation"
        aria-label="Primary path"
      >
        <div class="breadcrumb" id="primary-breadcrumb" role="list">
          {#each primaryPathSegments as segment, index}
            <span role="listitem">
              <button
                class={`breadcrumb-segment${segment.current ? ' current' : ''}`}
                type="button"
                aria-current={segment.current ? 'page' : 'false'}
                onclick={(event) => emitPaneCommand(event, 'primary', 'navigate', segment.path)}
              >
                {segment.label}
              </button>
            </span>
            {#if index < primaryPathSegments.length - 1}
              <span class="breadcrumb-separator" aria-hidden="true">/</span>
            {/if}
          {/each}
        </div>
        <button
          class="pane-path-edit-btn"
          id="btn-primary-edit-path"
          type="button"
          title="Edit left pane path"
          aria-label="Edit left pane path"
          onclick={(event) => beginPanePathEdit(event, 'primary')}
        >
          <span class="icon" aria-hidden="true">&#9998;</span>
        </button>
        <input
          bind:this={primaryPathInput}
          type="text"
          id="primary-path-input"
          class="path-input"
          placeholder="Enter path..."
          value={appState.currentPath}
          onblur={() => endPanePathEdit('primary')}
          onkeydown={(event) => handlePanePathKeydown(event, 'primary')}
        />
      </div>
    </div>
    <div class="file-container">
      <FileListHeader pane="primary" />
      {#if appState.searchMode}
        <div class="search-results-header" role="status" aria-live="polite">
          <!-- Events bubble to setup (search-results-clear / search-results-save). -->
          <SearchResultsHeader
            label={searchHeaderLabel}
            clearLabel="Clear"
            saveLabel="Save Search"
          />
        </div>
      {/if}
      <div class="quick-filter-bar" id="quick-filter-bar" style="display:none;" role="search" aria-label="Quick filter">
        <span class="quick-filter-icon" aria-hidden="true">🔎</span>
        <input
          type="text"
          id="filter-input"
          class="quick-filter-input"
          placeholder="Filter files… (Escape to clear)"
          aria-label="Filter current directory"
        />
        <span class="quick-filter-count" id="filter-count"></span>
        <button class="quick-filter-clear" id="filter-clear" title="Clear filter (Escape)" aria-label="Clear filter">✕</button>
      </div>
      <FileList pane="primary" />
    </div>
  </div>

  <button
    class:dragging={paneResizing}
    class="pane-divider"
    id="pane-divider"
    type="button"
    aria-label="Resize file panes"
    title="Resize file panes"
    onmousedown={beginPaneResize}
    onkeydown={handlePaneKeydown}
  ></button>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions: pane click activates dual-pane focus side -->
  <div
    bind:this={paneSecondary}
    class="pane secondary-pane"
    class:active={appState.dualPaneEnabled && appState.activePane === 'secondary'}
    id="pane-secondary"
    data-pane="secondary"
    role="region"
    aria-label="Right file pane"
    aria-current={appState.dualPaneEnabled && appState.activePane === 'secondary' ? 'true' : undefined}
    onmousedown={() => {
      if (appState.dualPaneEnabled && appState.activePane !== 'secondary') {
        document.dispatchEvent(new CustomEvent('simplefile:activate-pane', {
          bubbles: true,
          detail: { pane: 'secondary' },
        }));
      }
    }}
  >
    <div class="pane-tab-bar" id="secondary-tab-bar" role="tablist" aria-label="Right pane tabs">
      <div class="tabs-container" id="secondary-tabs-container">
        <TabsBar tabs={appState.secondaryTabs || []} activeTabId={appState.secondaryActiveTabId} pane="secondary" />
      </div>
    </div>
    <div class="pane-header">
      <div class="pane-nav-buttons">
        <button class="toolbar-btn pane-nav-btn" id="btn-secondary-back" title="Go Back" aria-label="Go back in right pane" disabled={paneHistoryIndex('secondary') <= 0} onclick={(event) => emitPaneCommand(event, 'secondary', 'back')}>
          <span class="icon" aria-hidden="true">◀</span>
        </button>
        <button class="toolbar-btn pane-nav-btn" id="btn-secondary-forward" title="Go Forward" aria-label="Go forward in right pane" disabled={paneHistoryIndex('secondary') >= paneHistoryLength('secondary') - 1} onclick={(event) => emitPaneCommand(event, 'secondary', 'forward')}>
          <span class="icon" aria-hidden="true">▶</span>
        </button>
        <button class="toolbar-btn pane-nav-btn" id="btn-secondary-up" title="Go Up" aria-label="Go to parent folder in right pane" disabled={!panePath('secondary')} onclick={(event) => emitPaneCommand(event, 'secondary', 'up')}>
          <span class="icon" aria-hidden="true">▲</span>
        </button>
      </div>
      <div
        class:editing={editingPathPane === 'secondary'}
        class="pane-path-bar"
        id="secondary-path-bar"
        role="navigation"
        aria-label="Secondary path"
      >
        <div class="breadcrumb" id="secondary-breadcrumb" role="list">
          {#each secondaryPathSegments as segment, index}
            <span role="listitem">
              <button
                class={`breadcrumb-segment${segment.current ? ' current' : ''}`}
                type="button"
                aria-current={segment.current ? 'page' : 'false'}
                onclick={(event) => emitPaneCommand(event, 'secondary', 'navigate', segment.path)}
              >
                {segment.label}
              </button>
            </span>
            {#if index < secondaryPathSegments.length - 1}
              <span class="breadcrumb-separator" aria-hidden="true">/</span>
            {/if}
          {/each}
        </div>
        <button
          class="pane-path-edit-btn"
          id="btn-secondary-edit-path"
          type="button"
          title="Edit right pane path"
          aria-label="Edit right pane path"
          onclick={(event) => beginPanePathEdit(event, 'secondary')}
        >
          <span class="icon" aria-hidden="true">&#9998;</span>
        </button>
        <input
          bind:this={secondaryPathInput}
          type="text"
          id="secondary-path-input"
          class="path-input"
          placeholder="Enter path..."
          value={appState.secondaryPath}
          onblur={() => endPanePathEdit('secondary')}
          onkeydown={(event) => handlePanePathKeydown(event, 'secondary')}
        />
      </div>
    </div>

    <div class="file-container">
      <FileListHeader pane="secondary" />
      <FileList pane="secondary" />
    </div>
  </div>

  <aside class:visible={appState.showPreviewPane} class="preview-pane" id="preview-pane">
    <div class="resize-handle" id="preview-resizer"></div>
    <div class="preview-header">
      <span>Preview</span>
      <button
        class="preview-close"
        id="preview-close"
        aria-label="Close preview pane"
        onclick={() => {
          document.dispatchEvent(new CustomEvent('simplefile:preview-close'));
        }}
      >&times;</button>
    </div>
    <div class="preview-content" id="preview-content">
      <div class="preview-placeholder">
        <span class="icon">👁️</span>
        <span>Select a file to preview</span>
      </div>
    </div>
    <div class="preview-info" id="preview-info"></div>
  </aside>
</div>
