<script lang="ts">
  import { toasts, triggerToastAction } from './toastStore';
</script>

<div class="svelte-toast-region" aria-live="polite" aria-atomic="true">
  {#each $toasts as toast (toast.id)}
    <div
      class={`toast ${toast.kind}`}
      class:fade-out={toast.fading}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{toast.message}</span>
      {#if toast.action}
        <button
          type="button"
          class="toast-undo btn btn-link"
          onclick={(event) => {
            event.stopPropagation();
            triggerToastAction(toast);
          }}
        >
          {toast.action.label}
        </button>
      {/if}
    </div>
  {/each}
</div>
