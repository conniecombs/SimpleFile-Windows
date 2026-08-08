<script lang="ts">
  import {
    closeKeyboardHelpUi,
    keyboardHelpUi,
  } from '../app/keyboardHelpUi.svelte';

  function handleClose(event?: Event) {
    event?.preventDefault();
    closeKeyboardHelpUi();
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose(event);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!keyboardHelpUi.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose(event);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-overlay"
  class:visible={keyboardHelpUi.visible}
  id="keyboard-help-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="keyboard-help-heading"
  aria-hidden={!keyboardHelpUi.visible}
  onmousedown={handleOverlayMouseDown}
>
  <div class="modal keyboard-help-modal">
    <div class="modal-header">
      <h3 id="keyboard-help-heading">Keyboard Shortcuts</h3>
      <button
        type="button"
        class="modal-close"
        id="keyboard-help-close"
        aria-label="Close keyboard shortcuts"
        onclick={handleClose}
      >&times;</button>
    </div>
    <div class="modal-body keyboard-help-body">
      {#if keyboardHelpUi.sections.length === 0}
        <p class="muted">No shortcuts available.</p>
      {:else}
        {#each keyboardHelpUi.sections as section (section.title)}
          <div class="shortcuts-section">
            <h4>{section.title}</h4>
            {#each section.rows as row (`${section.title}:${row.action}:${row.shortcut}`)}
              <div class="shortcut-row">
                <kbd>{row.shortcut}</kbd>
                <span>{row.action}</span>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-primary" id="keyboard-help-ok" onclick={handleClose}>OK</button>
    </div>
  </div>
</div>
