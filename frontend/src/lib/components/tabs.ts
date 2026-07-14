import { mount, unmount } from 'svelte';

import TabsBar from './tabs/TabsBar.svelte';
import type { TabView } from './tabs/TabsBar.svelte';

export type TabsBarProps = {
  activeTabId?: string | null;
  tabs?: TabView[];
};

const mountedTabs = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearTabsBar(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedTabs.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mountedTabs.delete(target);
}

export function renderTabsBar(
  target: Element | null | undefined,
  props: TabsBarProps,
) {
  if (!target) {
    return;
  }

  clearTabsBar(target);
  target.replaceChildren();

  const component = mount(TabsBar, {
    target,
    props,
  });

  mountedTabs.set(target, component);
}
