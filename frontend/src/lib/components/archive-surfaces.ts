import { mount, unmount } from 'svelte';

import ArchiveContents from './archive-surfaces/ArchiveContents.svelte';
import type { ArchiveEntry } from './archive-surfaces/ArchiveContents.svelte';
import ArchiveInfo from './archive-surfaces/ArchiveInfo.svelte';
import CreateArchiveBody from './archive-surfaces/CreateArchiveBody.svelte';

export type RenderArchiveContentsProps = {
  entries?: ArchiveEntry[];
};

export type RenderArchiveInfoProps = {
  archivePath?: string;
  compressedSize?: number | null;
  entries?: ArchiveEntry[];
  format?: string;
  totalSize?: number | null;
};

export type RenderCreateArchiveBodyProps = {
  defaultName?: string;
  format?: string;
  selectedNames?: string[];
};

const mountedArchiveContents = new WeakMap<Element, ReturnType<typeof mount>>();
const mountedArchiveInfo = new WeakMap<Element, ReturnType<typeof mount>>();
const mountedCreateArchiveBodies = new WeakMap<Element, ReturnType<typeof mount>>();

function clearMounted(
  target: Element | null | undefined,
  map: WeakMap<Element, ReturnType<typeof mount>>,
  markerName?: string,
) {
  if (!target) {
    return;
  }

  const component = map.get(target);
  if (component) {
    unmount(component);
    map.delete(target);
  }

  if (markerName) {
    delete (target as HTMLElement).dataset[markerName];
  }

  target.replaceChildren();
}

export function clearArchiveContents(target: Element | null | undefined) {
  clearMounted(target, mountedArchiveContents, 'svelteArchiveContents');
}

export function renderArchiveContents(
  target: Element | null | undefined,
  props: RenderArchiveContentsProps = {},
) {
  if (!target) {
    return;
  }

  clearArchiveContents(target);
  const component = mount(ArchiveContents, {
    target,
    props: {
      entries: props.entries ?? [],
    },
  });

  (target as HTMLElement).dataset.svelteArchiveContents = 'true';
  mountedArchiveContents.set(target, component);
}

export function clearArchiveInfo(target: Element | null | undefined) {
  clearMounted(target, mountedArchiveInfo, 'svelteArchiveInfo');
}

export function renderArchiveInfo(
  target: Element | null | undefined,
  props: RenderArchiveInfoProps = {},
) {
  if (!target) {
    return;
  }

  clearArchiveInfo(target);
  const component = mount(ArchiveInfo, {
    target,
    props: {
      archivePath: props.archivePath ?? '',
      compressedSize: props.compressedSize ?? null,
      entries: props.entries ?? [],
      format: props.format ?? '',
      totalSize: props.totalSize ?? null,
    },
  });

  (target as HTMLElement).dataset.svelteArchiveInfo = 'true';
  mountedArchiveInfo.set(target, component);
}

export function clearCreateArchiveBody(target: Element | null | undefined) {
  clearMounted(target, mountedCreateArchiveBodies, 'svelteCreateArchiveBody');
}

export function renderCreateArchiveBody(
  target: Element | null | undefined,
  props: RenderCreateArchiveBodyProps = {},
) {
  if (!target) {
    return;
  }

  clearCreateArchiveBody(target);
  const component = mount(CreateArchiveBody, {
    target,
    props: {
      defaultName: props.defaultName ?? 'archive.zip',
      format: props.format ?? 'zip',
      selectedNames: props.selectedNames ?? [],
    },
  });

  (target as HTMLElement).dataset.svelteCreateArchiveBody = 'true';
  mountedCreateArchiveBodies.set(target, component);
}
