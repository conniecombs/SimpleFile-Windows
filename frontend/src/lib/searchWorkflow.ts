import type { SimpleFileAppState } from './appState';
import type { FileEntry, PathString, SearchOptions, SearchResult, SmartFolder } from './types';
import { renderAdvancedSearchDialog } from './searchDialog';
import {
  readAdvancedSearchOptions,
  searchResultToFileEntry,
  toSearchCommandOptions,
  type SearchWorkflowOptions,
} from './searchOptions';
import { getRecentSearches, rememberRecentSearch } from './searchStorage';

type SearchWorkflowState = Omit<SimpleFileAppState, 'searchOptions'> & {
  searchOptions: SearchWorkflowOptions | null;
  _savedEntries: FileEntry[] | null;
};

type SearchResultsHeaderProps = {
  clearLabel: string;
  saveLabel?: string;
  label: string;
  onClear?: () => void;
  onSave?: () => void;
};

type SearchWorkflowElements = {
  fileList?: HTMLElement | null;
  searchCancel?: HTMLElement | null;
  searchClear?: HTMLElement | null;
  searchInput?: HTMLInputElement | null;
};

type SearchWorkflowApi = {
  cancelSearch: (searchId: string) => Promise<unknown>;
  searchFiles: (options: SearchOptions) => Promise<SearchResult[]>;
  saveSmartFolder?: (folder: SmartFolder) => Promise<SmartFolder[]>;
};

type SearchWorkflowUi = {
  showError: (error: unknown) => void;
  showLoading: () => void;
  showModal: (
    title: string,
    bodyHtml: string,
    confirmText?: string,
    showCancel?: boolean,
  ) => Promise<string | null | undefined>;
  showSuccess: (message: string) => void;
};

export type SearchWorkflowHost = {
  state: SearchWorkflowState;
  api: SearchWorkflowApi;
  ui: SearchWorkflowUi;
  elements: SearchWorkflowElements;
  clearSearchResultsHeader: (header: Element | null | undefined) => unknown;
  document?: Document;
  escapeHtml: (value: unknown) => string;
  refresh: () => unknown;
  renderSearchResultsHeader: (
    container: ParentNode | null | undefined,
    anchor: HTMLElement | null | undefined,
    props: SearchResultsHeaderProps,
  ) => unknown;
  t: (key: string, values?: Record<string, unknown>) => string;
  uniqueId: (prefix?: string) => string;
  updateUI: () => void;
};

export type SearchWorkflowActions = {
  cancelSearch: () => Promise<void>;
  clearSearch: () => Promise<void>;
  openAdvancedSearch: () => Promise<void>;
  search: (query: string | null | undefined, options?: SearchWorkflowOptions) => Promise<void>;
};

function setElementDisplay(element: HTMLElement | null | undefined, display: string) {
  if (element) {
    element.style.display = display;
  }
}

function getDocument(host: SearchWorkflowHost) {
  return host.document ?? document;
}

function renderSearchHeader(host: SearchWorkflowHost) {
  const { state } = host;
  if (!state.searchMode) return;

  const count = state.searchResults?.length || 0;
  host.renderSearchResultsHeader(host.elements.fileList?.parentNode, host.elements.fileList, {
    clearLabel: host.t('clear'),
    saveLabel: 'Save Search',
    label: host.t('search_results', { count, query: state.searchQuery }),
    onSave: async () => {
      const name = await host.ui.showModal('Save Smart Folder', '<input type="text" id="smart-folder-name" class="form-control" placeholder="Folder Name" />', 'Save', true);
      if (name === 'confirm') {
        const input = document.getElementById('smart-folder-name') as HTMLInputElement;
        if (input && input.value && host.api.saveSmartFolder) {
          const folderName = input.value;
          const searchOptions = toSearchCommandOptions({
            currentPath: state.currentPath,
            options: state.searchOptions ?? {},
            query: state.searchQuery,
            showHiddenFiles: state.showHiddenFiles,
          });
          host.api.saveSmartFolder({
            id: host.uniqueId('smart-folder'),
            name: folderName,
            icon: '🔍',
            search_options: searchOptions,
          }).then((smartFolders) => {
            document.dispatchEvent(new CustomEvent('simplefile:smart-folders-changed', {
              detail: { smartFolders },
            }));
            host.ui.showSuccess('Smart folder saved');
          }).catch(err => host.ui.showError(err));
        }
      }
    }
  });
}

