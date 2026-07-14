import { mount, unmount } from 'svelte';

import FileListHeaderCells, { type FileListHeaderColumn } from './layout-shell/FileListHeaderCells.svelte';

export type { FileListHeaderColumn };

export type RenderFileListHeaderProps = {
  columns?: FileListHeaderColumn[];
  pane?: 'primary' | 'secondary';
};

const mountedFileListHeaders = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearFileListHeader(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedFileListHeaders.get(target);
  if (component) {
    unmount(component);
    mountedFileListHeaders.delete(target);
  }

  delete (target as HTMLElement).dataset.svelteFileListHeader;
  target.replaceChildren();
}

export function renderFileListHeader(
  target: Element | null | undefined,
  props: RenderFileListHeaderProps = {},
) {
  if (!target) {
    return;
  }

  clearFileListHeader(target);
  const component = mount(FileListHeaderCells, {
    target,
    props: {
      columns: props.columns,
      pane: props.pane ?? 'primary',
    },
  });

  (target as HTMLElement).dataset.svelteFileListHeader = 'true';
  mountedFileListHeaders.set(target, component);
}
