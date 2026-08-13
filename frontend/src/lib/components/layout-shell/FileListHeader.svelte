<script lang="ts">
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
  import {
    buildFileListColumnsForIds,
    DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
    normalizeVisibleColumns,
    type FileListColumnId,
  } from '../../fileListColumns';
  import FileListHeaderCells, { type FileListHeaderColumn } from './FileListHeaderCells.svelte';

  type Props = {
    columns?: FileListHeaderColumn[];
    pane?: 'primary' | 'secondary';
  };

  let { columns = undefined, pane = 'primary' }: Props = $props();
  let visibleColumns = $derived(appState.settings?.visibleColumns || DEFAULT_VISIBLE_FILE_LIST_COLUMNS);
  let headerColumnIds = $derived.by((): FileListColumnId[] => (
    columns ? columns.map((column) => column.id) : ['name', ...normalizeVisibleColumns(visibleColumns)]
  ));
  let fileListColumnTemplate = $derived.by(() => (
    buildFileListColumnsForIds(appState.settings, headerColumnIds)
  ));
</script>

<div
  class="file-list-header"
  role="row"
  aria-label={pane === 'secondary' ? 'Secondary column headers' : 'Column headers'}
  style={`--file-list-columns: ${fileListColumnTemplate};`}
>
  <FileListHeaderCells {columns} {pane} />
</div>
