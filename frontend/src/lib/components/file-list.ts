import { mount, unmount } from 'svelte';

import FileListItems from './file-list/FileListItems.svelte';
import type { FileListViewItem } from './file-list/FileListItems.svelte';
import FileListSkeleton from './file-list/FileListSkeleton.svelte';

export type RenderFileListItemsProps = {
  isGrid?: boolean;
  items?: FileListViewItem[];
  mode?: 'simple' | 'virtual';
  visibleColumns?: string[];
};

export type RenderFileListSkeletonProps = {
  count?: number;
};

const mountedFileLists = new WeakMap<Element, ReturnType<typeof mount>>();
const mountedFileListSkeletons = new WeakMap<Element, ReturnType<typeof mount>>();

function clearMounted(target: Element, map: WeakMap<Element, ReturnType<typeof mount>>) {
  const component = map.get(target);
  if (component) {
    unmount(component);
    map.delete(target);
  }
}

export function clearFileListItems(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  clearMounted(target, mountedFileLists);
  clearMounted(target, mountedFileListSkeletons);
  target.replaceChildren();
}

export function renderFileListItems(
  target: Element | null | undefined,
  props: RenderFileListItemsProps,
) {
  if (!target) {
    return;
  }

  clearFileListItems(target);
  const component = mount(FileListItems, {
    target,
    props: {
      isGrid: props.isGrid ?? false,
      items: props.items ?? [],
      mode: props.mode ?? 'simple',
      visibleColumns: props.visibleColumns ?? ['size', 'date', 'type'],
    },
  });

  mountedFileLists.set(target, component);
}

export function renderFileListSkeleton(
  target: Element | null | undefined,
  props: RenderFileListSkeletonProps = {},
) {
  if (!target) {
    return;
  }

  clearFileListItems(target);
  const component = mount(FileListSkeleton, {
    target,
    props: {
      count: props.count ?? 8,
    },
  });

  mountedFileListSkeletons.set(target, component);
}
