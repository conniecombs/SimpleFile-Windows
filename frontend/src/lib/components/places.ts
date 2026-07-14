import { mount, unmount } from 'svelte';

import BookmarkList from './places/BookmarkList.svelte';
import type { BookmarkListItem } from './places/BookmarkList.svelte';
import NetworkDrivesList from './places/NetworkDrivesList.svelte';
import type { NetworkDriveItem } from './places/NetworkDrivesList.svelte';
import QuickAccessList from './places/QuickAccessList.svelte';
import type { QuickAccessItem } from './places/QuickAccessList.svelte';
import RecentLocationsList from './places/RecentLocationsList.svelte';
import type { RecentLocationItem } from './places/RecentLocationsList.svelte';
import SmartFoldersList from './places/SmartFoldersList.svelte';
import type { SmartFolder } from '../types';

export type BookmarkListProps = {
  bookmarks?: BookmarkListItem[];
  onNavigate?: (path: string) => void;
  onRemove?: (id: string) => void;
};

export type RecentLocationsListProps = {
  onNavigate?: (path: string) => void;
  recentLocations?: RecentLocationItem[];
};

export type QuickAccessListProps = {
  locations?: QuickAccessItem[];
  onAction?: (action: string) => void;
  onNavigate?: (path: string) => void;
};

export type NetworkDrivesListProps = {
  mounts?: NetworkDriveItem[];
  onNavigate?: (mountPoint: string) => void;
  onUnmount?: (mountPoint: string) => void;
};

const mountedLists = new WeakMap<Element, ReturnType<typeof mount>>();

function clearMountedList(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedLists.get(target);
  if (component) {
    unmount(component);
    mountedLists.delete(target);
  }

  target.replaceChildren();
}

function closestElement(event: Event, selector: string) {
  const target = event.target;
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

export function renderBookmarkList(
  target: Element | null | undefined,
  props: BookmarkListProps = {},
) {
  if (!target) {
    return;
  }

  clearMountedList(target);
  const component = mount(BookmarkList, {
    target,
    props: {
      bookmarks: props.bookmarks ?? [],
      onNavigate: props.onNavigate,
      onRemove: props.onRemove,
    },
  });
  mountedLists.set(target, component);
}

export function renderRecentLocationsList(
  target: Element | null | undefined,
  props: RecentLocationsListProps = {},
) {
  if (!target) {
    return;
  }

  clearMountedList(target);
  const component = mount(RecentLocationsList, {
    target,
    props: {
      recentLocations: props.recentLocations ?? [],
    },
  });
  mountedLists.set(target, component);

  target.querySelectorAll<HTMLElement>('.recent-item').forEach((item) => {
    item.addEventListener('click', () => {
      const path = item.dataset.path;
      if (path) {
        props.onNavigate?.(path);
      }
    });
  });
}

export function renderQuickAccessList(
  target: Element | null | undefined,
  props: QuickAccessListProps = {},
) {
  if (!target) {
    return;
  }

  clearMountedList(target);
  const component = mount(QuickAccessList, {
    target,
    props: {
      locations: props.locations ?? [],
    },
  });
  mountedLists.set(target, component);

  target.querySelectorAll<HTMLElement>('.quick-access-item').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      const path = item.dataset.path;

      if (action) {
        props.onAction?.(action);
      } else if (path) {
        props.onNavigate?.(path);
      }
    });
  });
}

export function renderNetworkDrivesList(
  target: Element | null | undefined,
  props: NetworkDrivesListProps = {},
) {
  if (!target) {
    return;
  }

  clearMountedList(target);
  const component = mount(NetworkDrivesList, {
    target,
    props: {
      mounts: props.mounts ?? [],
    },
  });
  mountedLists.set(target, component);

  target.querySelectorAll<HTMLElement>('.network-drive-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (closestElement(event, '.unmount-btn')) {
        return;
      }

      const path = item.dataset.path;
      if (path) {
        props.onNavigate?.(path);
      }
    });
  });

  target.querySelectorAll<HTMLElement>('.unmount-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const mountPoint = button.dataset.mountPoint;
      if (mountPoint) {
        props.onUnmount?.(mountPoint);
      }
    });
  });
}

export type SmartFoldersListProps = {
  smartFolders?: SmartFolder[];
  onNavigate?: (folder: SmartFolder) => void;
  onRemove?: (id: string) => void;
};

export function renderSmartFoldersList(
  target: Element | null | undefined,
  props: SmartFoldersListProps = {},
) {
  if (!target) {
    return;
  }

  clearMountedList(target);
  const component = mount(SmartFoldersList, {
    target,
    props: {
      smartFolders: props.smartFolders ?? [],
      onNavigate: props.onNavigate,
      onRemove: props.onRemove,
    },
  });
  mountedLists.set(target, component);
}

