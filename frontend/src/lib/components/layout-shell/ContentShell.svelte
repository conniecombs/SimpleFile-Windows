<script lang="ts">
  import { onDestroy } from 'svelte';
  // @ts-ignore
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte.js';
  import FileListHeader from './FileListHeader.svelte';
  import FileList from '../file-list/FileList.svelte';

  const PANE_MIN_PERCENT = 20;
  const PANE_MAX_PERCENT = 80;

  let contentArea: HTMLDivElement | undefined = $state();
  let panePrimary: HTMLDivElement | undefined = $state();
  let paneSecondary: HTMLDivElement | undefined = $state();
  let secondaryPathInput: HTMLInputElement | undefined = $state();
  let secondaryPathEditing = $state(false);
  let paneResizing = $state(false);
  let panePercent = $state(50);
  let cleanupPaneResize: (() => void) | undefined;

  let secondaryPathSegments = $derived.by(() => {
    if (!appState.secondaryPath) return [];
    const parts = appState.secondaryPath.split(/[/\\]/).filter(Boolean);
    let currentAccumulated = '';
    return parts.map((part: string, index: number) => {
      const isDrive = index === 0 && part.endsWith(':');
      currentAccumulated += index === 0 ? (isDrive ? `${part}\\` : part) : `\\${part}`;
      return {
        label: part,
        path: currentAccumulated,
      };
    });
  });

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

  function emitSecondaryCommand(event: Event, command: string, path = '') {
    event.currentTarget?.dispatchEvent(new CustomEvent('simplefile:secondary-pane-command', {
      bubbles: true,
      detail: { command, path },
    }));
  }

  function beginSecondaryPathEdit(event?: Event) {
    event?.preventDefault();
    secondaryPathEditing = true;
    requestAnimationFrame(() => {
      if (!secondaryPathInput) return;
      secondaryPathInput.value = appState.secondaryPath || '';
      secondaryPathInput.focus();
      secondaryPathInput.select();
    });
  }

  function endSecondaryPathEdit(resetValue = false) {
    if (resetValue && secondaryPathInput) {
      secondaryPathInput.value = appState.secondaryPath || '';
    }
    secondaryPathEditing = false;
  }

  function handleSecondaryPathKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      endSecondaryPathEdit(true);
      return;
    }

    if (event.key !== 'Enter') return;
    const target = event.currentTarget as HTMLInputElement;
    const path = target.value.trim();
    if (!path) return;
    event.preventDefault();
    emitSecondaryCommand(event, 'navigate', path);
    endSecondaryPathEdit();
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
  <div bind:this={panePrimary} class="pane primary-pane" id="pane-primary" data-pane="primary" role="region" aria-label="File list">
    <div class="file-container">
      <FileListHeader pane="primary" />
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

  <div bind:this={paneSecondary} class="pane secondary-pane" id="pane-secondary" data-pane="secondary">
    <div class="pane-header">
      <div class="pane-nav-buttons">
        <button class="toolbar-btn pane-nav-btn" id="btn-secondary-back" title="Go Back" aria-label="Go back in secondary pane" disabled={appState.secondaryHistoryIndex <= 0} onclick={(event) => emitSecondaryCommand(event, 'back')}>
          <span class="icon" aria-hidden="true">◀</span>
        </button>
        <button class="toolbar-btn pane-nav-btn" id="btn-secondary-forward" title="Go Forward" aria-label="Go forward in secondary pane" disabled={appState.secondaryHistoryIndex >= appState.secondaryHistory.length - 1} onclick={(event) => emitSecondaryCommand(event, 'forward')}>
          <span class="icon" aria-hidden="true">▶</span>
        </button>
        <button class="toolbar-btn pane-nav-btn" id="btn-secondary-up" title="Go Up" aria-label="Go to parent folder in secondary pane" disabled={!appState.secondaryPath} onclick={(event) => emitSecondaryCommand(event, 'up')}>
          <span class="icon" aria-hidden="true">▲</span>
        </button>
      </div>
      <div
        class:editing={secondaryPathEditing}
        class="pane-path-bar"
        id="secondary-path-bar"
        role="navigation"
        aria-label="Secondary path"
      >
        <div class="breadcrumb" id="secondary-breadcrumb" role="list">
          {#each secondaryPathSegments as segment, index}
            <span role="listitem">
              <button class="breadcrumb-segment" type="button" onclick={(event) => emitSecondaryCommand(event, 'navigate', segment.path)}>
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
          title="Edit secondary path"
          aria-label="Edit secondary path"
          onclick={beginSecondaryPathEdit}
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
          onblur={() => endSecondaryPathEdit()}
          onkeydown={handleSecondaryPathKeydown}
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
