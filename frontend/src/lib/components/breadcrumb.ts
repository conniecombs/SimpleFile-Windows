import { mount, unmount } from 'svelte';

import BreadcrumbTrail from './breadcrumb/BreadcrumbTrail.svelte';
import type { BreadcrumbSegment } from './breadcrumb/BreadcrumbTrail.svelte';

export type BreadcrumbTrailProps = {
  segments?: BreadcrumbSegment[];
};

const mountedBreadcrumbs = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearBreadcrumbTrail(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedBreadcrumbs.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mountedBreadcrumbs.delete(target);
}

export function renderBreadcrumbTrail(
  target: Element | null | undefined,
  props: BreadcrumbTrailProps,
) {
  if (!target) {
    return;
  }

  clearBreadcrumbTrail(target);
  target.replaceChildren();

  const component = mount(BreadcrumbTrail, {
    target,
    props,
  });

  mountedBreadcrumbs.set(target, component);
}
