<script lang="ts">
  export type NetworkDriveItem = {
    icon: string;
    mountPoint: string;
    name: string;
  };

  let {
    mounts = [],
    onUnmount,
  }: {
    mounts?: NetworkDriveItem[];
    onUnmount?: (mountPoint: string) => void;
  } = $props();
</script>

{#each mounts as mount (mount.mountPoint)}
  <div
    class="quick-access-item network-drive-item na-mount-row"
    data-path={mount.mountPoint}
    role="listitem"
  >
    <span class="quick-access-icon" aria-hidden="true">{mount.icon}</span>
    <span class="quick-access-text">
      <span class="quick-access-name text-truncate-flex">{mount.name}</span>
      <span class="quick-access-meta">{mount.mountPoint}</span>
    </span>
    <button
      type="button"
      class="sidebar-btn unmount-btn na-unmount-btn"
      data-mount-point={mount.mountPoint}
      title="Unmount"
      aria-label={`Unmount ${mount.name}`}
      onclick={(e) => {
        e.stopPropagation();
        onUnmount?.(mount.mountPoint);
      }}
    >
      &times;
    </button>
  </div>
{/each}
