import { mount, unmount } from 'svelte';

import PathAutocomplete from './path-autocomplete/PathAutocomplete.svelte';
import type { PathAutocompleteItem } from './path-autocomplete/PathAutocomplete.svelte';

export type PathAutocompleteProps = {
  items?: PathAutocompleteItem[];
  onChoose?: (path: string) => void;
  onDismiss?: () => void;
  separator?: string;
};

const mountedDropdowns = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearPathAutocomplete(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedDropdowns.get(target);
  if (component) {
    unmount(component);
    mountedDropdowns.delete(target);
  }

  target.replaceChildren();
}

export function renderPathAutocomplete(
  target: Element | null | undefined,
  props: PathAutocompleteProps = {},
) {
  if (!target) {
    return;
  }

  clearPathAutocomplete(target);
  const component = mount(PathAutocomplete, {
    target,
    props: {
      items: props.items ?? [],
      onChoose: props.onChoose,
      onDismiss: props.onDismiss,
      separator: props.separator ?? '/',
    },
  });
  mountedDropdowns.set(target, component);
}
