<script lang="ts">
  import {
    canSelectDuplicatePath,
    clearDuplicateSelections,
    closeDuplicateCheckerUi,
    duplicateCheckerUi,
    selectAllButFirst,
    selectAllButNewest,
    selectedDuplicatePaths,
    setDuplicatePathSelected,
  } from '../app/duplicateCheckerUi.svelte';
  import { formatFileSize } from '../coreFileManager';
  import type { DuplicateCheckFile, DuplicateCheckGroup, PathString } from '../types';

  const selectedCount = $derived(duplicateCheckerUi.selectedPaths.size);
  const groupCount = $derived(duplicateCheckerUi.groups.length);
  const selectedBytes = $derived.by(() => duplicateCheckerUi.groups.reduce((total, group) =>
    total + group.files
      .filter((file) => duplicateCheckerUi.selectedPaths.has(file.path))
      .reduce((subtotal, file) => subtotal + Number(file.size || 0), 0),
    0,
  ));
  const duplicateFileCount = $derived.by(() => duplicateCheckerUi.groups.reduce(
    (total, group) => total + group.files.length,
    0,
  ));
  const hasResults = $derived(groupCount > 0);

  function emit(type: string, detail: Record<string, unknown> = {}) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeDuplicateCheckerUi();
    }
  }

  function handleCheckbox(file: DuplicateCheckFile, event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    setDuplicatePathSelected(file.path, Boolean(target?.checked));
  }

  function keepNewest(groupId?: string) {
    selectAllButNewest(groupId);
  }

  function keepFirst(groupId?: string) {
    selectAllButFirst(groupId);
  }

  function rowDisabled(file: DuplicateCheckFile) {
    return !duplicateCheckerUi.selectedPaths.has(file.path) && !canSelectDuplicatePath(file.path);
  }

  function groupSelectedCount(group: DuplicateCheckGroup) {
    return group.files.filter((file) => duplicateCheckerUi.selectedPaths.has(file.path)).length;
  }

  function groupSelectedBytes(group: DuplicateCheckGroup) {
    return group.files
      .filter((file) => duplicateCheckerUi.selectedPaths.has(file.path))
      .reduce((total, file) => total + Number(file.size || 0), 0);
  }

  function deleteSelected() {
    const paths = selectedDuplicatePaths();
    if (paths.length === 0) return;
    emit('simplefile:duplicate-checker-delete', { paths });
  }

  function openFile(path: PathString) {
    emit('simplefile:duplicate-checker-open', { path });
  }

  function revealFile(path: PathString) {
    emit('simplefile:duplicate-checker-reveal', { path });
  }

  function previewFile(path: PathString) {
    emit('simplefile:duplicate-checker-preview', { path });
  }
</script>

