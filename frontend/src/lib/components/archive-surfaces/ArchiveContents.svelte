<script lang="ts">
  export type ArchiveEntry = {
    compressed_size?: number | null;
    is_dir?: boolean;
    isDir?: boolean;
    name?: string | null;
    path?: string | null;
    size?: number | null;
  };

  let { entries = [] }: { entries?: ArchiveEntry[] } = $props();

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

  function isDirectory(entry: ArchiveEntry) {
    return Boolean(entry.is_dir ?? entry.isDir);
  }

  function entryName(entry: ArchiveEntry) {
    return entry.name || entry.path || '(unnamed)';
  }

  function entryKey(entry: ArchiveEntry, index: number) {
    return `${entry.path ?? entry.name ?? 'entry'}-${index}`;
  }
</script>

{#if entries.length === 0}
  <div class="archive-entry archive-item archive-empty">No archive entries</div>
{:else}
  {#each entries as entry, index (entryKey(entry, index))}
    <div class="archive-entry archive-item" data-path={entry.path ?? ''}>
      <span class="icon archive-icon" aria-hidden="true">{isDirectory(entry) ? '📁' : '📄'}</span>
      <span class="name archive-name">{entryName(entry)}</span>
      <span class="size archive-size">{isDirectory(entry) ? '-' : formatSize(entry.size)}</span>
    </div>
  {/each}
{/if}
