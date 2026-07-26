import type { AppSettings, FileTab } from '../../lib/appState';
import type { PathString } from '../../lib/types';

export interface StartupLocationInput {
  activeTabId?: string | null;
  homePath: PathString;
  settings?: Partial<AppSettings>;
  tabs?: FileTab[];
  tabsLoaded?: boolean;
}

export interface StartupLocationResult {
  activeTabId: string | null;
  history: PathString[];
  historyIndex: number;
  mode: string;
  shouldRenderTabs: boolean;
  startPath: PathString;
  tabs: FileTab[];
}

export function resolveStartupLocation({
  activeTabId = null,
  homePath,
  settings = {},
  tabs = [],
  tabsLoaded = false,
}: StartupLocationInput): StartupLocationResult {
  const mode = settings.startLocation || 'home';
  const customPath = typeof settings.customPath === 'string' ? settings.customPath.trim() : '';

  if (mode === 'custom') {
    return {
      mode,
      startPath: customPath || homePath,
      tabs: [],
      activeTabId: null,
      history: [],
      historyIndex: -1,
      shouldRenderTabs: false,
    };
  }

  if (mode === 'last' && tabsLoaded && tabs.length > 0) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
    return {
      mode,
      startPath: activeTab.path || homePath,
      tabs,
      activeTabId: activeTab.id || null,
      history: Array.isArray(activeTab.history) ? activeTab.history : [],
      historyIndex: Number.isInteger(activeTab.historyIndex) ? activeTab.historyIndex : -1,
      shouldRenderTabs: true,
    };
  }

  return {
    mode: 'home',
    startPath: homePath,
    tabs: [],
    activeTabId: null,
    history: [],
    historyIndex: -1,
    shouldRenderTabs: false,
  };
}
