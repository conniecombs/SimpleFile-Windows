<script lang="ts">
  let { count = 8 }: { count?: number } = $props();

  function rows() {
    return Array.from({ length: Math.max(0, count) }, (_, index) => index);
  }
</script>

{#each rows() as row (row)}
  <div class="skeleton-item">
    <div class="skeleton skeleton-icon"></div>
    <div class="skeleton skeleton-text name"></div>
    <div class="skeleton skeleton-text size"></div>
    <div class="skeleton skeleton-text date"></div>
    <div class="skeleton skeleton-text type"></div>
  </div>
{/each}
