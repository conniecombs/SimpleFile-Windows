import type { FileNavigationActions, FileNavigationHost, PaneId } from './fileNavigation';

export type DualPaneNavigationActions = Pick<
  FileNavigationActions,
  | 'activatePane'
  | 'goSecondaryBack'
  | 'goSecondaryForward'
  | 'goSecondaryUp'
  | 'loadSecondaryPane'
  | 'navigateSecondary'
  | 'selectSecondaryItem'
  | 'switchPane'
  | 'toggleDualPane'
>;

export function createDualPaneNavigationActions(host: FileNavigationHost): DualPaneNavigationActions {
  const { state } = host;

  let secondaryNavigationToken = 0;

  const actions: DualPaneNavigationActions = {
    toggleDualPane() {
      state.dualPaneEnabled = !state.dualPaneEnabled;

      if (host.elements.paneSecondary) {
        host.elements.paneSecondary.style.display = state.dualPaneEnabled ? 'flex' : 'none';
      }
      if (host.elements.paneDivider) {
        host.elements.paneDivider.style.display = state.dualPaneEnabled ? 'block' : 'none';
      }
      host.elements.btnDualPane?.classList.toggle('dual-pane-active', state.dualPaneEnabled);

      if (state.dualPaneEnabled) {
        state.activePane = 'primary';
        host.elements.panePrimary?.classList.add('active');
        host.elements.paneSecondary?.classList.remove('active');

        if (!state.secondaryPath) {
          state.secondaryPath = state.currentPath;
          state.secondaryHistory = [state.currentPath];
          state.secondaryHistoryIndex = 0;
          void actions.loadSecondaryPane();
        }
      } else {
        host.elements.panePrimary?.classList.remove('active');
        host.elements.paneSecondary?.classList.remove('active');
        state.activePane = 'primary';
      }
    },

    switchPane() {
      if (!state.dualPaneEnabled) return;

      state.activePane = state.activePane === 'primary' ? 'secondary' : 'primary';
      host.elements.panePrimary?.classList.toggle('active', state.activePane === 'primary');
      host.elements.paneSecondary?.classList.toggle('active', state.activePane === 'secondary');
    },

    activatePane(pane: PaneId) {
      if (!state.dualPaneEnabled) return;

      state.activePane = pane;
      host.elements.panePrimary?.classList.toggle('active', pane === 'primary');
      host.elements.paneSecondary?.classList.toggle('active', pane === 'secondary');
    },

    async loadSecondaryPane() {
      if (!state.secondaryPath) return;

      const myToken = ++secondaryNavigationToken;
      try {
        const listing = await host.listDirectory(state.secondaryPath);
        if (myToken !== secondaryNavigationToken) return;

        let statuses: Record<string, string> = {};
        if (state.settings?.enableGitIntegration) {
          try {
            statuses = await host.getGitFileStatuses(state.secondaryPath);
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

        state.secondaryPath = listing.path;
        state.secondaryEntries = enrichedEntries;
        state.secondarySelectedEntries = new Set();
        host.renderSecondaryFileList();
        host.updateSecondaryUI();
      } catch (error) {
        host.showError(error);
      }
    },

    async navigateSecondary(path) {
      if (
        state.secondaryHistoryIndex === -1
        || state.secondaryHistory[state.secondaryHistoryIndex] !== path
      ) {
        state.secondaryHistory = [
          ...state.secondaryHistory.slice(0, state.secondaryHistoryIndex + 1),
          path,
        ];
        state.secondaryHistoryIndex = state.secondaryHistory.length - 1;
      }

      state.secondaryPath = path;
      await actions.loadSecondaryPane();
    },

    goSecondaryBack() {
      if (state.secondaryHistoryIndex > 0) {
        state.secondaryHistoryIndex -= 1;
        state.secondaryPath = state.secondaryHistory[state.secondaryHistoryIndex];
        void actions.loadSecondaryPane();
      }
    },

    goSecondaryForward() {
      if (state.secondaryHistoryIndex < state.secondaryHistory.length - 1) {
        state.secondaryHistoryIndex += 1;
        state.secondaryPath = state.secondaryHistory[state.secondaryHistoryIndex];
        void actions.loadSecondaryPane();
      }
    },

    goSecondaryUp() {
      if (state.secondaryPath) {
        const parent = host.getParentPath(state.secondaryPath);
        if (parent !== state.secondaryPath) {
          void actions.navigateSecondary(parent);
        }
      }
    },

    selectSecondaryItem(path) {
      if (state.secondarySelectedEntries.has(path)) {
        state.secondarySelectedEntries = new Set(
          [...state.secondarySelectedEntries].filter((entryPath) => entryPath !== path),
        );
      } else {
        state.secondarySelectedEntries = new Set([path]);
      }

      host.renderSecondaryFileList();
    },
  };

  return actions;
}
