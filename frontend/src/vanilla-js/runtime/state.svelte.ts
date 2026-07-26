import type { Bookmark, FileTab, RecentLocation, SimpleFileAppState } from '../../lib/appState';
import type { PathString } from '../../lib/types';

type StateChangeListener = (
  property: string | symbol,
  value: unknown,
  oldValue: unknown,
) => void;

let idCounter = 0;

export function uniqueId(prefix: string) {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

const initialState = {
  currentPath: '',
  entries: [],
  filteredEntries: [],
  selectedEntries: new Set<PathString>(),
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
  typeAheadBuffer: '',
  typeAheadTimeout: null,
  draggedItems: [],
  isDragging: false,
  treeData: new Map(),
  treeExpanded: new Set<PathString>(),
  showPreviewPane: false,
  previewEntry: null,
  iconSize: 64,
  quickLookVisible: false,
  quickLookEntry: null,
  folderSizes: new Map(),
  tabs: [],
  activeTabId: null,
  bookmarks: [],
  recentLocations: [],
  drives: [],
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
    customPath: '',
    visibleColumns: ['size', 'date', 'type'],
    columnWidths: {
      name: 240,
      size: 100,
      items: 90,
      date: 140,
      type: 100,
    },
  },
  dualPaneEnabled: false,
  activePane: 'primary',
  secondaryPath: '',
  secondaryEntries: [],
  secondaryFilteredEntries: [],
  secondarySelectedEntries: new Set<PathString>(),
  secondaryHistory: [],
  secondaryHistoryIndex: -1,
  currentArchive: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchMode: false,
  currentSearchId: null,
  searchCancelled: false,
  searchOptions: null,
  smartFolders: [],
  cleanupInProgress: false,
  _savedEntries: null,
  gitStatus: null,
  tags: [],
  fileTags: {},
  isNavigating: false,
  filterQuery: '',
  clipboardHistory: [],
} satisfies SimpleFileAppState;

const listeners = new Set<StateChangeListener>();

function cloneInitialState(stateToClone: SimpleFileAppState): SimpleFileAppState {
  return {
    ...stateToClone,
    activeOperations: new Map(stateToClone.activeOperations),
    selectedEntries: new Set(stateToClone.selectedEntries),
    treeData: new Map(stateToClone.treeData),
    treeExpanded: new Set(stateToClone.treeExpanded),
    folderSizes: new Map(stateToClone.folderSizes),
    secondarySelectedEntries: new Set(stateToClone.secondarySelectedEntries),
    settings: {
      ...stateToClone.settings,
      visibleColumns: [...stateToClone.settings.visibleColumns],
      columnWidths: { ...stateToClone.settings.columnWidths },
    },
    tabs: [...stateToClone.tabs],
    bookmarks: [...stateToClone.bookmarks],
    recentLocations: [...stateToClone.recentLocations],
    drives: [...stateToClone.drives],
    entries: [...stateToClone.entries],
    filteredEntries: [...stateToClone.filteredEntries],
    secondaryEntries: [...stateToClone.secondaryEntries],
    secondaryFilteredEntries: [...stateToClone.secondaryFilteredEntries],
    searchResults: [...stateToClone.searchResults],
    smartFolders: [...stateToClone.smartFolders],
    history: [...stateToClone.history],
    secondaryHistory: [...stateToClone.secondaryHistory],
    draggedItems: [...stateToClone.draggedItems],
    undoStack: [...stateToClone.undoStack],
    redoStack: [...stateToClone.redoStack],
    clipboardHistory: [...stateToClone.clipboardHistory],
    fileTags: { ...stateToClone.fileTags },
    tags: [...stateToClone.tags],
  };
}

function createReactiveState(initial: SimpleFileAppState): SimpleFileAppState {
  const reactiveState = $state(cloneInitialState(initial)) as SimpleFileAppState;

  return new Proxy(reactiveState, {
    set(target, property, value) {
      const oldValue = Reflect.get(target, property);
      const didSet = Reflect.set(target, property, value);

      if (didSet && oldValue !== value) {
        listeners.forEach((listener) => {
          try {
            listener(property, value, oldValue);
          } catch (error) {
            console.error('State listener error:', error);
          }
        });
      }

      return didSet;
    },
  });
}

export const state = createReactiveState(initialState);

