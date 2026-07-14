import type { SimpleFileAppState } from './appState';

type ViewWorkflowState = SimpleFileAppState & {
  _lastCommittedIconSize?: number;
};

type QuickFilterRenderProps = {
  countText: string;
  query: string;
};

type ViewWorkflowElements = {
  btnThemeToggle?: HTMLElement | null;
  filterInput?: HTMLInputElement | null;
  quickFilterBar?: HTMLElement | null;
};

export type ViewWorkflowHost = {
  state: ViewWorkflowState;
  saveSettings: () => void;
  updateFilteredEntries: () => void;
  renderFileList: () => void;
  clearThumbnailCache: () => void;
  getFilterCountText: () => string;
  updateFilterCount: () => void;
  clearElementCache: (...keys: string[]) => void;
  focusQuickFilterInput: (container?: HTMLElement | null) => void;
  renderQuickFilterBar: (
    container: HTMLElement | null | undefined,
    props: QuickFilterRenderProps,
  ) => unknown;
  elements: ViewWorkflowElements;
  document?: Document;
};

export type ViewWorkflowActions = {
  toggleTheme: () => void;
  toggleHiddenFiles: () => void;
  setFilter: (query: string) => void;
  clearFilter: () => void;
  openFilter: () => void;
  setIconSize: (size: number) => void;
  commitIconSize: (size: number) => void;
};

function coerceIconSize(size: number) {
  return Number.isFinite(size) && size > 0 ? size : null;
}

export function createViewWorkflowActions(host: ViewWorkflowHost): ViewWorkflowActions {
  const { state } = host;
  const documentRef = host.document ?? document;

  return {
    toggleTheme() {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      state.settings.theme = state.theme;
      documentRef.documentElement.setAttribute('data-theme', state.theme);

      const themeSelect = documentRef.getElementById('settings-theme') as HTMLSelectElement | null;
      if (themeSelect) {
        themeSelect.value = state.theme;
      }

      const icon = host.elements.btnThemeToggle?.querySelector('.icon');
      if (icon) {
        icon.textContent = state.theme === 'dark' ? '🌙' : '☀️';
      }

      host.saveSettings();
    },

    toggleHiddenFiles() {
      state.showHiddenFiles = !state.showHiddenFiles;
      host.updateFilteredEntries();
      host.renderFileList();
    },

    setFilter(query) {
      state.filterQuery = query;
      host.updateFilteredEntries();
      host.renderFileList();
      host.updateFilterCount();
    },

    clearFilter() {
      state.filterQuery = '';

      if (host.elements.filterInput) {
        host.elements.filterInput.value = '';
      }

      host.renderQuickFilterBar(host.elements.quickFilterBar, {
        countText: '',
        query: '',
      });
      host.clearElementCache('filterInput', 'filterCount', 'filterClear');

      if (host.elements.quickFilterBar) {
        host.elements.quickFilterBar.style.display = 'none';
      }

      host.updateFilteredEntries();
      host.renderFileList();
    },

    openFilter() {
      if (host.elements.quickFilterBar) {
        host.elements.quickFilterBar.style.display = 'flex';
        host.renderQuickFilterBar(host.elements.quickFilterBar, {
          countText: host.getFilterCountText(),
          query: state.filterQuery,
        });
        host.clearElementCache('filterInput', 'filterCount', 'filterClear');
        host.focusQuickFilterInput(host.elements.quickFilterBar);
      }

      if (host.elements.filterInput) {
        host.elements.filterInput.value = state.filterQuery;
        host.elements.filterInput.focus();
      }

      host.updateFilterCount();
    },

    setIconSize(size) {
      const nextSize = coerceIconSize(size);
      if (nextSize === null) return;

      state.iconSize = nextSize;
      documentRef.documentElement.style.setProperty('--icon-size', `${nextSize}px`);
    },

    commitIconSize(size) {
      const nextSize = coerceIconSize(size);
      if (nextSize === null) return;

      const oldSize = state._lastCommittedIconSize || 64;
      state._lastCommittedIconSize = nextSize;

      if (state.isGridView && Math.abs(nextSize - oldSize) / oldSize > 0.5) {
        host.clearThumbnailCache();
        host.renderFileList();
      }
    },
  };
}
