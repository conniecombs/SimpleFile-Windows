// SimpleFile - State Management Module
// Centralized application state with reactive proxy store

// Monotonic counter for generating unique IDs (avoids Date.now() collisions)
let _idCounter = 0;
export function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// ============================================================================
// State Store
// ============================================================================

const initialState = {
    currentPath: '',
    entries: [],
    filteredEntries: [],
    selectedEntries: new Set(),
    lastSelectedIndex: -1,
    focusedIndex: -1,
    history: [],
    historyIndex: -1,
    clipboard: null,
    clipboardAction: null,
    undoStack: [],
    redoStack: [],
    sortBy: 'name',
    sortAsc: true,
    isGridView: false,
    homePath: '',
    showHiddenFiles: false,
    activeOperations: new Map(),
    // Type-ahead state
    typeAheadBuffer: '',
    typeAheadTimeout: null,
    // Drag state
    draggedItems: [],
    isDragging: false,
    // Tree view
    treeData: new Map(),
    treeExpanded: new Set(),
    // Preview
    showPreviewPane: false,
    previewEntry: null,
    iconSize: 64,
    quickLookVisible: false,
    quickLookEntry: null,
    folderSizes: new Map(),
    // Tabs
    tabs: [],
    activeTabId: null,
    bookmarks: [],
    recentLocations: [],
    drives: [],
    // Theme
    theme: 'dark',
    settingsVisible: false,
    aboutVisible: false,
    commandPaletteVisible: false,
    settings: {
        theme: 'dark',
        defaultView: 'list',
        defaultIconSize: 64,
        showHidden: false,
        useTrash: true,
        enableGitIntegration: true,
        confirmDelete: true,
        openInNewTab: false,
        autoCollapseTree: false,
        showRecentLocations: true,
        showFolderSizes: true,
        startLocation: 'home',
        customPath: ''
        ,
        /**
         * List of optional columns to display in list view.  The name column is
         * always shown; the entries in this array control additional metadata
         * columns.  Valid values: 'size', 'items', 'date', 'type'.
         */
        visibleColumns: ['size', 'date', 'type'],
        columnWidths: {
            name: 240,
            size: 100,
            items: 90,
            date: 140,
            type: 100
        }
    },
    // Dual Pane
    dualPaneEnabled: false,
    activePane: 'primary',
    secondaryPath: '',
    secondaryEntries: [],
    secondaryFilteredEntries: [],
    secondarySelectedEntries: new Set(),
    secondaryHistory: [],
    secondaryHistoryIndex: -1,
    // Archive
    currentArchive: null,
    // Search
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    searchMode: false,
    currentSearchId: null,
    searchCancelled: false,
    searchOptions: null,
    smartFolders: [],
    cleanupInProgress: false,
    // Saved entries for restoring after search
    _savedEntries: null,
    // Git
    gitStatus: null,
    // Tags
    tags: [],
    fileTags: {},
    // Navigation guard (prevents watcher refresh loops during navigation)
    isNavigating: false,
    // Quick filter bar (client-side, current directory only)
    filterQuery: '',
    // Clipboard history: last N copy/cut operations
    clipboardHistory: [],
};

// Create reactive state with optional change listeners
const listeners = new Set();

function createReactiveState(initial) {
    let reactiveState = $state({
        ...initial,
        activeOperations: new Map(),
        treeData: new Map(),
        treeExpanded: new Set(),
        folderSizes: new Map()
    });

    return new Proxy(reactiveState, {
        set(target, property, value) {
            const oldValue = target[property];
            target[property] = value;

            // Notify listeners of state change
            if (oldValue !== value) {
                listeners.forEach(listener => {
                    try {
                        listener(property, value, oldValue);
                    } catch (e) {
                        console.error('State listener error:', e);
                    }
                });
            }
            return true;
        }
    });
}

export const state = createReactiveState(initialState);

// ============================================================================
// State Helpers
// ============================================================================

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function resetState() {
    Object.keys(initialState).forEach(key => {
        if (typeof initialState[key] === 'object' && initialState[key] !== null) {
            if (initialState[key] instanceof Map) {
                state[key] = new Map();
            } else if (initialState[key] instanceof Set) {
                state[key] = new Set();
            } else if (Array.isArray(initialState[key])) {
                state[key] = [];
            } else {
                state[key] = { ...initialState[key] };
            }
        } else {
            state[key] = initialState[key];
        }
    });
}