async function cancelActiveSearch(host: SearchWorkflowHost) {
  const { state, ui } = host;
  if (!state.currentSearchId) return;

  const searchId = state.currentSearchId;
  state.searchCancelled = true;

  try {
    await host.api.cancelSearch(searchId);
    ui.showSuccess('Search cancellation requested');
  } catch (error) {
    ui.showError(error);
  } finally {
    setElementDisplay(host.elements.searchCancel, 'none');
  }
}

function getAdvancedSearchQuery(host: SearchWorkflowHost) {
  return host.elements.searchInput?.value || host.state.searchQuery || '';
}

export function createSearchWorkflowActions(host: SearchWorkflowHost): SearchWorkflowActions {
  const { state, ui } = host;

  const actions: SearchWorkflowActions = {
    async search(query, options = {}) {
      if (!query?.trim()) {
        await actions.clearSearch();
        return;
      }

      const searchId = host.uniqueId('search');
      state.currentSearchId = searchId;
      state.searchQuery = query.trim();
      state.searchOptions = { ...options };
      state.searchMode = true;
      state.isSearching = true;
      state.searchCancelled = false;

      rememberRecentSearch(state.searchQuery);
      ui.showLoading();
      setElementDisplay(host.elements.searchClear, 'flex');
      setElementDisplay(host.elements.searchCancel, 'inline-flex');

      state.searchResults = [];
      state.selectedEntries = new Set();

      try {
        const results = await host.api.searchFiles(toSearchCommandOptions({
          currentPath: state.currentPath,
          options,
          query: state.searchQuery,
          searchId,
          showHiddenFiles: state.showHiddenFiles,
        }));

        if (state.currentSearchId !== searchId) return;

        state.searchResults = results.map(searchResultToFileEntry);
        state.selectedEntries = new Set();
        host.updateUI();
        renderSearchHeader(host);
      } catch (error) {
        ui.showError(error);
      } finally {
        if (state.currentSearchId === searchId) {
          state.currentSearchId = null;
          state.isSearching = false;
          setElementDisplay(host.elements.searchCancel, 'none');
        }
      }
    },

    async openAdvancedSearch() {
      const documentRef = getDocument(host);
      const content = renderAdvancedSearchDialog({
        escapeHtml: host.escapeHtml,
        includeHidden: state.showHiddenFiles,
        initialQuery: getAdvancedSearchQuery(host),
        recentSearches: getRecentSearches(),
      });
      const query = await ui.showModal('Advanced Search', content, 'Search', true);

      if (!query?.trim()) return;

      const options = readAdvancedSearchOptions(documentRef);
      if (host.elements.searchInput) {
        host.elements.searchInput.value = query;
      }

      await actions.search(query, options);
    },

    async cancelSearch() {
      await cancelActiveSearch(host);
    },

    async clearSearch() {
      const documentRef = getDocument(host);

      if (state.currentSearchId) {
        await actions.cancelSearch();
      }

      state.searchQuery = '';
      state.searchMode = false;
      state.searchOptions = null;
      state.currentSearchId = null;

      if (host.elements.searchInput) {
        host.elements.searchInput.value = '';
      }

      setElementDisplay(host.elements.searchClear, 'none');
      setElementDisplay(host.elements.searchCancel, 'none');
      host.clearSearchResultsHeader(documentRef.querySelector('.search-results-header'));

      state.searchResults = [];
      state.selectedEntries = new Set();
      host.updateUI();
    },
  };

  return actions;
}
