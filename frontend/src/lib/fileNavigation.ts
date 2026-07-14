import { createDualPaneNavigationActions } from './fileNavigationDualPane';
import { createPreviewPaneNavigationActions } from './fileNavigationPreview';
import { createPrimaryNavigationActions } from './fileNavigationPrimary';
import { createSelectionNavigationActions } from './fileNavigationSelection';
import { createTabNavigationActions } from './fileNavigationTabs';
import { runRuntimeAction } from './runtime';
import type { SimpleFileAppState } from './appState';
import type { DirectoryListing, FileEntry, FilePreview, PathString } from './types';

export type PaneId = 'primary' | 'secondary';

export type FileNavigationActionName =
  | 'activatePane'
  | 'clearSelection'
  | 'closeCurrentTab'
  | 'closeTab'
  | 'focusFirst'
  | 'focusLast'
  | 'goBack'
  | 'goForward'
  | 'goSecondaryBack'
  | 'goSecondaryForward'
  | 'goSecondaryUp'
  | 'goUp'
  | 'handleTypeAhead'
  | 'loadSecondaryPane'
  | 'moveFocus'
  | 'navigateToBookmark'
  | 'navigateToRecent'
  | 'navigateSecondary'
  | 'navigateTo'
  | 'newTab'
  | 'openEntry'
  | 'openFile'
  | 'openSelected'
  | 'refresh'
  | 'selectAll'
  | 'selectRange'
  | 'selectSecondaryItem'
  | 'selectSingle'
  | 'sort'
  | 'switchPane'
  | 'switchTab'
  | 'toggleDualPane'
  | 'togglePreviewPane'
  | 'updatePreviewPane'
  | 'toggleSelection';

export type FileNavigationPreviewMode = 'empty' | 'loading' | 'folder' | 'preview' | 'error';

export type FileNavigationPreviewProps = {
  entry?: FileEntry | null;
  error?: string;
  mode?: FileNavigationPreviewMode;
  preview?: FilePreview | null;
};

export type FileNavigationHost = {
  state: SimpleFileAppState;
  showLoading: () => void;
  hideLoading: () => void;
  clearThumbnailCache: () => void;
  clearQuickFilter: () => void;
  addRecentLocation: (path: PathString) => void;
  renderRecentLocations: () => void;
  updateActiveTab: () => void;
  updateUI: () => void;
  updateSelectionVisuals: () => void;
  updateStatusBar: () => void;
  updateFilteredEntries: () => void;
  renderFileList: () => void;
  updateSortIndicator: () => void;
  createTab: (path: PathString) => { path: PathString };
  switchToTab: (tabId: string) => PathString | null | undefined;
  closeTab: (tabId: string) => PathString | null | undefined;
  getParentPath: (path: PathString) => PathString;
  listDirectory: (path: PathString) => Promise<DirectoryListing>;
  getGitFileStatuses: (path: PathString) => Promise<Record<string, string>>;
  isArchiveFile: (path: PathString) => boolean;
  isArchivePath: (path: PathString) => boolean;
  openFile: (path: PathString) => Promise<unknown>;
  readFilePreview: (path: PathString) => Promise<FilePreview>;
  renderPreviewPane: (props: FileNavigationPreviewProps) => void;
  clearPreviewPane: () => void;
  setPreviewPaneVisible: (visible: boolean) => void;
  unwatchDirectory: () => Promise<unknown>;
  updateTreeSelection: (path: PathString) => Promise<unknown>;
  watchDirectory: (path: PathString) => Promise<unknown>;
  onRefreshError: (error: unknown) => void;
  renderSecondaryFileList: () => void;
  updateSecondaryUI: () => void;
  showError: (error: unknown) => void;
  elements: {
    btnDualPane?: HTMLElement | null;
    paneDivider?: HTMLElement | null;
    panePrimary?: HTMLElement | null;
    paneSecondary?: HTMLElement | null;
  };
};

export type FileNavigationActions = {
  navigateTo: (path: PathString) => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  refresh: () => Promise<void>;
  openEntry: (path: PathString, isDirectory?: boolean) => Promise<void>;
  openSelected: () => Promise<void>;
  openFile: (path: PathString) => Promise<void>;
  navigateToBookmark: (path: PathString) => void;
  navigateToRecent: (path: PathString) => void;
  selectSingle: (path: PathString, index: number) => void;
  toggleSelection: (path: PathString, index: number) => void;
  selectRange: (fromIndex: number, toIndex: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  moveFocus: (delta: number, extendSelection?: boolean) => void;
  focusFirst: (extendSelection?: boolean) => void;
  focusLast: (extendSelection?: boolean) => void;
  handleTypeAhead: (char: string) => void;
  sort: (sortBy: string) => void;
  newTab: () => void;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeCurrentTab: () => void;
  togglePreviewPane: () => void;
  updatePreviewPane: () => Promise<void>;
  toggleDualPane: () => void;
  switchPane: () => void;
  activatePane: (pane: PaneId) => void;
  loadSecondaryPane: () => Promise<void>;
  navigateSecondary: (path: PathString) => Promise<void>;
  goSecondaryBack: () => void;
  goSecondaryForward: () => void;
  goSecondaryUp: () => void;
  selectSecondaryItem: (path: PathString) => void;
};

export function runFileNavigationAction(
  name: FileNavigationActionName,
  ...args: unknown[]
) {
  return runRuntimeAction(name, ...args);
}

export function navigateTo(path: PathString) {
  return runFileNavigationAction('navigateTo', path);
}

export function navigateSecondary(path: PathString) {
  return runFileNavigationAction('navigateSecondary', path);
}

export function openEntry(path: PathString, isDirectory?: boolean) {
  return runFileNavigationAction('openEntry', path, isDirectory);
}

export function openFilePath(path: PathString) {
  return runFileNavigationAction('openFile', path);
}

export function selectSingle(path: PathString, index: number) {
  return runFileNavigationAction('selectSingle', path, index);
}

export function toggleSelection(path: PathString, index: number) {
  return runFileNavigationAction('toggleSelection', path, index);
}

export function selectRange(fromIndex: number, toIndex: number) {
  return runFileNavigationAction('selectRange', fromIndex, toIndex);
}

export function activatePane(pane: PaneId) {
  return runFileNavigationAction('activatePane', pane);
}

export function selectSecondaryItem(path: PathString) {
  return runFileNavigationAction('selectSecondaryItem', path);
}

export function createFileNavigationActions(host: FileNavigationHost): FileNavigationActions {
  const previewActions = createPreviewPaneNavigationActions(host);
  const primaryActions = createPrimaryNavigationActions(host);
  const selectionActions = createSelectionNavigationActions(host, {
    updatePreviewPane: previewActions.updatePreviewPane,
  });
  const tabActions = createTabNavigationActions(host, primaryActions.navigateTo);
  const dualPaneActions = createDualPaneNavigationActions(host);

  return {
    ...primaryActions,
    ...selectionActions,
    ...tabActions,
    ...previewActions,
    ...dualPaneActions,
  };
}
