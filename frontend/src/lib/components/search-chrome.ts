import { mount, unmount } from 'svelte';

import QuickFilterBar from './search-chrome/QuickFilterBar.svelte';
import SearchResultsHeader from './search-chrome/SearchResultsHeader.svelte';

export type QuickFilterCallbacks = {
  onClear?: () => void;
  onInput?: (query: string) => void;
};

export type SearchResultsHeaderProps = {
  clearLabel?: string;
  saveLabel?: string;
  label: string;
  onClear?: () => void;
  onSave?: () => void;
};

type QuickFilterComponent = ReturnType<typeof mount> & {
  focusInput?: () => void;
  setCount?: (nextCount: string) => void;
  setQuery?: (nextQuery: string) => void;
};

const mountedQuickFilters = new WeakMap<Element, QuickFilterComponent>();
const mountedSearchHeaders = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearQuickFilterBar(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedQuickFilters.get(target);
  if (!component) {
    return;
  }

  unmount(component);
  mountedQuickFilters.delete(target);
  target.replaceChildren();
}

export function renderQuickFilterBar(
  target: Element | null | undefined,
  props: QuickFilterCallbacks & { countText?: string; query?: string } = {},
) {
  if (!target) {
    return;
  }

  const existing = mountedQuickFilters.get(target);
  if (existing) {
    existing.setQuery?.(props.query ?? '');
    existing.setCount?.(props.countText ?? '');
    return existing;
  }

  target.replaceChildren();
  const component = mount(QuickFilterBar, {
    target,
    props: {
      initialCount: props.countText ?? '',
      initialQuery: props.query ?? '',
      onClear: props.onClear,
      onInput: props.onInput,
    },
  }) as QuickFilterComponent;

  mountedQuickFilters.set(target, component);
  return component;
}

export function updateQuickFilterCount(target: Element | null | undefined, countText: string) {
  if (!target) {
    return false;
  }

  const component = mountedQuickFilters.get(target);
  if (!component) {
    return false;
  }

  component.setCount?.(countText);
  return true;
}

export function focusQuickFilterInput(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  mountedQuickFilters.get(target)?.focusInput?.();
}

export function clearSearchResultsHeader(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedSearchHeaders.get(target);
  if (component) {
    unmount(component);
    mountedSearchHeaders.delete(target);
  }

  target.remove();
}

export function renderSearchResultsHeader(
  parent: Element | null | undefined,
  before: Element | null | undefined,
  props: SearchResultsHeaderProps,
) {
  if (!parent || !before) {
    return null;
  }

  let target = parent.querySelector(':scope > .search-results-header');
  if (!target) {
    target = document.createElement('div');
    target.className = 'search-results-header';
    parent.insertBefore(target, before);
  }

  const existing = mountedSearchHeaders.get(target);
  if (existing) {
    unmount(existing);
    mountedSearchHeaders.delete(target);
  }

  const component = mount(SearchResultsHeader, {
    target,
    props,
  });
  mountedSearchHeaders.set(target, component);
  return target;
}
