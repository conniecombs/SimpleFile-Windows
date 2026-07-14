import { mount, unmount } from 'svelte';

import StatusBar from './status-bar/StatusBar.svelte';
import type { StatusBarDisk, StatusBarGit } from './status-bar/StatusBar.svelte';

export type LegacyStatusBarProps = {
  currentPath?: string | null;
  disk?: StatusBarDisk | null;
  git?: StatusBarGit | null;
  selectedCount?: number;
  selectedSizeText?: string | null;
  totalItems?: number;
};

const mountedStatusBars = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearStatusBar(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedStatusBars.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mountedStatusBars.delete(target);
}

export function renderStatusBar(
  target: Element | null | undefined,
  props: LegacyStatusBarProps,
) {
  if (!target) {
    return;
  }

  clearStatusBar(target);
  target.replaceChildren();

  const component = mount(StatusBar, {
    target,
    props,
  });

  mountedStatusBars.set(target, component);
}
