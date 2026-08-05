import type { FileEntry, OperationId, PathString } from '../types';

interface AdvancedRenameTarget {
  entry: FileEntry;
  index: number;
  parentPath: PathString;
}

interface AdvancedRenamePlan {
  changed: boolean;
  detail: PathString;
  error: string | null;
  newName: string;
  oldName: string;
  parentPath: PathString;
  path: PathString;
}

interface LocalState {
  appContainer: HTMLElement | undefined;
  folderMetricsToken: number;
  navigationToken: number;
  previewPaneToken: number;
  secondaryNavigationToken: number;
  currentQuickLookPath: PathString | null;
  currentArchivePath: PathString | null;
  currentProgressCancel: (() => unknown) | null;
  currentProgressOperationId: OperationId | null;
  /** Last transfer/progress operation the backend reported as cancelled. */
  lastCancelledOperationId: OperationId | null;
  watchedDirectoryPath: PathString | null;
  fileChangeRefreshTimer: number | null;
  isSettingColorLabel: boolean;
  MAX_UNDO_STACK: number;
  advancedRenameTargets: AdvancedRenameTarget[];
  advancedRenamePlans: AdvancedRenamePlan[];
}

export const localState = $state<LocalState>({
  appContainer: undefined,
  folderMetricsToken: 0,
  navigationToken: 0,
  previewPaneToken: 0,
  secondaryNavigationToken: 0,
  currentQuickLookPath: null,
  currentArchivePath: null,
  currentProgressCancel: null,
  currentProgressOperationId: null,
  lastCancelledOperationId: null,
  watchedDirectoryPath: null,
  fileChangeRefreshTimer: null,
  isSettingColorLabel: false,
  MAX_UNDO_STACK: 50,
  advancedRenameTargets: [],
  advancedRenamePlans: []
});
