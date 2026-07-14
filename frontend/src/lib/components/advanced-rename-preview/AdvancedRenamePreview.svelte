<script lang="ts">
  export type AdvancedRenamePreviewMode = 'loading' | 'error' | 'empty' | 'rows';

  export type AdvancedRenamePreviewRow = {
    changed: boolean;
    detail: string;
    error?: string | null;
    newName: string;
    oldName: string;
  };

  let {
    extraCount = 0,
    limit = 500,
    message = '',
    mode = 'empty',
    rows = [],
    totalRows = 0,
  }: {
    extraCount?: number;
    limit?: number;
    message?: string;
    mode?: AdvancedRenamePreviewMode;
    rows?: AdvancedRenamePreviewRow[];
    totalRows?: number;
  } = $props();

  function rowClass(row: AdvancedRenamePreviewRow) {
    return [
      'adv-preview-row',
      row.changed ? 'adv-preview-changed' : '',
      row.error ? 'adv-preview-invalid' : '',
    ].filter(Boolean).join(' ');
  }
</script>

{#if mode === 'loading'}
  <div class="adv-preview-state">{message || 'Building preview...'}</div>
{:else if mode === 'error'}
  <div class="adv-preview-state adv-preview-error">{message}</div>
{:else if mode === 'empty'}
  <div class="adv-preview-state">{message || 'No matching files.'}</div>
{:else}
  {#each rows as row, index (`${row.oldName}-${row.newName}-${row.detail}-${index}`)}
    <div class={rowClass(row)}>
      <div class="adv-preview-names">
        <span class="adv-preview-old">{row.oldName}</span>
        <span class="adv-preview-arrow">-&gt;</span>
        <span class="adv-preview-new">{row.newName}</span>
      </div>
      <div class="adv-preview-path">{row.error || row.detail}</div>
    </div>
  {/each}
  {#if extraCount > 0}
    <div class="adv-preview-state">Showing first {limit} of {totalRows} targets.</div>
  {/if}
{/if}
