<script lang="ts">
  type ColumnHeaderMenuColumn = {
    id: string;
    label: string;
  };

  let { columns = [] }: { columns?: ColumnHeaderMenuColumn[] } = $props();
</script>

<div class="column-header-menu-title">Columns</div>
<label class="column-menu-item column-menu-item--disabled">
  <input type="checkbox" checked disabled />
  <span>Name</span>
</label>

{#each columns as column}
  <label class="column-menu-item">
    <input type="checkbox" data-column-toggle={column.id} />
    <span>{column.label}</span>
  </label>
{/each}

<button type="button" class="column-menu-button" data-column-reset-widths>
  Reset column widths
</button>
