import type { FileNavigationActions, FileNavigationHost } from './fileNavigation';

export type PrimaryNavigationActions = Pick<
  FileNavigationActions,
  | 'goBack'
  | 'goForward'
  | 'goUp'
  | 'navigateTo'
  | 'navigateToBookmark'
  | 'navigateToRecent'
  | 'openEntry'
  | 'openFile'
  | 'openSelected'
  | 'refresh'
>;

export function createPrimaryNavigationActions(host: FileNavigationHost): PrimaryNavigationActions {
  const { state } = host;
  let navigationToken = 0;

  const actions: PrimaryNavigationActions = {
    async navigateTo(path) {
      const myToken = ++navigationToken;

      try {
        state.isNavigating = true;
        // Optimistically clear entries to ensure the 150ms skeleton loader logic detects an empty list
        state.entries = [];
        // Optimistically update the UI currentPath and selection
        state.currentPath = path;
        host.updateTreeSelection(path);

        host.showLoading();
        host.clearThumbnailCache();

        const listing = await host.listDirectory(path);

        if (myToken !== navigationToken) return;
        
        let statuses: Record<string, string> = {};
        if (state.settings?.enableGitIntegration) {
          try {
            statuses = await host.getGitFileStatuses(path);
          } catch (err) {
            // Probably not a git repo or git is not installed, ignore
          }
        }

        const enrichedEntries = listing.entries.map((entry) => {
          if (statuses[entry.name]) {
            return { ...entry, git_status: statuses[entry.name] };
          }
          return entry;
        });

        state.currentPath = listing.path;
        state.entries = enrichedEntries;
        state.selectedEntries = new Set();
        state.lastSelectedIndex = -1;
        state.focusedIndex = -1;

        if (state.filterQuery) {
          host.clearQuickFilter();
        }

        if (state.historyIndex === -1 || state.history[state.historyIndex] !== listing.path) {
          state.history = [...state.history.slice(0, state.historyIndex + 1), listing.path];
          state.historyIndex = state.history.length - 1;
        }

        host.addRecentLocation(state.currentPath);
        host.renderRecentLocations();

        host.updateActiveTab();
        host.updateUI();

        if (host.isArchivePath(state.currentPath)) {
          await host.unwatchDirectory();
        } else {
          await host.updateTreeSelection(state.currentPath);
          await host.watchDirectory(state.currentPath);
        }
      } catch (error) {
        host.showError(error);
      } finally {
        if (myToken === navigationToken) {
          host.hideLoading();
          state.isNavigating = false;
        }
      }
    },

    goBack() {
      if (state.historyIndex > 0) {
        state.historyIndex -= 1;
        void actions.navigateTo(state.history[state.historyIndex]);
      }
    },

    goForward() {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex += 1;
        void actions.navigateTo(state.history[state.historyIndex]);
      }
    },

    goUp() {
      if (state.currentPath) {
        const parent = host.getParentPath(state.currentPath);
        if (parent !== state.currentPath) {
          void actions.navigateTo(parent);
        }
      }
    },

    async refresh() {
      if (state.currentPath && !state.isDragging) {
        try {
          const listing = await host.listDirectory(state.currentPath);
          state.entries = listing.entries;
          host.updateUI();
        } catch (error) {
          host.onRefreshError(error);
        }
      }
    },

    async openEntry(path, isDirectory = false) {
      if (isDirectory || host.isArchiveFile(path)) {
        await actions.navigateTo(path);
        return;
      }

      await actions.openFile(path);
    },

    async openSelected() {
      if (state.selectedEntries.size === 0) return;

      const path = state.selectedEntries.values().next().value;
      if (!path) return;

      const entry = state.entries.find((candidate) => candidate.path === path);
      await actions.openEntry(path, entry?.is_dir);
    },

    async openFile(path) {
      try {
        await host.openFile(path);
      } catch (error) {
        host.showError(error);
      }
    },

    navigateToBookmark(path) {
      void actions.navigateTo(path);
    },

    navigateToRecent(path) {
      void actions.navigateTo(path);
    },
  };

  return actions;
}
