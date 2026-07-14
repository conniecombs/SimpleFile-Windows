<script lang="ts">
  export type QuickAccessItem = {
    action?: string;
    icon: string;
    name: string;
    path?: string;
  };

  let {
    locations = [],
  }: {
    locations?: QuickAccessItem[];
  } = $props();
</script>

{#each locations as location, index (`${location.name}-${location.path || location.action || index}`)}
  <div
    class="quick-access-item"
    data-path={location.path || undefined}
    data-action={location.action || undefined}
    role="button"
    tabindex="0"
    onclick={(e) => {
      if (location.action) {
        e.currentTarget.dispatchEvent(new CustomEvent('simplefile:toolbar-command', { bubbles: true, detail: { command: location.action } }));
      } else if (location.path) {
        e.currentTarget.dispatchEvent(new CustomEvent('simplefile:tree-node-open', { bubbles: true, detail: { isDir: true, path: location.path } }));
      }
    }}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.currentTarget.click();
      }
    }}
  >
    <span class="quick-access-icon" aria-hidden="true">{location.icon}</span>
    <span class="quick-access-name">{location.name}</span>
  </div>
{/each}
