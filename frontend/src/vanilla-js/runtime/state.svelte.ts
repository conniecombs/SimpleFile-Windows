import type { AppSettings, Bookmark, FileTab, RecentLocation, SimpleFileAppState } from '../../lib/appState';
import {
  columnsForPreset,
  DEFAULT_FILE_LIST_COLUMN_WIDTHS,
  DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
  isColumnPresetId,
  normalizeVisibleColumns,
  OPTIONAL_FILE_LIST_COLUMNS,
} from '../../lib/fileListColumns';
import type { ColumnId, ColumnPresetId, PathString, PhotoFolderMode } from '../../lib/types';

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
  contextualPhotoViewActive: false,
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
  secondaryTabs: [],
  secondaryActiveTabId: null,
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
    columnPreset: 'default',
    visibleColumns: [...DEFAULT_VISIBLE_FILE_LIST_COLUMNS],
    columnWidths: { ...DEFAULT_FILE_LIST_COLUMN_WIDTHS },
    photoFolderMode: 'auto',
    photoFolderImageThreshold: 70,
    photoFolderIconSize: 112,
  },
  dualPaneEnabled: false,
  activePane: 'primary',
  secondaryPath: '',
  secondaryEntries: [],
  secondaryFilteredEntries: [],
  secondarySelectedEntries: new Set<PathString>(),
  secondaryHistory: [],
  secondaryHistoryIndex: -1,
  primaryPathIsNetwork: false,
  secondaryPathIsNetwork: false,
  primaryListingInProgress: false,
  secondaryListingInProgress: false,
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
    secondaryTabs: [...stateToClone.secondaryTabs],
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
        columnPreset: sanitizeColumnPreset(parsed.columnPreset, state.settings.columnPreset),
        visibleColumns: sanitizeVisibleColumns(parsed.visibleColumns, state.settings.visibleColumns),
        columnWidths: {
          ...state.settings.columnWidths,
          ...sanitizeColumnWidths(parsed.columnWidths, state.settings.columnWidths),
        },
        photoFolderMode: sanitizePhotoFolderMode(parsed.photoFolderMode, state.settings.photoFolderMode),
        photoFolderImageThreshold: sanitizePhotoFolderThreshold(parsed.photoFolderImageThreshold, state.settings.photoFolderImageThreshold),
        photoFolderIconSize: sanitizePhotoFolderIconSize(parsed.photoFolderIconSize, state.settings.photoFolderIconSize),
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

const LEGACY_TABS_KEY = 'simplefile-tabs';
const LEGACY_ACTIVE_TAB_KEY = 'simplefile-active-tab';

function clearLegacyTabKeys() {
  try {
    localStorage.removeItem(LEGACY_TABS_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY);
  } catch {
    // Ignore storage failures while cleaning legacy keys.
  }
}

/**
 * Persist tabs through the workspace layout snapshot only.
 * Legacy simplefile-tabs keys are cleared after a successful write so there is
 * a single source of truth.
 */
export function saveTabs() {
  try {
    saveWorkspaceLayout();
    clearLegacyTabKeys();
  } catch (error) {
    console.warn('Could not save tabs:', error);
  }
}

/**
 * Load tabs when workspace layout did not already populate them.
 * Falls back to legacy simplefile-tabs once, then migrates into workspace layout.
 */
export function loadTabs() {
  if (Array.isArray(state.tabs) && state.tabs.length > 0) {
    return true;
  }

  try {
    const saved = localStorage.getItem(LEGACY_TABS_KEY);
    const activeId = localStorage.getItem(LEGACY_ACTIVE_TAB_KEY);
    if (saved) {
      state.tabs = sanitizeTabs(JSON.parse(saved));
      state.activeTabId = activeId || state.tabs[0]?.id || null;
      // Migrate immediately into workspace layout.
      saveWorkspaceLayout();
      clearLegacyTabKeys();
      return state.tabs.length > 0;
    }
  } catch (error) {
    console.warn('Could not load tabs:', error);
  }

  return false;
}

export interface WorkspaceLayoutState {
  activePane: 'primary' | 'secondary';
  activeTabId: string | null;
  columnPreset: ColumnPresetId;
  columnWidths: Partial<Record<'name' | ColumnId, number>>;
  dualPaneEnabled: boolean;
  iconSize: number;
  isGridView: boolean;
  primaryPath: PathString;
  previewVisible: boolean;
  secondaryHistory: PathString[];
  secondaryHistoryIndex: number;
  secondaryPath: PathString;
  secondaryActiveTabId: string | null;
  secondaryTabs: FileTab[];
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
  return normalizeVisibleColumns(value, fallback);
}

function sanitizeColumnPreset(value: unknown, fallback: ColumnPresetId) {
  return isColumnPresetId(value) ? value : fallback;
}

function sanitizeColumnWidths(value: unknown, fallback: AppSettings['columnWidths']) {
  if (!value || typeof value !== 'object') return fallback;
  const next = { ...fallback };
  const record = value as Record<string, unknown>;
  for (const key of ['name', ...OPTIONAL_FILE_LIST_COLUMNS] as const) {
    const width = Number(record[key]);
    if (Number.isFinite(width) && width > 0) {
      next[key] = width;
    }
  }
  return next;
}

function sanitizePhotoFolderMode(value: unknown, fallback: PhotoFolderMode): PhotoFolderMode {
  return value === 'off' || value === 'auto' ? value : fallback;
}

