<script lang="ts">
  import type { SmartFolder } from '../../types';

  let {
    smartFolders = [],
    onNavigate,
    onRemove
  }: {
    smartFolders?: SmartFolder[];
    onNavigate?: (folder: SmartFolder) => void;
    onRemove?: (id: string) => void;
  } = $props();
</script>

{#if smartFolders.length === 0}
  <div class="top-menu-empty">No smart folders yet</div>
{:else}
  {#each smartFolders as folder (folder.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="bookmark-item"
      data-id={folder.id}
      role="listitem"
      onclick={() => onNavigate?.(folder)}
    >
      <span class="bookmark-icon" aria-hidden="true">{folder.icon || '🔍'}</span>
      <span class="bookmark-name">{folder.name}</span>
      <button
        type="button"
        class="bookmark-remove"
        title="Remove smart folder"
        aria-label="Remove smart folder"
        data-id={folder.id}
        onclick={(e) => { e.stopPropagation(); onRemove?.(folder.id); }}
      >&times;</button>
    </div>
  {/each}
{/if}

