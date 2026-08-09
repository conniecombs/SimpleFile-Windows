<script lang="ts">
  import { onDestroy } from 'svelte';

  import ContentShell from './ContentShell.svelte';
  import SidebarShell from './SidebarShell.svelte';
  import ToolbarShell from './ToolbarShell.svelte';
  import CommandPalette from './CommandPalette.svelte';
  const SIDEBAR_MIN_WIDTH = 150;
  const SIDEBAR_MAX_WIDTH = 600;

  let sidebarResizing = $state(false);
  let sidebarWidth = $state(0);
  let cleanupSidebarResize: (() => void) | undefined;

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function currentSidebarWidth() {
    const rawValue = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width');
    const parsedValue = Number.parseFloat(rawValue);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }

    const sidebarRect = document.querySelector('.sidebar')?.getBoundingClientRect();
    return sidebarRect?.width ?? SIDEBAR_MIN_WIDTH;
  }

  function setSidebarWidth(nextWidth: number) {
    const clampedWidth = clamp(nextWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
    sidebarWidth = Math.round(clampedWidth);
    document.documentElement.style.setProperty('--sidebar-width', `${clampedWidth}px`);
  }

  function handleSidebarKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 32 : 16;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth(currentSidebarWidth() - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth(currentSidebarWidth() + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MAX_WIDTH);
    }
  }

  function beginSidebarResize(event: MouseEvent) {
    event.preventDefault();
    cleanupSidebarResize?.();
    sidebarResizing = true;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function handleMove(moveEvent: MouseEvent) {
      setSidebarWidth(moveEvent.clientX);
    }

    function stopResize() {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', stopResize);
      window.removeEventListener('blur', stopResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      sidebarResizing = false;
      cleanupSidebarResize = undefined;
    }

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', stopResize);
    window.addEventListener('blur', stopResize);
    cleanupSidebarResize = stopResize;
  }

  onDestroy(() => {
    cleanupSidebarResize?.();
  });
</script>

<SidebarShell />

<button
  class:dragging={sidebarResizing}
  class="resize-handle"
  id="sidebar-resizer"
  type="button"
  aria-label="Resize sidebar"
  title="Resize sidebar"
  onmousedown={beginSidebarResize}
  onkeydown={handleSidebarKeydown}
></button>

<main class="main-content">
  <ToolbarShell />
  <ContentShell />

  <CommandPalette />
  <footer class="status-bar" id="status-bar">
    <span id="status-items">0 items</span>
    <span id="status-selected"></span>
    <span id="status-path"></span>

  </footer>
</main>
