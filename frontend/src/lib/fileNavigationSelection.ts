import type { FileNavigationActions, FileNavigationHost } from './fileNavigation';

export type SelectionNavigationActions = Pick<
  FileNavigationActions,
  | 'clearSelection'
  | 'focusFirst'
  | 'focusLast'
  | 'handleTypeAhead'
  | 'moveFocus'
  | 'selectAll'
  | 'selectRange'
  | 'selectSingle'
  | 'sort'
  | 'toggleSelection'
>;

export function createSelectionNavigationActions(
  host: FileNavigationHost,
  callbacks: {
    updatePreviewPane: () => Promise<void>;
  },
): SelectionNavigationActions {
  const { state } = host;

  const actions: SelectionNavigationActions = {
    selectSingle(path, index) {
      state.selectedEntries = new Set([path]);
      state.lastSelectedIndex = index;
      state.focusedIndex = index;
      host.updateSelectionVisuals();
      void callbacks.updatePreviewPane();
    },

    toggleSelection(path, index) {
      if (state.selectedEntries.has(path)) {
        state.selectedEntries = new Set(
          [...state.selectedEntries].filter((entryPath) => entryPath !== path),
        );
      } else {
        state.selectedEntries = new Set([...state.selectedEntries, path]);
      }

      state.lastSelectedIndex = index;
      state.focusedIndex = index;
      host.updateSelectionVisuals();
      void callbacks.updatePreviewPane();
    },

    selectRange(fromIndex, toIndex) {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);

      state.selectedEntries = new Set(
        state.filteredEntries
          .slice(start, end + 1)
          .map((entry) => entry.path),
      );
      state.focusedIndex = toIndex;
      host.updateSelectionVisuals();
      void callbacks.updatePreviewPane();
    },

    selectAll() {
      state.selectedEntries = new Set(state.filteredEntries.map((entry) => entry.path));
      host.updateSelectionVisuals();
      host.updateStatusBar();
    },

    clearSelection() {
      state.selectedEntries = new Set();
      state.focusedIndex = -1;
      host.updateSelectionVisuals();
    },

    moveFocus(delta, extendSelection = false) {
      const newIndex = Math.max(0, Math.min(
        state.filteredEntries.length - 1,
        state.focusedIndex + delta,
      ));

      if (extendSelection && state.lastSelectedIndex !== -1) {
        actions.selectRange(state.lastSelectedIndex, newIndex);
        return;
      }

      const entry = state.filteredEntries[newIndex];
      if (entry) {
        actions.selectSingle(entry.path, newIndex);
      }
    },

    focusFirst(extendSelection = false) {
      if (state.filteredEntries.length === 0) return;

      if (extendSelection && state.lastSelectedIndex !== -1) {
        actions.selectRange(state.lastSelectedIndex, 0);
        return;
      }

      const entry = state.filteredEntries[0];
      actions.selectSingle(entry.path, 0);
    },

    focusLast(extendSelection = false) {
      if (state.filteredEntries.length === 0) return;

      const lastIndex = state.filteredEntries.length - 1;
      if (extendSelection && state.lastSelectedIndex !== -1) {
        actions.selectRange(state.lastSelectedIndex, lastIndex);
        return;
      }

      const entry = state.filteredEntries[lastIndex];
      actions.selectSingle(entry.path, lastIndex);
    },

    handleTypeAhead(char) {
      state.typeAheadBuffer += char.toLowerCase();
      window.clearTimeout(state.typeAheadTimeout ?? undefined);

      state.typeAheadTimeout = window.setTimeout(() => {
        state.typeAheadBuffer = '';
      }, 500);

      const match = state.filteredEntries.findIndex((entry) =>
        entry.name?.toLowerCase().startsWith(state.typeAheadBuffer),
      );

      if (match !== -1) {
        actions.selectSingle(state.filteredEntries[match].path, match);
      }
    },

    sort(sortBy) {
      if (state.sortBy === sortBy) {
        state.sortAsc = !state.sortAsc;
      } else {
        state.sortBy = sortBy;
        state.sortAsc = true;
      }

      host.updateFilteredEntries();
      host.renderFileList();
      host.updateSortIndicator();
    },
  };

  return actions;
}
