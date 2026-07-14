import { mount, unmount } from 'svelte';

import QuickLookModal from './quick-look/QuickLookModal.svelte';
import type { QuickLookPreview } from './quick-look/QuickLookModal.svelte';

export type QuickLookProps = {
  legacyContent?: Node | string | null;
  preview?: QuickLookPreview | null;
  title?: string;
};

const mountedQuickLooks = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearQuickLook(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedQuickLooks.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mountedQuickLooks.delete(target);
}

export function renderQuickLook(
  target: Element | null | undefined,
  props: QuickLookProps,
) {
  if (!target) {
    return;
  }

  clearQuickLook(target);
  target.replaceChildren();

  const component = mount(QuickLookModal, {
    target,
    props,
  });

  mountedQuickLooks.set(target, component);
}
