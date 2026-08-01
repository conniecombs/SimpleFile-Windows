import type { AppSettings, Bookmark, FileTab, RecentLocation, SimpleFileAppState } from '../../lib/appState';
import type { ColumnId, PathString } from '../../lib/types';

type StateChangeListener = (
  property: string | symbol,
  value: unknown,
  oldValue: unknown,
) => void;

let idCounter = 0;

const WORKSPACE_LAYOUT_KEY = 'simplefile-workspace-layout';

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
    shortcutOverrides: {},
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
  operationHistory: [],
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
      shortcutOverrides: { ...stateToClone.settings.shortcutOverrides },
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
    operationHistory: [...stateToClone.operationHistory],
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
        shortcutOverrides: {
          ...state.settings.shortcutOverrides,
          ...parsed.shortcutOverrides,
        },
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

export interface WorkspaceLayoutState {
  activePane: 'primary' | 'secondary';
  activeTabId: string | null;
  columnWidths: Partial<Record<'name' | ColumnId, number>>;
  dualPaneEnabled: boolean;
  iconSize: number;
  isGridView: boolean;
  primaryPath: PathString;
  previewVisible: boolean;
  secondaryHistory: PathString[];
  secondaryHistoryIndex: number;
  secondaryPath: PathString;
  tabs: FileTab[];
  visibleColumns: ColumnId[];
}

function isPathString(value: unknown): value is PathString {
  return typeof value === 'string' && value.length > 0;
}

function sanitizeHistory(value: unknown) {
  return Array.isArray(value) ? value.filter(isPathString) : [];
}

function sanitizeHistoryIndex(value: unknown, history: PathString[]) {
  const index = Number.isInteger(value) ? Number(value) : -1;
  if (history.length === 0) return -1;
  return Math.max(0, Math.min(index, history.length - 1));
}

function sanitizeTabs(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((tab): FileTab | null => {
      if (!tab || typeof tab !== 'object') return null;
      const candidate = tab as Partial<FileTab>;
      if (!candidate.id || !isPathString(candidate.path)) return null;
      const history = sanitizeHistory(candidate.history);
      return {
        id: String(candidate.id),
        path: candidate.path,
        title: typeof candidate.title === 'string' && candidate.title ? candidate.title : candidate.path,
        history: history.length > 0 ? history : [candidate.path],
        historyIndex: sanitizeHistoryIndex(candidate.historyIndex, history.length > 0 ? history : [candidate.path]),
      };
    })
    .filter((tab): tab is FileTab => Boolean(tab));
}

function sanitizeVisibleColumns(value: unknown, fallback: ColumnId[]) {
  const validColumns = new Set<ColumnId>(['size', 'items', 'date', 'type']);
  if (!Array.isArray(value)) return fallback;
  const columns = value.filter((column): column is ColumnId => validColumns.has(column as ColumnId));
  return columns.length > 0 ? columns : fallback;
}

function sanitizeColumnWidths(value: unknown, fallback: AppSettings['columnWidths']) {
  if (!value || typeof value !== 'object') return fallback;
  const next = { ...fallback };
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'size', 'items', 'date', 'type'] as const) {
    const width = Number(record[key]);
    if (Number.isFinite(width) && width > 0) {
      next[key] = width;
    }
  }
  return next;
}

function readWorkspaceLayout(): WorkspaceLayoutState | null {
  const saved = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
  if (!saved) return null;

  const parsed = JSON.parse(saved) as Partial<WorkspaceLayoutState>;
  const tabs = sanitizeTabs(parsed.tabs);
  const secondaryHistory = sanitizeHistory(parsed.secondaryHistory);
  const secondaryPath = isPathString(parsed.secondaryPath) ? parsed.secondaryPath : '';
  const primaryPath = isPathString(parsed.primaryPath) ? parsed.primaryPath : '';
  const activeTabId = typeof parsed.activeTabId === 'string'
    && tabs.some((tab) => tab.id === parsed.activeTabId)
    ? parsed.activeTabId
    : tabs[0]?.id ?? null;

  return {
    activePane: parsed.activePane === 'secondary' ? 'secondary' : 'primary',
    activeTabId,
    columnWidths: sanitizeColumnWidths(parsed.columnWidths, state.settings.columnWidths),
    dualPaneEnabled: Boolean(parsed.dualPaneEnabled),
    iconSize: Number(parsed.iconSize || state.iconSize || state.settings.defaultIconSize || 64),
    isGridView: Boolean(parsed.isGridView),
    primaryPath,
    previewVisible: Boolean(parsed.previewVisible),
    secondaryHistory,
    secondaryHistoryIndex: sanitizeHistoryIndex(parsed.secondaryHistoryIndex, secondaryHistory),
    secondaryPath,
    tabs,
    visibleColumns: sanitizeVisibleColumns(parsed.visibleColumns, state.settings.visibleColumns),
  };
}

export function currentWorkspaceLayout(): WorkspaceLayoutState {
  return {
    activePane: state.activePane === 'secondary' && state.dualPaneEnabled ? 'secondary' : 'primary',
    activeTabId: state.activeTabId,
    columnWidths: { ...state.settings.columnWidths },
    dualPaneEnabled: Boolean(state.dualPaneEnabled),
    iconSize: Number(state.iconSize || state.settings.defaultIconSize || 64),
    isGridView: Boolean(state.isGridView),
    primaryPath: state.currentPath,
    previewVisible: Boolean(state.showPreviewPane),
    secondaryHistory: [...state.secondaryHistory],
    secondaryHistoryIndex: state.secondaryHistoryIndex,
    secondaryPath: state.secondaryPath,
    tabs: state.tabs.map((tab) => ({
      ...tab,
      history: [...(tab.history || [])],
    })),
    visibleColumns: [...state.settings.visibleColumns],
  };
}

export function saveWorkspaceLayout() {
  try {
    localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(currentWorkspaceLayout()));
  } catch (error) {
    console.warn('Could not save workspace layout:', error);
  }
}

export function loadWorkspaceLayout() {
  try {
    const layout = readWorkspaceLayout();
    if (!layout) return false;

    state.tabs = layout.tabs;
    state.activeTabId = layout.activeTabId;
    state.dualPaneEnabled = layout.dualPaneEnabled;
    state.secondaryPath = layout.secondaryPath;
    state.secondaryHistory = layout.secondaryHistory;
    state.secondaryHistoryIndex = layout.secondaryHistoryIndex;
    state.activePane = layout.dualPaneEnabled ? layout.activePane : 'primary';
    state.showPreviewPane = layout.previewVisible;
    state.isGridView = layout.isGridView;
    state.iconSize = layout.iconSize;
    state.settings = {
      ...state.settings,
      columnWidths: sanitizeColumnWidths(layout.columnWidths, state.settings.columnWidths),
      defaultIconSize: layout.iconSize,
      defaultView: layout.isGridView ? 'grid' : 'list',
      visibleColumns: layout.visibleColumns,
    };

    if (layout.primaryPath && state.tabs.length === 0) {
      state.currentPath = layout.primaryPath;
    }

    return true;
  } catch (error) {
    console.warn('Could not load workspace layout:', error);
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
