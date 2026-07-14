<script lang="ts">
  export type BookmarkListItem = {
    id: string;
    name: string;
    path: string;
  };

  let {
    bookmarks = [],
    onNavigate,
    onRemove
  }: {
    bookmarks?: BookmarkListItem[];
    onNavigate?: (path: string) => void;
    onRemove?: (id: string) => void;
  } = $props();
</script>

{#if bookmarks.length === 0}
  <div class="top-menu-empty">No bookmarks yet</div>
{:else}
  {#each bookmarks as bookmark (bookmark.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="bookmark-item"
      data-path={bookmark.path}
      data-id={bookmark.id}
      role="listitem"
      onclick={() => onNavigate?.(bookmark.path)}
    >
      <span class="bookmark-icon" aria-hidden="true">&#128193;</span>
      <span class="bookmark-name">{bookmark.name}</span>
      <button
        type="button"
        class="bookmark-remove"
        title="Remove bookmark"
        aria-label="Remove bookmark"
        data-id={bookmark.id}
        data-path={bookmark.path}
        onclick={(e) => { e.stopPropagation(); onRemove?.(bookmark.id); }}
      >&times;</button>
    </div>
  {/each}
{/if}