export function subscribe(listener: StateChangeListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetState() {
  Object.assign(state, cloneInitialState(initialState));
}

export function saveSettings() {
  try {
    localStorage.setItem('simplefile-settings', JSON.stringify(state.settings));
    localStorage.setItem('simplefile-theme', state.theme);
  } catch (error) {
    console.warn('Could not save settings:', error);
  }
}

export function loadSettings() {
  try {
    const saved = localStorage.getItem('simplefile-settings');
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SimpleFileAppState['settings']>;
      state.settings = {
        ...state.settings,
        ...parsed,
        columnWidths: {
          ...state.settings.columnWidths,
          ...parsed.columnWidths,
        },
      };
    }

    const theme = localStorage.getItem('simplefile-theme');
    if (theme) {
      state.theme = theme;
    }
  } catch (error) {
    console.warn('Could not load settings:', error);
  }
}

export function saveTabs() {
  try {
    localStorage.setItem('simplefile-tabs', JSON.stringify(state.tabs));
    localStorage.setItem('simplefile-active-tab', state.activeTabId ?? '');
  } catch (error) {
    console.warn('Could not save tabs:', error);
  }
}

export function loadTabs() {
  try {
    const saved = localStorage.getItem('simplefile-tabs');
    const activeId = localStorage.getItem('simplefile-active-tab');
    if (saved) {
      state.tabs = JSON.parse(saved) as FileTab[];
      state.activeTabId = activeId || null;
      return true;
    }
  } catch (error) {
    console.warn('Could not load tabs:', error);
  }

  return false;
}

export function saveBookmarks() {
  try {
    localStorage.setItem('simplefile-bookmarks', JSON.stringify(state.bookmarks));
  } catch (error) {
    console.warn('Could not save bookmarks:', error);
  }
}

export function loadBookmarks() {
  try {
    const saved = localStorage.getItem('simplefile-bookmarks');
    if (saved) {
      state.bookmarks = JSON.parse(saved) as Bookmark[];
    }
  } catch (error) {
    console.warn('Could not load bookmarks:', error);
  }
}

export function addBookmark(path: PathString, name?: string) {
  if (state.bookmarks.some((bookmark) => bookmark.path === path)) return false;

  state.bookmarks = [
    ...state.bookmarks,
    {
      id: uniqueId('bm'),
      path,
      name: name || path.split(/[/\\]/).filter(Boolean).pop() || path,
    },
  ];
  saveBookmarks();
  return true;
}

export function removeBookmark(id: string) {
  const index = state.bookmarks.findIndex((bookmark) => bookmark.id === id);
  if (index > -1) {
    state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== id);
    saveBookmarks();
    return true;
  }

  return false;
}

const MAX_RECENT = 10;

export function saveRecentLocations() {
  try {
    localStorage.setItem('simplefile-recent', JSON.stringify(state.recentLocations));
  } catch (error) {
    console.warn('Could not save recent locations:', error);
  }
}

export function loadRecentLocations() {
  try {
    const saved = localStorage.getItem('simplefile-recent');
    if (saved) {
      state.recentLocations = JSON.parse(saved) as RecentLocation[];
    }
  } catch (error) {
    console.warn('Could not load recent locations:', error);
  }
}

export function addRecentLocation(path: PathString) {
  const filtered = state.recentLocations.filter((recent) => recent.path !== path);
  const newEntry: RecentLocation = {
    path,
    name: path.split(/[/\\]/).filter(Boolean).pop() || path,
    timestamp: Date.now(),
  };
  state.recentLocations = [newEntry, ...filtered].slice(0, MAX_RECENT);

  saveRecentLocations();
}

export function clearRecentLocations() {
  state.recentLocations = [];
  saveRecentLocations();
}

export function saveFileTags() {
  try {
    localStorage.setItem('simplefile-tags', JSON.stringify(state.fileTags || {}));
  } catch (error) {
    console.warn('Could not save file tags:', error);
  }
}

export function loadFileTags() {
  try {
    const saved = localStorage.getItem('simplefile-tags');
    if (saved) {
      state.fileTags = JSON.parse(saved) || {};
    }
  } catch (error) {
    console.warn('Could not load file tags:', error);
    state.fileTags = {};
  }
}

export function setFileTag(path: PathString, tag: string | null) {
  const tags = { ...(state.fileTags || {}) };
  if (!tag || tag === 'clear') {
    delete tags[path];
  } else {
    tags[path] = { color: tag, label: tag };
  }
  state.fileTags = tags;
  saveFileTags();
}

export function clearFileTag(path: PathString) {
  setFileTag(path, 'clear');
}
