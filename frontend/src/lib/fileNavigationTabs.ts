import type { FileNavigationActions, FileNavigationHost } from './fileNavigation';
import type { PathString } from './types';

export type TabNavigationActions = Pick<
  FileNavigationActions,
  | 'closeCurrentTab'
  | 'closeTab'
  | 'newTab'
  | 'switchTab'
>;

export function createTabNavigationActions(
  host: FileNavigationHost,
  navigateTo: (path: PathString) => Promise<void>,
): TabNavigationActions {
  const { state } = host;

  const actions: TabNavigationActions = {
    newTab() {
      const tab = host.createTab(state.homePath);
      void navigateTo(tab.path);
    },

    switchTab(tabId) {
      const path = host.switchToTab(tabId);
      if (path) {
        void navigateTo(path);
      }
    },

    closeTab(tabId) {
      const path = host.closeTab(tabId);
      if (path) {
        void navigateTo(path);
      }
    },

    closeCurrentTab() {
      if (state.tabs.length > 1 && state.activeTabId) {
        actions.closeTab(state.activeTabId);
      }
    },
  };

  return actions;
}
