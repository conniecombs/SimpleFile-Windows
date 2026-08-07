<script lang="ts">
  import {
    cancelProgressUi,
    formatProgressBytes,
    formatProgressEta,
    formatProgressRate,
    isProgressCancelling,
    progressItemLabel,
    progressUi,
  } from '../app/progressUi.svelte';

  const percentLabel = $derived(`${Math.round(progressUi.percent)}%`);
  const fillWidth = $derived(`${Math.max(0, Math.min(100, progressUi.percent))}%`);
  const isIndeterminate = $derived(
    progressUi.visible
      && progressUi.phase === 'running'
      && (progressUi.totalBytes == null || progressUi.totalBytes <= 0)
      && progressUi.percent <= 0,
  );
  const transferLine = $derived.by(() => {
    if (progressUi.currentBytes == null && progressUi.totalBytes == null) return '';
    const current = formatProgressBytes(progressUi.currentBytes ?? 0);
    if (progressUi.totalBytes != null && progressUi.totalBytes > 0) {
      return `${current} of ${formatProgressBytes(progressUi.totalBytes)}`;
    }
    return `${current} copied`;
  });
  const rateLabel = $derived(formatProgressRate(progressUi.bytesPerSecond));
  const etaLabel = $derived(
    progressUi.phase === 'cancelling' ? '' : formatProgressEta(progressUi.etaSeconds),
  );
  const itemLabel = $derived(progressItemLabel(progressUi.item));
  const cancelling = $derived(isProgressCancelling());

  function handleCancelClick(event: MouseEvent) {
    event.preventDefault();
    cancelProgressUi();
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    // Progress is non-dismissible by backdrop click (matches prior behavior).
    event.stopPropagation();
  }
</script>

<div
  class="modal-overlay"
  class:visible={progressUi.visible}
  id="progress-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="progress-title"
  aria-busy={progressUi.visible}
  aria-hidden={!progressUi.visible}
  onmousedown={handleOverlayMouseDown}
>
  <div class="modal progress-modal">
    <div class="modal-header">
      <h3 id="progress-title">{progressUi.title}</h3>
    </div>
    <div class="modal-body">
      <div class="progress-container">
        <div
          class="progress-bar"
          class:indeterminate={isIndeterminate}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isIndeterminate ? undefined : Math.round(progressUi.percent)}
          aria-label={progressUi.title}
        >
          <div
            class="progress-bar-fill"
            id="progress-bar-fill"
            style:width={isIndeterminate ? undefined : fillWidth}
          ></div>
        </div>

        <div class="progress-info">
          <span id="progress-text">{isIndeterminate ? 'Working…' : percentLabel}</span>
          {#if transferLine}
            <span class="progress-transfer" id="progress-transfer">{transferLine}</span>
          {/if}
          {#if rateLabel}
            <span class="progress-rate" id="progress-rate">{rateLabel}</span>
          {/if}
        </div>

        {#if etaLabel}
          <div class="progress-eta" id="progress-eta">{etaLabel}</div>
        {/if}

        {#if progressUi.statusMessage}
          <div class="progress-status" id="progress-status" role="status" aria-live="polite">
            {progressUi.statusMessage}
          </div>
        {/if}

        <div class="progress-item" id="progress-item" title={progressUi.item}>
          {itemLabel}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button
        type="button"
        class="btn btn-secondary"
        id="progress-cancel"
        disabled={cancelling}
        onclick={handleCancelClick}
      >
        {cancelling ? 'Cancelling…' : 'Cancel'}
      </button>
    </div>
  </div>
</div>
