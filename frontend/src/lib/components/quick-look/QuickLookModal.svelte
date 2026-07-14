<script lang="ts">
  import { onDestroy } from 'svelte';

  export type QuickLookPreview = {
    file_type: string;
    content: string | null;
    mime_type: string;
    size: number;
  };

  let {
    legacyContent = null,
    preview = null,
    title = 'Preview',
  }: {
    legacyContent?: Node | string | null;
    preview?: QuickLookPreview | null;
    title?: string;
  } = $props();

  let contentElement: HTMLDivElement | undefined = $state();
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

  $effect(() => {
    if (!contentElement || legacyContent === null || legacyContent === undefined) {
      return;
    }

    contentElement.replaceChildren();
    if (legacyContent instanceof Node) {
      contentElement.replaceChildren(legacyContent);
    } else {
      contentElement.innerHTML = legacyContent;
    }
  });

  onDestroy(revokePdfUrl);
</script>

<div class="quicklook-modal" id="quicklook-modal">
  <div class="quicklook-header">
    <span class="quicklook-title" id="quicklook-title">{title}</span>
    <button class="quicklook-close" id="quicklook-close" type="button" aria-label="Close quick look">
      &times;
    </button>
  </div>
  <div class="quicklook-content" id="quicklook-content" bind:this={contentElement}>
    {#if legacyContent === null || legacyContent === undefined}
      {#if !preview}
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
    {/if}
  </div>
  <div class="quicklook-footer">
    <span class="quicklook-info" id="quicklook-info"></span>
    <button class="btn btn-primary" id="quicklook-open" type="button">Open with Default App</button>
  </div>
</div>
