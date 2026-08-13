<script lang="ts">
  import type { ColumnId } from '../../types';
  import type { FileListColumnId } from '../../fileListColumns';

  type ColumnHeaderMenuColumn = {
    checked?: boolean;
    disabled?: boolean;
    id: ColumnId;
    label: string;
  };

  let {
    columns = [],
    currentColumn = 'name',
    currentColumnLabel = 'Name',
  }: {
    columns?: ColumnHeaderMenuColumn[];
    currentColumn?: FileListColumnId;
    currentColumnLabel?: string;
  } = $props();
</script>

<div class="column-header-menu-title">Columns</div>
<label class="column-menu-item column-menu-item--disabled">
  <input type="checkbox" checked disabled />
  <span>Name</span>
</label>

{#each columns as column}
  <label class="column-menu-item">
    <input
      type="checkbox"
      data-column-toggle={column.id}
      checked={column.checked}
      disabled={column.disabled}
    />
    <span>{column.label}</span>
  </label>
{/each}

<hr class="column-menu-divider" />

<button
  type="button"
  class="column-menu-button"
  data-column-action="size-column-to-fit"
  data-column={currentColumn}
>
  Size Column to Fit
</button>

<button
  type="button"
  class="column-menu-button"
  data-column-action="size-all-columns-to-fit"
>
  Size All Columns to Fit
</button>

<button
  type="button"
  class="column-menu-button"
  data-column-action="reset-column-width"
  data-column={currentColumn}
>
  Reset {currentColumnLabel} Width
</button>

<button
  type="button"
  class="column-menu-button"
  data-column-action="reset-all-column-widths"
>
  Reset All Column Widths
</button>

<hr class="column-menu-divider" />

<button type="button" class="column-menu-button" data-column-action="more-columns">
  More...
</button>
