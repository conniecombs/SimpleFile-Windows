<script lang="ts">
  import { tick } from 'svelte';
  import {
    cancelModalUi,
    confirmModalUi,
    modalUi,
  } from '../app/modalUi.svelte';
  import ModalBody from './modal-body/ModalBody.svelte';
  import SettingsBody from './settings-body/SettingsBody.svelte';

  let promptInput: HTMLInputElement | null = $state(null);
  let htmlBodyHost: HTMLDivElement | null = $state(null);

  $effect(() => {
    if (!modalUi.visible) return;
    if (modalUi.kind === 'prompt') {
      void tick().then(() => promptInput?.focus());
      return;
    }
    if (modalUi.kind === 'html' && htmlBodyHost) {
      void tick().then(() => {
        htmlBodyHost
          ?.querySelector<HTMLElement>('input, button, select, textarea')
          ?.focus();
      });
    }
  });

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      if (modalUi.kind === 'settings') {
        cancelModalUi();
        return;
      }
      cancelModalUi();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!modalUi.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelModalUi();
      return;
    }
    if (event.key === 'Enter' && modalUi.kind === 'prompt' && event.target === promptInput) {
      event.preventDefault();
      confirmModalUi();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-overlay"
  class:visible={modalUi.visible}
  id="modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-hidden={!modalUi.visible}
  onmousedown={handleOverlayMouseDown}
>
  <div class={['modal', modalUi.modalClass].filter(Boolean).join(' ')} id="modal">
    <div class="modal-header">
      <h3 id="modal-title">{modalUi.title}</h3>
      <button
        type="button"
        class="modal-close"
        id="modal-close"
        aria-label="Close"
        onclick={() => cancelModalUi()}
      >
        &times;
      </button>
    </div>
    <div
      class={['modal-body', modalUi.bodyClass].filter(Boolean).join(' ')}
      id="modal-body"
      bind:this={htmlBodyHost}
    >
      {#if modalUi.kind === 'settings'}
        <SettingsBody />
      {:else if modalUi.kind === 'html'}
        <ModalBody bodyHtml={modalUi.bodyHtml} />
      {:else}
        {#if modalUi.message}
          <p>{modalUi.message}</p>
        {/if}
        {#if modalUi.kind === 'prompt'}
          <div class="form-group">
            <label class="form-label" for="core-dialog-input">{modalUi.promptLabel}</label>
            <input
              id="core-dialog-input"
              class="form-input input-full"
              bind:this={promptInput}
              bind:value={modalUi.promptValue}
            />
          </div>
        {/if}
      {/if}
    </div>
    <div class="modal-footer" id="modal-footer">
      {#if modalUi.showCancel}
        <button
          type="button"
          class="btn btn-secondary"
          id="modal-cancel"
          onclick={() => cancelModalUi()}
        >
          {modalUi.cancelText}
        </button>
      {:else}
        <button
          type="button"
          class="btn btn-secondary"
          id="modal-cancel"
          style="display: none;"
          tabindex="-1"
          aria-hidden="true"
        >
          {modalUi.cancelText}
        </button>
      {/if}
      {#if modalUi.showConfirm}
        <button
          type="button"
          class="btn btn-primary"
          id="modal-confirm"
          onclick={() => confirmModalUi()}
        >
          {modalUi.confirmText}
        </button>
      {/if}
    </div>
  </div>
</div>