// ============================================================================
// Persistence
// ============================================================================

export function saveSettings() {
    try {
        localStorage.setItem('simplefile-settings', JSON.stringify(state.settings));
        localStorage.setItem('simplefile-theme', state.theme);
    } catch (e) {
        console.warn('Could not save settings:', e);
    }
}

export function loadSettings() {
    try {
        const saved = localStorage.getItem('simplefile-settings');
        if (saved) {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        }
        const theme = localStorage.getItem('simplefile-theme');
        if (theme) {
            state.theme = theme;
        }
    } catch (e) {
        console.warn('Could not load settings:', e);
    }
}

export function saveTabs() {
    try {
        localStorage.setItem('simplefile-tabs', JSON.stringify(state.tabs));
        localStorage.setItem('simplefile-active-tab', state.activeTabId);
    } catch (e) {
        console.warn('Could not save tabs:', e);
    }
}

export function loadTabs() {
    try {
        const saved = localStorage.getItem('simplefile-tabs');
        const activeId = localStorage.getItem('simplefile-active-tab');
        if (saved) {
            state.tabs = JSON.parse(saved);
            state.activeTabId = activeId;
            return true;
        }
    } catch (e) {
        console.warn('Could not load tabs:', e);
    }
    return false;
}

// ============================================================================
// Bookmarks Persistence
// ============================================================================

export function saveBookmarks() {
    try {
        localStorage.setItem('simplefile-bookmarks', JSON.stringify(state.bookmarks));
    } catch (e) {
        console.warn('Could not save bookmarks:', e);
    }
}

export function loadBookmarks() {
    try {
        const saved = localStorage.getItem('simplefile-bookmarks');
        if (saved) {
            state.bookmarks = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load bookmarks:', e);
    }
}

export function addBookmark(path, name) {
    if (state.bookmarks.some(b => b.path === path)) return false;

    state.bookmarks = [...state.bookmarks, {
        id: uniqueId('bm'),
        path,
        name: name || path.split(/[/\\]/).filter(Boolean).pop() || path
    }];
    saveBookmarks();
    return true;
}

export function removeBookmark(id) {
    const index = state.bookmarks.findIndex(b => b.id === id);
    if (index > -1) {
        state.bookmarks = state.bookmarks.filter(b => b.id !== id);
        saveBookmarks();
        return true;
    }
    return false;
}

// ============================================================================
// Recent Locations Persistence
// ============================================================================

const MAX_RECENT = 10;

export function saveRecentLocations() {
    try {
        localStorage.setItem('simplefile-recent', JSON.stringify(state.recentLocations));
    } catch (e) {
        console.warn('Could not save recent locations:', e);
    }
}

export function loadRecentLocations() {
    try {
        const saved = localStorage.getItem('simplefile-recent');
        if (saved) {
            state.recentLocations = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load recent locations:', e);
    }
}

export function addRecentLocation(path) {
    // Build new array (assignment-based so the reactive proxy is triggered)
    const filtered = state.recentLocations.filter(r => r.path !== path);
    const newEntry = {
        path,
        name: path.split(/[/\\]/).filter(Boolean).pop() || path,
        timestamp: Date.now()
    };
    state.recentLocations = [newEntry, ...filtered].slice(0, MAX_RECENT);

    saveRecentLocations();
}

export function clearRecentLocations() {
    state.recentLocations = [];
    saveRecentLocations();
}

// ============================================================================
// File Tags / Color Labels Persistence
// ============================================================================

export function saveFileTags() {
    try {
        localStorage.setItem('simplefile-tags', JSON.stringify(state.fileTags || {}));
    } catch (e) {
        console.warn('Could not save file tags:', e);
    }
}

export function loadFileTags() {
    try {
        const saved = localStorage.getItem('simplefile-tags');
        if (saved) {
            state.fileTags = JSON.parse(saved) || {};
        }
    } catch (e) {
        console.warn('Could not load file tags:', e);
        state.fileTags = {};
    }
}

export function setFileTag(path, tag) {
    const tags = { ...(state.fileTags || {}) };
    if (!tag || tag === 'clear') {
        delete tags[path];
    } else {
        tags[path] = { color: tag, label: tag };
    }
    state.fileTags = tags;
    saveFileTags();
}

export function clearFileTag(path) {
    setFileTag(path, 'clear');
}
