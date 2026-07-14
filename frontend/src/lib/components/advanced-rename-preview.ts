import { mount, unmount } from 'svelte';

import AdvancedRenamePreview from './advanced-rename-preview/AdvancedRenamePreview.svelte';
import type {
  AdvancedRenamePreviewMode,
  AdvancedRenamePreviewRow,
} from './advanced-rename-preview/AdvancedRenamePreview.svelte';

export type RenderAdvancedRenamePreviewProps = {
  extraCount?: number;
  limit?: number;
  message?: string;
  mode: AdvancedRenamePreviewMode;
  rows?: AdvancedRenamePreviewRow[];
  totalRows?: number;
};

const mountedPreviews = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearAdvancedRenamePreview(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedPreviews.get(target);
  if (component) {
    unmount(component);
    mountedPreviews.delete(target);
  }

  target.replaceChildren();
}

export function renderAdvancedRenamePreview(
  target: Element | null | undefined,
  props: RenderAdvancedRenamePreviewProps,
) {
  if (!target) {
    return;
  }

  clearAdvancedRenamePreview(target);

  const component = mount(AdvancedRenamePreview, {
    target,
    props,
  });

  mountedPreviews.set(target, component);
}