{#if duplicateCheckerUi.visible}
  <div
    class="modal-overlay visible duplicate-checker-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="duplicate-checker-title"
    tabindex="-1"
    onmousedown={handleOverlayMouseDown}
  >
    <div class="modal duplicate-checker-modal">
      <div class="modal-header">
        <div class="duplicate-checker-title-block">
          <h3 id="duplicate-checker-title">Duplicate Checker</h3>
          <span title={duplicateCheckerUi.directory}>{duplicateCheckerUi.directory}</span>
        </div>
        <button
          type="button"
          class="modal-close"
          aria-label="Close"
          onclick={() => closeDuplicateCheckerUi()}
        >
          &times;
        </button>
      </div>

      <div class="modal-body duplicate-checker-body">
        <div class="duplicate-checker-summary">
          <div>
            <strong>{groupCount.toLocaleString()}</strong>
            <span>groups</span>
          </div>
          <div>
            <strong>{duplicateFileCount.toLocaleString()}</strong>
            <span>files</span>
          </div>
          <div>
            <strong>{formatFileSize(duplicateCheckerUi.totalReclaimableBytes)}</strong>
            <span>available</span>
          </div>
          <div>
            <strong>{formatFileSize(selectedBytes)}</strong>
            <span>selected</span>
          </div>
        </div>

        <div class="duplicate-checker-toolbar">
          <button type="button" class="btn btn-secondary btn-sm" disabled={!hasResults} onclick={() => keepNewest()}>
            Keep Newest
          </button>
          <button type="button" class="btn btn-secondary btn-sm" disabled={!hasResults} onclick={() => keepFirst()}>
            Keep First
          </button>
          <button type="button" class="btn btn-secondary btn-sm" disabled={selectedCount === 0} onclick={() => clearDuplicateSelections()}>
            Clear
          </button>
          <div class="duplicate-checker-spacer"></div>
          <span class="duplicate-checker-selection">{selectedCount.toLocaleString()} selected</span>
          <button
            type="button"
            class="btn btn-danger btn-sm"
            disabled={selectedCount === 0 || duplicateCheckerUi.deleting}
            onclick={deleteSelected}
          >
            {duplicateCheckerUi.deleting ? 'Moving...' : 'Move Selected to Trash'}
          </button>
        </div>

        {#if duplicateCheckerUi.skippedFiles > 0}
          <div class="duplicate-checker-warning" role="status">
            {duplicateCheckerUi.skippedFiles.toLocaleString()} skipped
          </div>
        {/if}

        {#if !hasResults}
          <div class="duplicate-checker-empty">
            <strong>No duplicates found</strong>
            <span>{duplicateCheckerUi.scannedFiles.toLocaleString()} files scanned</span>
          </div>
        {:else}
          <div class="duplicate-checker-list">
            {#each duplicateCheckerUi.groups as group (group.id)}
              <section class="duplicate-group">
                <header class="duplicate-group-header">
                  <div>
                    <strong>{group.files.length.toLocaleString()} matching files</strong>
                    <span>{formatFileSize(group.size)} each · {formatFileSize(group.wasted_bytes)} available</span>
                  </div>
                  <div class="duplicate-group-actions">
                    <span>{groupSelectedCount(group)} selected · {formatFileSize(groupSelectedBytes(group))}</span>
                    <button type="button" class="btn btn-secondary btn-sm" onclick={() => keepNewest(group.id)}>Keep Newest</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick={() => keepFirst(group.id)}>Keep First</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick={() => clearDuplicateSelections(group.id)}>Clear</button>
                  </div>
                </header>

                <div class="duplicate-file-list">
                  {#each group.files as file (file.path)}
                    <div class={['duplicate-file-row', duplicateCheckerUi.selectedPaths.has(file.path) ? 'duplicate-file-row--selected' : ''].filter(Boolean).join(' ')}>
                      <label class="duplicate-file-check">
                        <input
                          type="checkbox"
                          checked={duplicateCheckerUi.selectedPaths.has(file.path)}
                          disabled={rowDisabled(file)}
                          onchange={(event) => handleCheckbox(file, event)}
                        />
                      </label>
                      <div class="duplicate-file-main">
                        <strong title={file.name}>{file.name}</strong>
                        <span title={file.path}>{file.path}</span>
                      </div>
                      <div class="duplicate-file-meta">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{file.modified || '-'}</span>
                      </div>
                      <div class="duplicate-file-actions">
                        <button type="button" class="btn btn-secondary btn-sm" title="Quick Look" aria-label={`Quick Look ${file.name}`} onclick={() => previewFile(file.path)}>◧</button>
                        <button type="button" class="btn btn-secondary btn-sm" title="Open" aria-label={`Open ${file.name}`} onclick={() => openFile(file.path)}>▶</button>
                        <button type="button" class="btn btn-secondary btn-sm" title="Reveal" aria-label={`Reveal ${file.name}`} onclick={() => revealFile(file.path)}>⌖</button>
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {/if}

        {#if duplicateCheckerUi.errors.length > 0}
          <details class="duplicate-checker-errors">
            <summary>{duplicateCheckerUi.errors.length.toLocaleString()} read issue{duplicateCheckerUi.errors.length === 1 ? '' : 's'}</summary>
            <pre>{duplicateCheckerUi.errors.slice(0, 40).join('\n')}</pre>
          </details>
        {/if}
      </div>
    </div>
  </div>
{/if}
