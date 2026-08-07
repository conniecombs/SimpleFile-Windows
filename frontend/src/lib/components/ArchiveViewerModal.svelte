<script lang="ts">
  import {
    archiveViewer,
    closeArchiveViewer,
  } from '../app/archiveUi.svelte';
  import ArchiveContents from './archive-surfaces/ArchiveContents.svelte';
  import ArchiveInfo from './archive-surfaces/ArchiveInfo.svelte';

  function handleClose(event?: Event) {
    event?.preventDefault();
    closeArchiveViewer();
  }

  function handleExtract(event: MouseEvent) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('simplefile:archive-extract', { bubbles: true }));
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose(event);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!archiveViewer.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose(event);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-overlay"
  class:visible={archiveViewer.visible}
  id="archive-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="archive-title"
  aria-hidden={!archiveViewer.visible}
  onmousedown={handleOverlayMouseDown}
>
  <div class="modal archive-modal">
    <div class="modal-header">
      <h3 id="archive-title">{archiveViewer.title}</h3>
      <button
        type="button"
        class="modal-close"
        id="archive-close"
        aria-label="Close archive viewer"
        onclick={handleClose}
      >&times;</button>
    </div>
    <div class="modal-body archive-body">
      <div class="archive-info" id="archive-info">
        <ArchiveInfo
          archivePath={archiveViewer.archivePath || ''}
          compressedSize={archiveViewer.compressedSize}
          entries={archiveViewer.entries}
          format={archiveViewer.format}
          totalSize={archiveViewer.totalSize}
          unsafeEntries={archiveViewer.unsafeEntries}
        />
      </div>
      <div class="archive-list" id="archive-list">
        <ArchiveContents entries={archiveViewer.entries} />
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" id="archive-cancel" onclick={handleClose}>
        Close
      </button>
      <button type="button" class="btn btn-primary" id="archive-extract" onclick={handleExtract}>
        Extract All
      </button>
    </div>
  </div>
</div>
