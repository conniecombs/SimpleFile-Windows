import { mount, unmount } from 'svelte';

import EmptyState from './empty-state/EmptyState.svelte';

const mountedEmptyStates = new WeakMap<Element, ReturnType<typeof mount>>();

export type EmptyMessageOptions = {
  className?: string;
  message?: string;
};

export function clearEmptyState(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedEmptyStates.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mountedEmptyStates.delete(target);
}

export function renderEmptyMessage(
  target: Element | null | undefined,
  options: EmptyMessageOptions | string = {},
) {
  if (!target) {
    return;
  }

  const normalizedOptions =
    typeof options === 'string' ? { message: options } : options;
  const className = normalizedOptions.className ?? 'empty-state';
  const message = normalizedOptions.message ?? 'This folder is empty';

  clearEmptyState(target);
  target.replaceChildren();

  const component = mount(EmptyState, {
    target,
    props: {
      className,
      message,
    },
  });

  mountedEmptyStates.set(target, component);
}

export function renderEmptyState(
  target: Element | null | undefined,
  message = 'This folder is empty',
) {
  renderEmptyMessage(target, { message, className: 'empty-state' });
}
