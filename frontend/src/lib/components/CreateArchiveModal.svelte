<script lang="ts">
  import {
    closeCreateArchiveUi,
    createArchiveUi,
  } from '../app/archiveUi.svelte';
  import CreateArchiveBody from './archive-surfaces/CreateArchiveBody.svelte';

  function handleClose(event?: Event) {
    event?.preventDefault();
    closeCreateArchiveUi();
  }

  function handleConfirm(event: MouseEvent) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('simplefile:create-archive-confirm', {
      bubbles: true,
      detail: {
        format: createArchiveUi.format,
        name: createArchiveUi.name,
        selectedPaths: [...createArchiveUi.selectedPaths],
        targetDirectory: createArchiveUi.targetDirectory,
      },
    }));
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose(event);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!createArchiveUi.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose(event);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-overlay"
  class:visible={createArchiveUi.visible}
  id="create-archive-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="create-archive-title"
  aria-hidden={!createArchiveUi.visible}
  onmousedown={handleOverlayMouseDown}
>
  <div class="modal">
    <div class="modal-header">
      <h3 id="create-archive-title">Create Archive</h3>
      <button
        type="button"
        class="modal-close"
        id="create-archive-close"
        aria-label="Close create archive"
        onclick={handleClose}
      >&times;</button>
    </div>
    <div class="modal-body">
      <CreateArchiveBody
        bind:name={createArchiveUi.name}
        bind:format={createArchiveUi.format}
        defaultName={createArchiveUi.defaultName}
        selectedNames={createArchiveUi.selectedNames}
      />
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" id="create-archive-cancel" onclick={handleClose}>
        Cancel
      </button>
      <button type="button" class="btn btn-primary" id="create-archive-confirm" onclick={handleConfirm}>
        Create
      </button>
    </div>
  </div>
</div>
