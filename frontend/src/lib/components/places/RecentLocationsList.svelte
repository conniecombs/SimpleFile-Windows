<script lang="ts">
  export type RecentLocationItem = {
    name: string;
    path: string;
    timestamp?: number;
  };

  let {
    recentLocations = [],
  }: {
    recentLocations?: RecentLocationItem[];
  } = $props();
</script>

{#if recentLocations.length === 0}
  <div class="top-menu-empty">No recent items</div>
{:else}
  {#each recentLocations as recent (recent.path)}
    <div class="recent-item" data-path={recent.path} role="listitem">
      <span class="recent-icon" aria-hidden="true">&#128193;</span>
      <span class="recent-name" title={recent.path}>{recent.name}</span>
    </div>
  {/each}
{/if}
