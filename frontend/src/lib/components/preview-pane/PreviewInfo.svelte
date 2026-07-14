<script lang="ts">
  import type { FileEntry, FilePreview } from '../../types';
  import type { PreviewPaneMode } from './PreviewContent.svelte';

  let {
    entry = null,
    mode = 'empty',
    preview = null,
  }: {
    entry?: FileEntry | null;
    mode?: PreviewPaneMode;
    preview?: FilePreview | null;
  } = $props();

  function formatSize(bytes: number) {
    const numericBytes = Number(bytes);
    if (!Number.isFinite(numericBytes) || numericBytes < 0) return '-';
    if (numericBytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = numericBytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  }
</script>

{#if mode === 'folder' && entry}
  <div class="preview-info-row">
    <span class="preview-info-label">Name</span>
    <span class="preview-info-value">{entry.name}</span>
  </div>
{:else if mode === 'preview' && entry && preview}
  <div class="preview-info-row">
    <span class="preview-info-label">Name</span>
    <span class="preview-info-value">{entry.name}</span>
  </div>
  <div class="preview-info-row">
    <span class="preview-info-label">Size</span>
    <span class="preview-info-value">{formatSize(preview.size)}</span>
  </div>
  <div class="preview-info-row">
    <span class="preview-info-label">Type</span>
    <span class="preview-info-value">{preview.mime_type}</span>
  </div>
{/if}

