<script lang="ts">
  import type { ArchiveEntry } from './ArchiveContents.svelte';

  let {
    archivePath = '',
    compressedSize = null,
    entries = [],
    format = '',
    totalSize = null,
  }: {
    archivePath?: string;
    compressedSize?: number | null;
    entries?: ArchiveEntry[];
    format?: string;
    totalSize?: number | null;
  } = $props();

  function formatSize(bytes: number | null | undefined) {
    const value = Number(bytes ?? 0);
    if (!Number.isFinite(value) || value <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / 1024 ** unitIndex;
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function archiveName() {
    if (!archivePath) {
      return 'Archive';
    }

    const normalized = archivePath.split('\\').join('/');
    return normalized.split('/').filter(Boolean).pop() || archivePath;
  }

  function entryCount() {
    return `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`;
  }

  function resolvedTotalSize() {
    if (typeof totalSize === 'number') {
      return totalSize;
    }

    return entries.reduce((total, entry) => total + Number(entry.size ?? 0), 0);
  }

  function resolvedFormat() {
    return format ? format.toUpperCase() : 'Unknown';
  }
</script>

<div class="archive-info-item">
  <span class="archive-info-label">Archive</span>
  <span class="archive-info-value">{archiveName()}</span>
</div>
<div class="archive-info-item">
  <span class="archive-info-label">Entries</span>
  <span class="archive-info-value">{entryCount()}</span>
</div>
<div class="archive-info-item">
  <span class="archive-info-label">Total Size</span>
  <span class="archive-info-value">{formatSize(resolvedTotalSize())}</span>
</div>
<div class="archive-info-item">
  <span class="archive-info-label">Packed</span>
  <span class="archive-info-value">{compressedSize === null ? '-' : formatSize(compressedSize)}</span>
</div>
<div class="archive-info-item">
  <span class="archive-info-label">Format</span>
  <span class="archive-info-value">{resolvedFormat()}</span>
</div>
