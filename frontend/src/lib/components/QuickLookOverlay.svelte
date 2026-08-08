<script lang="ts">
  import {
    closeQuickLookUi,
    quickLookUi,
  } from '../app/quickLookUi.svelte';
  import QuickLookModal from './quick-look/QuickLookModal.svelte';

  function handleClose(event?: Event) {
    event?.preventDefault();
    document.dispatchEvent(new CustomEvent('simplefile:quick-look-close', { bubbles: true }));
    closeQuickLookUi();
  }

  function handleOpen(event: MouseEvent) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('simplefile:quick-look-open', {
      bubbles: true,
      detail: {
        isDir: quickLookUi.isFolder,
        path: quickLookUi.path,
      },
    }));
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose(event);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!quickLookUi.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose(event);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="quicklook-overlay"
  class:visible={quickLookUi.visible}
  id="quicklook-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="quicklook-title"
  aria-hidden={!quickLookUi.visible}
  onmousedown={handleOverlayMouseDown}
>
  <QuickLookModal
    title={quickLookUi.title}
    preview={quickLookUi.preview}
    folder={quickLookUi.folder}
    info={quickLookUi.info}
    openLabel={quickLookUi.openLabel}
    onClose={handleClose}
    onOpen={handleOpen}
  />
</div>
