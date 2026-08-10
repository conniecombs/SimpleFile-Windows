/** Component-owned search chrome state (toolbar buttons + results header). */

export type SearchChromeState = {
  focusToken: number;
  query: string;
  showCancel: boolean;
  showClear: boolean;
};

export const searchUi = $state<SearchChromeState>({
  focusToken: 0,
  query: '',
  showCancel: false,
  showClear: false,
});

export function setSearchControlsVisible(options: { clear?: boolean; cancel?: boolean } = {}) {
  searchUi.showClear = Boolean(options.clear);
  searchUi.showCancel = Boolean(options.cancel);
}

export function setSearchQuery(query: string) {
  searchUi.query = query;
}

export function clearSearchQuery() {
  searchUi.query = '';
}

export function requestSearchFocus() {
  searchUi.focusToken += 1;
}

export function searchResultsLabel(query: string, count: number, isSearching = false) {
  if (isSearching) {
    if (count > 0) {
      return `Searching… ${count} result${count === 1 ? '' : 's'} so far for "${query}"`;
    }
    return `Searching for "${query}"…`;
  }
  return `${count} result${count === 1 ? '' : 's'} for "${query}"`;
}
