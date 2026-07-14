export function resolveStartupLocation({
    activeTabId = null,
    homePath,
    settings = {},
    tabs = [],
    tabsLoaded = false,
}) {
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

    if (mode === 'last' && tabsLoaded && Array.isArray(tabs) && tabs.length > 0) {
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
