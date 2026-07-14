import { mount, unmount } from 'svelte';

import TreeView from './tree-view/TreeView.svelte';
import type { TreeViewNode } from './tree-view/TreeView.svelte';

export type RenderTreeViewProps = {
  roots?: TreeViewNode[];
};

const mountedTreeViews = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearTreeView(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedTreeViews.get(target);
  if (component) {
    unmount(component);
    mountedTreeViews.delete(target);
  }

  target.replaceChildren();
}

export function renderTreeView(
  target: Element | null | undefined,
  props: RenderTreeViewProps = {},
) {
  if (!target) {
    return;
  }

  clearTreeView(target);
  const component = mount(TreeView, {
    target,
    props: {
      roots: props.roots ?? [],
    },
  });

  mountedTreeViews.set(target, component);
}
