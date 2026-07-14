import { mount, unmount } from 'svelte';

import ColumnHeaderMenu from './context-menus/ColumnHeaderMenu.svelte';
import ContextMenu from './context-menus/ContextMenu.svelte';

export type ColumnHeaderMenuColumn = {
  id: string;
  label: string;
};

export type RenderColumnHeaderMenuProps = {
  columns?: ColumnHeaderMenuColumn[];
};

const mountedContextMenus = new WeakMap<Element, ReturnType<typeof mount>>();
const mountedColumnHeaderMenus = new WeakMap<Element, ReturnType<typeof mount>>();

function clearMounted(
  target: Element | null | undefined,
  map: WeakMap<Element, ReturnType<typeof mount>>,
  markerName?: string,
) {
  if (!target) {
    return;
  }

  const component = map.get(target);
  if (component) {
    unmount(component);
    map.delete(target);
  }

  if (markerName) {
    delete (target as HTMLElement).dataset[markerName];
  }
  target.replaceChildren();
}

export function clearContextMenu(target: Element | null | undefined) {
  clearMounted(target, mountedContextMenus, 'svelteContextMenu');
}

export function renderContextMenu(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  clearContextMenu(target);
  const component = mount(ContextMenu, { target });
  (target as HTMLElement).dataset.svelteContextMenu = 'true';
  mountedContextMenus.set(target, component);
}

export function clearColumnHeaderMenu(target: Element | null | undefined) {
  clearMounted(target, mountedColumnHeaderMenus, 'svelteColumnHeaderMenu');
}

export function renderColumnHeaderMenu(
  target: Element | null | undefined,
  props: RenderColumnHeaderMenuProps = {},
) {
  if (!target) {
    return;
  }

  clearColumnHeaderMenu(target);
  const component = mount(ColumnHeaderMenu, {
    target,
    props: {
      columns: props.columns ?? [],
    },
  });

  (target as HTMLElement).dataset.svelteColumnHeaderMenu = 'true';
  mountedColumnHeaderMenus.set(target, component);
}