function sanitizePhotoFolderThreshold(value: unknown, fallback: number) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold)) return fallback;
  return Math.max(10, Math.min(100, Math.round(threshold)));
}

function sanitizePhotoFolderIconSize(value: unknown, fallback: number) {
  const iconSize = Number(value);
  if (!Number.isFinite(iconSize)) return fallback;
  return Math.max(64, Math.min(160, Math.round(iconSize)));
}

function readWorkspaceLayout(): WorkspaceLayoutState | null {
  const saved = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
  if (!saved) return null;

  const parsed = JSON.parse(saved) as Partial<WorkspaceLayoutState>;
  const tabs = sanitizeTabs(parsed.tabs);
  const secondaryTabs = sanitizeTabs(parsed.secondaryTabs);
  const secondaryHistory = sanitizeHistory(parsed.secondaryHistory);
  const secondaryPath = isPathString(parsed.secondaryPath) ? parsed.secondaryPath : '';
  const primaryPath = isPathString(parsed.primaryPath) ? parsed.primaryPath : '';
  const activeTabId = typeof parsed.activeTabId === 'string'
    && tabs.some((tab) => tab.id === parsed.activeTabId)
    ? parsed.activeTabId
    : tabs[0]?.id ?? null;
  const secondaryActiveTabId = typeof parsed.secondaryActiveTabId === 'string'
    && secondaryTabs.some((tab) => tab.id === parsed.secondaryActiveTabId)
    ? parsed.secondaryActiveTabId
    : secondaryTabs[0]?.id ?? null;

  return {
    activePane: parsed.activePane === 'secondary' ? 'secondary' : 'primary',
    activeTabId,
    columnPreset: sanitizeColumnPreset(parsed.columnPreset, state.settings.columnPreset),
    columnWidths: sanitizeColumnWidths(parsed.columnWidths, state.settings.columnWidths),
    dualPaneEnabled: Boolean(parsed.dualPaneEnabled),
    iconSize: Number(parsed.iconSize || state.iconSize || state.settings.defaultIconSize || 64),
    isGridView: Boolean(parsed.isGridView),
    primaryPath,
    previewVisible: Boolean(parsed.previewVisible),
    secondaryHistory,
    secondaryHistoryIndex: sanitizeHistoryIndex(parsed.secondaryHistoryIndex, secondaryHistory),
    secondaryPath,
    secondaryActiveTabId,
    secondaryTabs,
    tabs,
    visibleColumns: sanitizeVisibleColumns(
      parsed.visibleColumns,
      parsed.columnPreset && parsed.columnPreset !== 'custom'
        ? columnsForPreset(parsed.columnPreset)
        : state.settings.visibleColumns,
    ),
  };
}

export function currentWorkspaceLayout(): WorkspaceLayoutState {
  return {
    activePane: state.activePane === 'secondary' && state.dualPaneEnabled ? 'secondary' : 'primary',
    activeTabId: state.activeTabId,
    columnPreset: state.settings.columnPreset,
    columnWidths: { ...state.settings.columnWidths },
    dualPaneEnabled: Boolean(state.dualPaneEnabled),
    iconSize: Number(state.contextualPhotoViewActive ? state.settings.defaultIconSize : (state.iconSize || state.settings.defaultIconSize || 64)),
    isGridView: Boolean(state.contextualPhotoViewActive ? state.settings.defaultView === 'grid' : state.isGridView),
    primaryPath: state.currentPath,
    previewVisible: Boolean(state.showPreviewPane),
    secondaryHistory: [...state.secondaryHistory],
    secondaryHistoryIndex: state.secondaryHistoryIndex,
    secondaryPath: state.secondaryPath,
    secondaryActiveTabId: state.secondaryActiveTabId,
    secondaryTabs: state.secondaryTabs.map((tab) => ({
      ...tab,
      history: [...(tab.history || [])],
    })),
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
    clearLegacyTabKeys();
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
    state.secondaryTabs = layout.secondaryTabs;
    state.secondaryActiveTabId = layout.secondaryActiveTabId;
    state.dualPaneEnabled = layout.dualPaneEnabled;
    state.secondaryPath = layout.secondaryPath;
    state.secondaryHistory = layout.secondaryHistory;
    state.secondaryHistoryIndex = layout.secondaryHistoryIndex;
    state.activePane = layout.dualPaneEnabled ? layout.activePane : 'primary';
    state.showPreviewPane = layout.previewVisible;
    state.isGridView = layout.isGridView;
    state.contextualPhotoViewActive = false;
    state.iconSize = layout.iconSize;
    state.settings = {
      ...state.settings,
      columnPreset: layout.columnPreset,
      columnWidths: sanitizeColumnWidths(layout.columnWidths, state.settings.columnWidths),
      defaultIconSize: layout.iconSize,
      defaultView: layout.isGridView ? 'grid' : 'list',
      visibleColumns: layout.visibleColumns,
    };

    if (layout.primaryPath && state.tabs.length === 0) {
      state.currentPath = layout.primaryPath;
    }

    // Workspace layout owns tabs going forward.
    clearLegacyTabKeys();
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
    tags[path] = { color: tag, id: 0, label: tag, name: tag };
  }
  state.fileTags = tags;
  saveFileTags();
}

export function clearFileTag(path: PathString) {
  setFileTag(path, 'clear');
}
