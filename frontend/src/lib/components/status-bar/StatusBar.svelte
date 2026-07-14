<script lang="ts">
  export type StatusBarDisk = {
    freeText: string;
    name: string;
    usedPercent: number;
  };

  export type StatusBarGit = {
    branch: string;
    changeCount: number;
    changeText: string;
    title: string;
  };

  let {
    currentPath = null,
    disk = null,
    git = null,
    selectedCount = 0,
    selectedSizeText = null,
    totalItems = 0,
  }: {
    currentPath?: string | null;
    disk?: StatusBarDisk | null;
    git?: StatusBarGit | null;
    selectedCount?: number;
    selectedSizeText?: string | null;
    totalItems?: number;
  } = $props();
</script>

<span class="status-bar-section status-items">
  {totalItems} item{totalItems === 1 ? '' : 's'}
</span>

{#if selectedCount > 0}
  <span class="status-bar-section status-selected">
    {selectedCount} selected{selectedSizeText ? ` (${selectedSizeText})` : ''}
  </span>
{/if}

{#if currentPath}
  <span class="status-bar-section status-path" title={currentPath}>{currentPath}</span>
{/if}

{#if git}
  <span class="status-bar-section status-git" title={git.title}>
    <span class="status-git-label">Git</span>
    <span class="status-git-branch">{git.branch}</span>
    <span
      class={`status-git-state ${
        git.changeCount > 0 ? 'status-git-state--dirty' : 'status-git-state--clean'
      }`}
    >
      {git.changeText}
    </span>
  </span>
{/if}

{#if disk}
  <span class="status-bar-section status-disk" title={`${disk.name}: ${disk.freeText}`}>
    <span class="status-disk-text">{disk.freeText}</span>
    <span
      class="status-disk-meter"
      role="meter"
      aria-label="Disk usage"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(disk.usedPercent)}
    >
      <span
        class={`status-disk-fill ${
          disk.usedPercent >= 85 ? 'status-disk-fill--warning' : ''
        }`}
        style:width={`${disk.usedPercent}%`}
      ></span>
    </span>
  </span>
{/if}
