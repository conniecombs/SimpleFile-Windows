<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { FileEntry } from '../../types';

  export type QuickLookPreview = {
    file_type: string;
    content: string | null;
    mime_type: string;
    size: number;
  };

  export type QuickLookFolderSummary = {
    entries: FileEntry[];
    error: string | null;
    loading: boolean;
    metricsError: string | null;
    metricsLoading: boolean;
    recursiveCount: number | null;
    recursiveSize: number | null;
    totalEntries: number | null;
    truncated: boolean;
  };

  let {
    folder = null,
    info = '',
    openLabel = 'Open with Default App',
    preview = null,
    title = 'Preview',
    onClose = undefined,
    onOpen = undefined,
  }: {
    folder?: QuickLookFolderSummary | null;
    info?: string;
    openLabel?: string;
    preview?: QuickLookPreview | null;
    title?: string;
    onClose?: (event?: Event) => void;
    onOpen?: (event: MouseEvent) => void;
  } = $props();

  let pdfUrl: string | null = $state(null);
  let activePdfUrl: string | null = null;

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

  function formatCount(value: number | null | undefined) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) return '-';
    return Math.trunc(numericValue).toLocaleString();
  }

  function entryType(entry: FileEntry) {
    if (entry.is_dir) return 'Folder';
    return entry.extension ? entry.extension.toUpperCase() : 'File';
  }

  function entrySize(entry: FileEntry) {
    return entry.is_dir ? '-' : formatSize(entry.size);
  }

  function metricsSizeLabel(summary: QuickLookFolderSummary) {
    if (summary.metricsLoading) return 'Scanning...';
    if (summary.recursiveSize === null) return '-';
    return formatSize(summary.recursiveSize);
  }

  function metricsCountLabel(summary: QuickLookFolderSummary) {
    if (summary.metricsLoading) return 'Scanning...';
    return formatCount(summary.recursiveCount);
  }

  function revokePdfUrl() {
    if (activePdfUrl) {
      URL.revokeObjectURL(activePdfUrl);
      activePdfUrl = null;
    }

    pdfUrl = null;
  }

  function pdfBlobUrl(base64Content: string) {
    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }

  $effect(() => {
    revokePdfUrl();

    if (preview?.file_type === 'pdf' && preview.content) {
      activePdfUrl = pdfBlobUrl(preview.content);
      pdfUrl = activePdfUrl;
    }

    return revokePdfUrl;
  });

  onDestroy(revokePdfUrl);
</script>

<div class="quicklook-modal" id="quicklook-modal">
  <div class="quicklook-header">
    <span class="quicklook-title" id="quicklook-title">{title}</span>
    <button
      class="quicklook-close"
      id="quicklook-close"
      type="button"
      aria-label="Close quick look"
      onclick={(event) => onClose?.(event)}
    >
      &times;
    </button>
  </div>
  <div class="quicklook-content" id="quicklook-content">
    {#if folder}
      <div class="quicklook-folder-preview">
        <div class="quicklook-folder-metrics" aria-label="Folder summary">
          <div class="quicklook-folder-metric">
            <span>Direct Items</span>
            <strong>{folder.loading ? 'Loading...' : formatCount(folder.totalEntries ?? folder.entries.length)}</strong>
          </div>
          <div class="quicklook-folder-metric">
            <span>Total Items</span>
            <strong>{metricsCountLabel(folder)}</strong>
          </div>
          <div class="quicklook-folder-metric">
            <span>Total Size</span>
            <strong>{metricsSizeLabel(folder)}</strong>
          </div>
        </div>

        {#if folder.metricsError}
          <div class="quicklook-folder-note">{folder.metricsError}</div>
        {/if}

        <div class="quicklook-folder-list" aria-label="Folder contents">
          <div class="quicklook-folder-list-header">
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Modified</span>
          </div>

          {#if folder.error}
            <div class="quicklook-folder-empty">
              <span class="icon" aria-hidden="true">&#9888;</span>
              <p>{folder.error}</p>
            </div>
          {:else if folder.loading}
            <div class="quicklook-folder-empty">
              <span class="icon" aria-hidden="true">&#9203;</span>
              <p>Loading folder contents...</p>
            </div>
          {:else if folder.entries.length === 0}
            <div class="quicklook-folder-empty">
              <span class="icon" aria-hidden="true">&#128193;</span>
              <p>Folder is empty</p>
            </div>
          {:else}
            {#each folder.entries as entry (entry.path)}
              <div class="quicklook-folder-row">
                <span class="quicklook-folder-icon" aria-hidden="true">
                  {#if entry.is_dir}&#128193;{:else}&#128196;{/if}
                </span>
                <span class="quicklook-folder-name" title={entry.path}>{entry.name}</span>
                <span class="quicklook-folder-type">{entryType(entry)}</span>
                <span class="quicklook-folder-size">{entrySize(entry)}</span>
                <span class="quicklook-folder-modified">{entry.modified || '-'}</span>
              </div>
            {/each}
          {/if}
        </div>

        {#if folder.truncated && folder.totalEntries !== null}
          <div class="quicklook-folder-note">
            Showing first {folder.entries.length.toLocaleString()} of {folder.totalEntries.toLocaleString()} items.
          </div>
        {/if}
      </div>
    {:else if !preview}
      <div class="no-preview">
        <span class="icon" aria-hidden="true">&#128065;</span>
        <p>No preview available</p>
      </div>
    {:else if preview.file_type === 'image' && preview.content}
      <img src={`data:${preview.mime_type};base64,${preview.content}`} alt={title} />
    {:else if preview.file_type === 'text'}
      <pre>{preview.content || ''}</pre>
    {:else if preview.file_type === 'pdf'}
      {#if pdfUrl}
        <embed class="quicklook-pdf" type="application/pdf" src={pdfUrl} />
      {:else}
        <div class="no-preview">
          <span class="icon" aria-hidden="true">&#128213;</span>
          <p>PDF too large to preview</p>
        </div>
      {/if}
    {:else}
      <div class="preview-info">
        <p>Type: {preview.mime_type}</p>
        <p>Size: {formatSize(preview.size)}</p>
      </div>
    {/if}
  </div>
  <div class="quicklook-footer">
    <span class="quicklook-info" id="quicklook-info">{info}</span>
    <button
      class="btn btn-primary"
      id="quicklook-open"
      type="button"
      onclick={(event) => onOpen?.(event)}
    >{openLabel}</button>
  </div>
</div>
