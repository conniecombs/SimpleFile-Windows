import type {
  ArchiveInfo,
  ArchiveFormat,
  ClipboardAction,
  DriveInfo,
  FileEntry,
  GitStatus,
  OperationId,
  PathString,
  ProgressUpdate,
  SearchResult,
  SmartFolder,
  ThemeName,
  TreeNode,
  ViewMode,
  ColumnId,
} from './types';
import type { SearchWorkflowOptions } from './searchOptions';

export interface AppSettings {
  theme: ThemeName;
  defaultView: ViewMode;
  defaultIconSize: number;
  showHidden: boolean;
  useTrash: boolean;
  confirmDelete: boolean;
  openInNewTab: boolean;
  autoCollapseTree: boolean;
  showRecentLocations: boolean;
  showFolderSizes: boolean;
  enableGitIntegration?: boolean;
  startLocation: 'home' | 'last' | 'custom' | string;
  customPath: PathString;
  shortcutOverrides: Record<string, string>;
  visibleColumns: ColumnId[];
  columnWidths: Record<'name' | ColumnId, number>;
}

export interface FileTab {
  id: string;
  path: PathString;
  title: string;
  history: PathString[];
  historyIndex: number;
}

export interface Bookmark {
  id: string;
  path: PathString;
  name: string;
}

export interface RecentLocation {
  path: PathString;
  name: string;
  timestamp: number;
}

export interface ClipboardHistoryItem {
  paths: PathString[];
  action: ClipboardAction;
}

export interface UndoHistoryItem {
  description: string;
  redo?: () => Promise<unknown>;
  undo: () => Promise<unknown>;
}

export type OperationLogStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type OperationLogRetry =
  | {
      kind: 'transfer';
      action: 'copy' | 'move';
      destination: PathString;
      sources: PathString[];
      options?: {
        pushUndo?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
      };
    }
  | {
      kind: 'delete';
      paths: PathString[];
      useTrash: boolean;
    }
  | {
      kind: 'create-archive';
      archivePath: PathString;
      format: ArchiveFormat;
      sourcePaths: PathString[];
    }
  | {
      kind: 'extract-archive';
      archivePath: PathString;
      targetDirectory: PathString;
    }
  | {
      kind: 'advanced-rename';
      requests: Array<{ path: PathString; new_name: string }>;
    };

export interface OperationLogEntry {
  id: OperationId;
  action: string;
  detail?: string;
  error?: string;
  finishedAt?: number;
  itemCount: number;
  retry?: OperationLogRetry;
  startedAt: number;
  status: OperationLogStatus;
  target?: PathString;
  title: string;
}

/** @deprecated Prefer ColorLabelTag from types.ts */
export type FileTag = import('./types').ColorLabelTag;

export interface FolderStackItem {
  id: string | number;
  name: string;
}

export interface SimpleFileAppState {
  currentPath: PathString;
  entries: FileEntry[];
  filteredEntries: FileEntry[];
  selectedEntries: Set<PathString>;
  lastSelectedIndex: number;
  focusedIndex: number;
  history: PathString[];
  historyIndex: number;
  clipboard: PathString[] | null;
  clipboardAction: ClipboardAction | null;
  undoStack: UndoHistoryItem[];
  redoStack: UndoHistoryItem[];
  sortBy: 'name' | 'size' | 'modified' | 'extension' | string;
  sortAsc: boolean;
  isGridView: boolean;
  homePath: PathString;
  showHiddenFiles: boolean;
  activeOperations: Map<OperationId, ProgressUpdate>;
  typeAheadBuffer: string;
  typeAheadTimeout: number | null;
  draggedItems: PathString[];
  isDragging: boolean;
  treeData: Map<PathString, TreeNode[]>;
  treeExpanded: Set<PathString>;
  showPreviewPane: boolean;
  previewEntry: FileEntry | null;
  iconSize: number;
  quickLookVisible: boolean;
  quickLookEntry: FileEntry | null;
  folderSizes: Map<PathString, number>;
  tabs: FileTab[];
  activeTabId: string | null;
  bookmarks: Bookmark[];
  recentLocations: RecentLocation[];
  drives: DriveInfo[];
  theme: ThemeName;
  settingsVisible: boolean;
  aboutVisible: boolean;
  commandPaletteVisible: boolean;
  settings: AppSettings;
  dualPaneEnabled: boolean;
  activePane: 'primary' | 'secondary';
  secondaryPath: PathString;
  secondaryEntries: FileEntry[];
  secondaryFilteredEntries: FileEntry[];
  secondarySelectedEntries: Set<PathString>;
  secondaryHistory: PathString[];
  secondaryHistoryIndex: number;
  currentArchive: ArchiveInfo | null;
  searchQuery: string;
  searchResults: Array<SearchResult | FileEntry>;
  isSearching: boolean;
  searchMode: boolean;
  currentSearchId: string | null;
  searchCancelled: boolean;
  searchOptions: SearchWorkflowOptions | null;
  smartFolders: SmartFolder[];
  cleanupInProgress: boolean;
  _savedEntries: FileEntry[] | null;
  gitStatus: GitStatus | null;
  isNavigating: boolean;
  filterQuery: string;
  clipboardHistory: ClipboardHistoryItem[];
  operationHistory: OperationLogEntry[];
  fileTags: Record<PathString, FileTag>;
  tags: FileTag[];
}

export function createDefaultSettings(): AppSettings {
  return {
    theme: 'dark',
    defaultView: 'list',
    defaultIconSize: 64,
    showHidden: false,
    useTrash: true,
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
  };
}

export function createInitialAppState(): SimpleFileAppState {
  return {
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
    typeAheadBuffer: '',
    typeAheadTimeout: null,
    draggedItems: [],
    isDragging: false,
    treeData: new Map(),
    treeExpanded: new Set(),
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
    settings: createDefaultSettings(),
    dualPaneEnabled: false,
    activePane: 'primary',
    secondaryPath: '',
    secondaryEntries: [],
    secondaryFilteredEntries: [],
    secondarySelectedEntries: new Set(),
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
    isNavigating: false,
    filterQuery: '',
    clipboardHistory: [],
    operationHistory: [],
    fileTags: {},
    tags: [],
  };
}
