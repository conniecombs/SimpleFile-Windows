import { mount, unmount } from 'svelte';

import AppShell from './layout-shell/AppShell.svelte';

const mountedShells = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearLayoutShell(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedShells.get(target);
  if (component) {
    unmount(component);
    mountedShells.delete(target);
  }

  delete (target as HTMLElement).dataset.svelteLayoutShell;
  target.replaceChildren();
}

export function renderLayoutShell(target: Element | null | undefined = document.querySelector('.app-container')) {
  if (!target) {
    return;
  }

  clearLayoutShell(target);
  const component = mount(AppShell, { target });

  (target as HTMLElement).dataset.svelteLayoutShell = 'true';
  mountedShells.set(target, component);
}
