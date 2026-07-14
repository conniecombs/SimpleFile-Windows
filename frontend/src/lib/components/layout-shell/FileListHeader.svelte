<script lang="ts">
  import FileListHeaderCells, { type FileListHeaderColumn } from './FileListHeaderCells.svelte';

  type Props = {
    columns?: FileListHeaderColumn[];
    pane?: 'primary' | 'secondary';
  };

  let { columns = undefined, pane = 'primary' }: Props = $props();
</script>

<div class="file-list-header" role="row" aria-label={pane === 'secondary' ? 'Secondary column headers' : 'Column headers'}>
  <FileListHeaderCells {columns} {pane} />
</div>
