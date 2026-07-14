export const localState = $state({
  appContainer: undefined as any,
  navigationToken: 0,
  previewPaneToken: 0,
  currentQuickLookPath: null as any,
  currentArchivePath: null as any,
  currentProgressOperationId: null as any,
  watchedDirectoryPath: null as any,
  fileChangeRefreshTimer: null as any,
  undoStack: [] as any[],
  redoStack: [] as any[],
  isSettingColorLabel: false,
  MAX_UNDO_STACK: 50,
  advancedRenameTargets: [] as any[],
  advancedRenamePlans: [] as any[]
});
