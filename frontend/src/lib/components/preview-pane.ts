import { mount, unmount } from 'svelte';

import PreviewContent from './preview-pane/PreviewContent.svelte';
import type { PreviewPaneMode } from './preview-pane/PreviewContent.svelte';
import PreviewInfo from './preview-pane/PreviewInfo.svelte';
import type { FileEntry, FilePreview } from '../types';

export type PreviewPaneProps = {
  entry?: FileEntry | null;
  error?: string;
  mode?: PreviewPaneMode;
  preview?: FilePreview | null;
};

const mountedContent = new WeakMap<Element, ReturnType<typeof mount>>();
const mountedInfo = new WeakMap<Element, ReturnType<typeof mount>>();

function clearMounted(target: Element | null | undefined, mounted: WeakMap<Element, ReturnType<typeof mount>>) {
  if (!target) {
    return;
  }

  const component = mounted.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mounted.delete(target);
}

export function clearPreviewPane(
  contentTarget: Element | null | undefined,
  infoTarget?: Element | null | undefined,
) {
  clearMounted(contentTarget, mountedContent);
  clearMounted(infoTarget, mountedInfo);
  contentTarget?.replaceChildren();
  infoTarget?.replaceChildren();
}

export function renderPreviewPane(
  contentTarget: Element | null | undefined,
  infoTarget: Element | null | undefined,
  props: PreviewPaneProps,
) {
  if (!contentTarget) {
    return;
  }

  clearPreviewPane(contentTarget, infoTarget);

  const contentComponent = mount(PreviewContent, {
    target: contentTarget,
    props,
  });
  mountedContent.set(contentTarget, contentComponent);

  if (infoTarget) {
    const infoComponent = mount(PreviewInfo, {
      target: infoTarget,
      props,
    });
    mountedInfo.set(infoTarget, infoComponent);
  }
}

