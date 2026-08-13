
import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, loadWorkspaceLayout, removeBookmark, saveSettings, saveTabs, saveWorkspaceLayout, state as appState, subscribe } from '../../vanilla-js/runtime/state.svelte';
import { resolveStartupLocation } from '../../vanilla-js/runtime/startup-location';
  import {
    batchRename,
    calculateFolderSize,
    compareFiles,
    computeChecksum,
    countFolderItems,
    copyEntryResolved,
    copyWithProgress,
    createArchive,
    createDirectory,
    createFile,
    createTag,
    deleteEntry,
    deleteSmartFolder,
    diskCleanup,
    extractArchive,
    getAllFileTags,
    getAllTags,
    getEntryInfo,
    getImageMetadata,
    getHomeDir,
    listDirectory,

    listSubdirectories,
    listArchive,
    loadSmartFolders,
    moveEntryResolved,
    moveWithProgress,
    moveToTrash,
    onExternalFileDrop,
    onExternalFileDropHover,
    onExternalFileDropLeave,
    onFileChange,
    onOperationProgress,
    openFile,
    openFileWith,
    openPowerShellAdmin,
    openTerminal,
    readFilePreview,
    renameEntry,
    searchFiles,
    selectDirectory,
    cancelSearch,
    checkForUpdate,
    checkRarInstalled,
    getAppAboutInfo,
    getAppVersion,
    installUpdate,
    saveSmartFolder,
    setTagsForPath,
    watchDirectory,
    unwatchDirectory,
  } from '../api';
  import {
    basename,
    createFallbackDriveForPath,
    fileType,
    formatModified,
    formatFileSize,
    getParentPath,
    isValidFileName,
    joinPath,
    visibleEntries,
  } from '../coreFileManager';
  import { renderAdvancedSearchDialog } from '../searchDialog';
  import { getRecentSearches, rememberRecentSearch } from '../searchStorage';
  import { getOpenWithSuggestions, rememberOpenWithApplication } from '../localCommandStorage';
  import { readAdvancedSearchOptions, searchResultToFileEntry, toSearchCommandOptions, type SearchWorkflowOptions } from '../searchOptions';
  import { renderAdvancedRenamePreview } from '../components/advanced-rename-preview';
  import { renderArchiveContents, renderArchiveInfo, renderCreateArchiveBody } from '../components/archive-surfaces';
  import { clearSearchResultsHeader, renderSearchResultsHeader } from '../components/search-chrome';
  import { renderContextMenu } from '../components/context-menus';
  import { clearQuickLook, renderQuickLook } from '../components/quick-look';
  import { renderStatusBar } from '../components/status-bar';
  import { showError, showSuccess } from '../components/toasts';
  import { tick } from 'svelte';
  import { renderLayoutShell } from '../components/layout-shell';
  import type {
    ArchiveFormat,
    ColumnId,
    ClipboardAction,
    CleanupResult,
    ConflictAction,
    FileEntry,
    NativeFileDropEventPayload,
    OperationId,
    PathString,
    ProgressUpdate,
    RenameRequest,
    SearchOptions,
    SmartFolder,
    TransferResult,
  } from '../types';
import { localState } from './localState.svelte';
import type { PaneId } from "../fileNavigation.js";
import type { TransferAction } from "../transferPathUtils.js";
import { handleKeyDown, isEditableTarget, normalizeShortcutCombo, registerShortcut, unregisterShortcut, updateShortcutCombo, type ShortcutOptions } from "../keyboardShortcuts.js";
import { showAdvancedRenameFlow, closeAdvancedRenameFlow, applyAdvancedRenameFlow, updateAdvancedRenameOperationClasses, refreshAdvancedRenamePreview } from "./advanced_rename.js";
import { isAdvancedRenameVisible } from './advancedRenameUi.svelte';
import { closeAboutUi, isAboutVisible } from './aboutUi.svelte';
import { isKeyboardHelpVisible } from './keyboardHelpUi.svelte';
import { isQuickLookVisible, closeQuickLookUi } from './quickLookUi.svelte';
import { closeDuplicateCheckerUi, isDuplicateCheckerVisible } from './duplicateCheckerUi.svelte';
import { showCreateArchiveFlow, closeArchiveFlow, extractArchiveFlow, confirmCreateArchiveFlow } from "./archive.js";
import { isArchiveViewerVisible, isCreateArchiveVisible, closeCreateArchiveUi } from './archiveUi.svelte';
import { requestSearchFocus } from './searchUi.svelte';
import { applyPersistedViewSettings, updateStatusBar, loadTagsFlow, loadDirectory, openEntryPath, filteredEntriesForPane, selectedSetForPane, selectSecondaryPaths, selectPaths, updatePreviewPane, navigateHistory, refreshCurrentDirectory, createFolderFlow, createFileFlow, renameSelectedFlow, copySelection, pasteClipboard, deleteSelectedFlow, undoLastFlow, redoLastFlow, showClipboardHistoryFlow, showOperationHistoryFlow, showSetColorLabelFlow, showFolderMetricsFlow, showDiskCleanupFlow, showDuplicateCheckerFlow, closePreviewPaneFlow, applyTheme, loadSecondaryDirectory, loadDirectoryForPane, pathForPane, navigateSpecial, navigateSecondaryHistory, loadTreeChildren, applyEntryFilters, applySecondaryEntryFilters, openNewTab, switchToTab, closeTab, moveTabFocus, tabsForPane, activeTabIdForPane, showQuickLookFlow, showKeyboardHelpFlow, showContextMenuAt, handleContextMenuCommand, hideContextMenu, closeSettingsModal, openSettingsModal, syncSettingsControls, updateToolStatus, saveSettingsFromControls, moveSettingsColumn, resetColumnSettings, installRarFlow, checkForUpdatesFlow, installUpdateFlow, showAboutFlow, overlayById, closeQuickLookFlow, closeKeyboardHelpFlow, hideProgressFlow, selectAllEntries, clearActiveSelection, moveActiveListFocus, focusActiveListEdge, handleActiveTypeAhead, refreshSecondaryPane, openSelected, copySelectedPathsToSystemClipboard, updateProgressFlow, pathsFromNativeDropPayload, setExternalDropOverlayVisible, transferEntriesWithSafety, scheduleFileChangeRefresh, currentSelectionPaths, dropDestinationFromTarget, resetInternalDragState, previewShortcutSettingInput, resetAllShortcutSettings, resetShortcutSetting, saveShortcutSettingFromInput, isProgressDialogVisible, isGenericModalVisible, activatePane, switchActivePane, copyOrMoveToOtherPane, refreshDrives, previewDuplicateCheckerPath, openDuplicateCheckerPath, revealDuplicateCheckerPath, deleteDuplicateCheckerSelection } from "./core.js";
import { cancelModalUi, isSettingsModalOpen } from './modalUi.svelte';
import { dismissProgressUi, progressUi } from './progressUi.svelte';
import { loadSmartFoldersFlow, runSearch, clearSearch, setSearchControlsVisible, openAdvancedSearchFlow, saveCurrentSearchAsSmartFolderFlow, openSmartFolderFlow, deleteSmartFolderFlow, showPropertiesFlow } from "./search.js";

type AppDetailEvent<T> = CustomEvent<T> & Event;

type OpenEntryDetail = {
  isDir?: boolean;
  pane?: PaneId;
  path?: PathString;
  segment?: { path?: PathString };
};

type DuplicateCheckerPathDetail = {
  path?: PathString;
};

type DuplicateCheckerDeleteDetail = {
  paths?: PathString[];
};

type ItemSelectionDetail = {
  ctrlKey?: boolean;
  index: number;
  metaKey?: boolean;
  pane?: PaneId;
  path?: PathString;
  shiftKey?: boolean;
};

type ToolbarCommandDetail = {
  command?: string;
  pane?: PaneId;
};

type PaneCommandDetail = {
  command?: string;
  pane?: PaneId;
  path?: PathString;
};

type PathDetail = {
  path?: PathString;
};

type SortDetail = {
  sort?: string;
};

type IconSizeDetail = {
  commit?: boolean;
  value?: number;
};

type ToastDetail = {
  message?: string;
  type?: string;
};

type SearchSubmitDetail = {
  query?: string;
};

type SearchResultsSaveDetail = {
  handled?: boolean;
};

type SmartFolderOpenDetail = {
  folder?: SmartFolder;
};

type SmartFolderDeleteDetail = {
  id?: string;
};

type SmartFoldersChangedDetail = {
  smartFolders?: SmartFolder[];
};

type TabIdDetail = {
  direction?: number;
  pane?: PaneId;
  tabId?: string;
};

type CreateArchiveConfirmDetail = {
  format?: ArchiveFormat;
  name?: string;
  selectedPaths?: PathString[];
  targetDirectory?: PathString;
};

function detailOf<T>(event: Event): T {
  return ((event as AppDetailEvent<T>).detail ?? {}) as T;
}

export function initApp() {
    loadSettings();
    loadBookmarks();
    loadRecentLocations();
    // Workspace layout is the single source of truth for tabs; legacy simplefile-tabs
    // is only used when no workspace snapshot exists (loadTabs migrates then clears it).
    const workspaceLayoutLoaded = loadWorkspaceLayout();
    const tabsLoaded = loadTabs() || workspaceLayoutLoaded;
    applyPersistedViewSettings();
    renderLayoutShell(localState.appContainer);
    renderContextMenu(document.getElementById('context-menu'));
    updateStatusBar();
    void loadSmartFoldersFlow();
    void loadTagsFlow();

    let workspacePersistenceReady = false;
    let workspaceLayoutSaveTimer: number | null = null;
    const workspaceLayoutProperties = new Set([
      'activePane',
      'activeTabId',
      'currentPath',
      'dualPaneEnabled',
      'history',
      'historyIndex',
      'iconSize',
      'isGridView',
      'secondaryActiveTabId',
      'secondaryHistory',
      'secondaryHistoryIndex',
      'secondaryPath',
      'secondaryTabs',
      'settings',
      'showPreviewPane',
      'tabs',
    ]);

    const queueWorkspaceLayoutSave = () => {
      if (!workspacePersistenceReady) return;

      if (workspaceLayoutSaveTimer !== null) {
        window.clearTimeout(workspaceLayoutSaveTimer);
      }

      workspaceLayoutSaveTimer = window.setTimeout(() => {
        workspaceLayoutSaveTimer = null;
        saveWorkspaceLayout();
      }, 120);
    };

    const flushWorkspaceLayoutSave = () => {
      if (workspaceLayoutSaveTimer !== null) {
        window.clearTimeout(workspaceLayoutSaveTimer);
        workspaceLayoutSaveTimer = null;
      }
      if (workspacePersistenceReady) {
        saveWorkspaceLayout();
      }
    };

    const unsubscribeWorkspaceLayout = subscribe((property) => {
      if (workspaceLayoutProperties.has(String(property))) {
        queueWorkspaceLayoutSave();
      }
    });

    getHomeDir().then(async (home) => {
      appState.homePath = home;
      const fallbackDrive = createFallbackDriveForPath(home);
      if (fallbackDrive && (!appState.drives || appState.drives.length === 0)) {
        appState.drives = [fallbackDrive];
      }

      const startup = resolveStartupLocation({
        activeTabId: appState.activeTabId,
        homePath: home,
        settings: appState.settings,
        tabs: appState.tabs,
        tabsLoaded: tabsLoaded || workspaceLayoutLoaded,
      });
      appState.tabs = startup.tabs;
      appState.activeTabId = startup.activeTabId;
      appState.history = startup.history;
      appState.historyIndex = startup.historyIndex;

      await loadDirectory(startup.startPath, appState.history.length > 0 ? 'replace-current' : 'push');
      if (appState.dualPaneEnabled) {
        const secondaryStartPath = appState.secondaryPath || appState.currentPath;
        if (secondaryStartPath) {
          const restoredActivePane = appState.activePane;
          await loadSecondaryDirectory(
            secondaryStartPath,
            appState.secondaryHistory.length > 0 ? 'replace-current' : 'push',
            false,
          );
          appState.activePane = restoredActivePane === 'secondary' && appState.secondaryPath ? 'secondary' : 'primary';
        } else {
          appState.dualPaneEnabled = false;
          appState.activePane = 'primary';
        }
      }
      if (appState.showPreviewPane) void updatePreviewPane();
      workspacePersistenceReady = true;
      saveWorkspaceLayout();
    }).catch(console.error);

    void refreshDrives({ quiet: true }).then((drives) => {
      if (drives.length > 0) return;
      const fallbackDrive = createFallbackDriveForPath(appState.homePath || appState.currentPath);
      if (fallbackDrive) {
        appState.drives = [fallbackDrive];
      }
    });

    let drivesRefreshing = false;
    const handleRefreshDrives = () => {
      if (drivesRefreshing) return;
      drivesRefreshing = true;
      const refreshBtn = document.getElementById('btn-refresh-drives') as HTMLButtonElement | null;
      if (refreshBtn) refreshBtn.disabled = true;
      void refreshDrives()
        .then((drives) => {
          const offlineCount = drives.filter((drive) => {
            const status = String(drive.drive_status || 'available').toLowerCase();
            return status === 'offline' || status === 'stale';
          }).length;
          if (offlineCount > 0) {
            showSuccess(`Drives refreshed · ${offlineCount} network mapping${offlineCount === 1 ? '' : 's'} need attention`);
          } else {
            showSuccess('Drives refreshed');
          }
        })
        .finally(() => {
          drivesRefreshing = false;
          if (refreshBtn) refreshBtn.disabled = false;
        });
    };

    const handleOpenEntry = (e: Event) => {
      const detail = detailOf<OpenEntryDetail>(e);
      const path = detail.path || detail.segment?.path;
      if (!path) return;

      // Tree-node and breadcrumb events are always directories; infer isDir
      // from the event type if the detail doesn't already include it.
      const alwaysDir = e.type === 'simplefile:tree-node-open' || e.type === 'simplefile:breadcrumb-navigate';
      const isDir = detail.isDir ?? alwaysDir;

      void openEntryPath(path, isDir, detail.pane || appState.activePane as PaneId);
    };

    const handleItemSelection = (e: Event) => {
      const detail = detailOf<ItemSelectionDetail>(e);
      const { ctrlKey, index, metaKey, pane = 'primary', path, shiftKey } = detail;
      if (!path || !Number.isFinite(index)) return;
      const activePane = pane === 'secondary' ? 'secondary' : 'primary';
      const paneEntries = filteredEntriesForPane(activePane);
      const paneSelection = selectedSetForPane(activePane);

      if (shiftKey && appState.lastSelectedIndex >= 0) {
        const start = Math.min(appState.lastSelectedIndex, index);
        const end = Math.max(appState.lastSelectedIndex, index);
        const selectedRange = paneEntries.slice(start, end + 1).map((entry: FileEntry) => entry.path);
        if (activePane === 'secondary') selectSecondaryPaths(selectedRange, index);
        else selectPaths(selectedRange, index);
        return;
      }

      if (ctrlKey || metaKey) {
        const nextSelection = new Set(paneSelection);
        if (nextSelection.has(path)) nextSelection.delete(path);
        else nextSelection.add(path);
        if (activePane === 'secondary') {
          appState.secondarySelectedEntries = nextSelection;
          appState.activePane = 'secondary';
        } else {
          appState.selectedEntries = nextSelection;
          appState.activePane = 'primary';
        }
        appState.focusedIndex = index;
        appState.lastSelectedIndex = index;
        updateStatusBar();
        if (activePane === 'primary') void updatePreviewPane();
        return;
      }

      if (activePane === 'secondary') selectSecondaryPaths([path], index);
      else selectPaths([path], index);
    };

    const handleToolbarCommand = (e: Event) => {
      const detail = detailOf<ToolbarCommandDetail>(e);
      const command = detail.command;
      const targetPane = detail.pane || appState.activePane as PaneId;
      if (!command) return;
      if (command === 'back') void (targetPane === 'secondary' ? navigateSecondaryHistory(-1) : navigateHistory(-1));
      else if (command === 'forward') void (targetPane === 'secondary' ? navigateSecondaryHistory(1) : navigateHistory(1));
      else if (command === 'up') {
        const parent = getParentPath(pathForPane(targetPane));
        if (parent) void loadDirectoryForPane(parent, targetPane);
      } else if (command === 'refresh') {
        void (targetPane === 'secondary' ? refreshSecondaryPane() : refreshCurrentDirectory());
      } else if (command === 'new-folder') {
        void createFolderFlow();
      } else if (command === 'new-file') {
        void createFileFlow();
      } else if (command === 'rename') {
        void renameSelectedFlow();
      } else if (command === 'copy') {
        copySelection('copy');
      } else if (command === 'cut') {
        copySelection('cut');
      } else if (command === 'paste') {
        void pasteClipboard();
      } else if (command === 'delete') {
        void deleteSelectedFlow();
      } else if (command === 'undo') {
        void undoLastFlow();
      } else if (command === 'redo') {
        void redoLastFlow();
      } else if (command === 'clipboard-history') {
        void showClipboardHistoryFlow();
      } else if (command === 'operation-history') {
        void showOperationHistoryFlow();
      } else if (command === 'color-label') {
        void showSetColorLabelFlow();
      } else if (command === 'folder-metrics') {
        void showFolderMetricsFlow();
      } else if (command === 'disk-cleanup') {
        void showDiskCleanupFlow();
      } else if (command === 'duplicate-checker') {
        void showDuplicateCheckerFlow();
      } else if (command === 'view-toggle') {
        appState.isGridView = !appState.isGridView;
        appState.settings = { ...appState.settings, defaultView: appState.isGridView ? 'grid' : 'list' };
        saveSettings();
      } else if (command === 'preview-toggle') {
        appState.showPreviewPane = !appState.showPreviewPane;
        if (appState.showPreviewPane) void updatePreviewPane();
        else closePreviewPaneFlow();
      } else if (command === 'theme-toggle') {
        appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
        appState.settings = { ...appState.settings, theme: appState.theme };
        applyTheme();
        saveSettings();
      } else if (command === 'dual-pane') {
        toggleDualPane();
      } else if (command === 'terminal') {
        openTerminal(pathForPane(targetPane)).catch(showError);
      } else if (command.startsWith?.('navigate')) {
        void navigateSpecial(command, targetPane);
      }
    };

    const handlePaneCommand = (e: Event) => {
      const detail = detailOf<PaneCommandDetail>(e);
      const command = detail.command;
      const pane = detail.pane === 'secondary' ? 'secondary' : 'primary';
      if (command === 'back') {
        void (pane === 'secondary' ? navigateSecondaryHistory(-1) : navigateHistory(-1));
      } else if (command === 'forward') {
        void (pane === 'secondary' ? navigateSecondaryHistory(1) : navigateHistory(1));
      } else if (command === 'up') {
        const parent = getParentPath(pathForPane(pane));
        if (parent) void loadDirectoryForPane(parent, pane);
      } else if (command === 'navigate' && detail.path) {
        void loadDirectoryForPane(detail.path, pane);
      }
    };

    const handleTreeToggle = async (e: Event) => {
      const path = detailOf<PathDetail>(e).path;
      if (!path) return;

      const expanded = new Set(appState.treeExpanded);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
        if (!appState.treeData.has(path)) {
          try {
            await loadTreeChildren(path);
          } catch (error) {
            showError(error);
          }
        }
      }
      appState.treeExpanded = expanded;
    };

    const handleSort = (e: Event) => {
      const sortBy = detailOf<SortDetail>(e).sort;
      if (!sortBy) return;
      if (appState.sortBy === sortBy) {
        appState.sortAsc = !appState.sortAsc;
      } else {
        appState.sortBy = sortBy;
        appState.sortAsc = true;
      }
      applyEntryFilters();
      if (appState.dualPaneEnabled) applySecondaryEntryFilters();
    };

    const handleIconSize = (e: Event) => {
      const detail = detailOf<IconSizeDetail>(e);
      const value = Math.max(48, Math.min(128, Number(detail.value || appState.iconSize || 64)));
      appState.iconSize = value;
      appState.settings = { ...appState.settings, defaultIconSize: value };
      document.documentElement.style.setProperty('--icon-size', `${value}px`);
      if (detail.commit) saveSettings();
    };

    const handleToast = (e: Event) => {
      const { message, type } = detailOf<ToastDetail>(e);
      if (type === 'error') showError(message);
      else showSuccess(message);
    };

    const handleSearchSubmit = (e: Event) => {
      void runSearch(detailOf<SearchSubmitDetail>(e).query || '');
    };

    const handleSearchClear = () => {
      void clearSearch();
    };

    const handleSearchCancel = () => {
      if (appState.currentSearchId) {
        cancelSearch(appState.currentSearchId).catch(showError);
      }
      appState.currentSearchId = null;
      appState.isSearching = false;
      setSearchControlsVisible({ clear: appState.searchMode, cancel: false });
    };

    const handleSearchAdvanced = () => {
      void openAdvancedSearchFlow();
    };

    const handleSearchResultsSave = (e: Event) => {
      if (detailOf<SearchResultsSaveDetail>(e).handled) return;
      void saveCurrentSearchAsSmartFolderFlow();
    };

    const toggleDualPane = () => {
      appState.dualPaneEnabled = !appState.dualPaneEnabled;
      if (appState.dualPaneEnabled) {
        if (!appState.secondaryPath) {
          void loadSecondaryDirectory(appState.currentPath, 'replace-current', false);
        }
        activatePane('primary');
      } else {
        activatePane('primary');
      }
      updateStatusBar();
    };

    const handleActivatePane = (e: Event) => {
      const pane = (e as CustomEvent<{ pane?: string }>).detail?.pane;
      if (pane === 'secondary' || pane === 'primary') {
        activatePane(pane);
      }
    };

    const handleSearchFocus = () => {
      requestSearchFocus();
    };

    const handleSmartFolderOpen = (e: Event) => {
      void openSmartFolderFlow(detailOf<SmartFolderOpenDetail>(e).folder);
    };

    const handleSmartFolderDelete = (e: Event) => {
      void deleteSmartFolderFlow(detailOf<SmartFolderDeleteDetail>(e).id);
    };

    const handleSmartFoldersChanged = (e: Event) => {
      const smartFolders = detailOf<SmartFoldersChangedDetail>(e).smartFolders;
      if (Array.isArray(smartFolders)) {
        appState.smartFolders = smartFolders;
      }
    };

    const handleTabNew = (e: Event) => {
      const pane = detailOf<TabIdDetail>(e).pane || appState.activePane as PaneId;
      void openNewTab(undefined, pane);
    };

    const handleTabSwitch = (e: Event) => {
      const detail = detailOf<TabIdDetail>(e);
      const tabId = detail.tabId;
      if (tabId) void switchToTab(tabId, detail.pane || appState.activePane as PaneId);
    };

    const handleTabClose = (e: Event) => {
      const detail = detailOf<TabIdDetail>(e);
      const tabId = detail.tabId;
      if (tabId) void closeTab(tabId, detail.pane || appState.activePane as PaneId);
    };

    const handleTabFocusMove = (e: Event) => {
      const detail = detailOf<TabIdDetail>(e);
      const tabId = detail.tabId;
      const direction = Number(detail.direction || 0);
      if (tabId && direction) moveTabFocus(tabId, direction, detail.pane || appState.activePane as PaneId);
    };

    const handleProperties = () => {
      void showPropertiesFlow();
    };

    const handleQuickLook = () => {
      void showQuickLookFlow();
    };

    const handlePreviewClose = () => {
      closePreviewPaneFlow();
    };

    const handleCreateArchive = () => {
      void showCreateArchiveFlow();
    };

    const handleArchiveExtract = () => {
      void extractArchiveFlow(pathForPane());
    };

    const handleCreateArchiveConfirm = (event: Event) => {
      void confirmCreateArchiveFlow(detailOf<CreateArchiveConfirmDetail>(event));
    };

    const handleAdvancedRename = () => {
      void showAdvancedRenameFlow();
    };

    const handleKeyboardHelp = () => {
      showKeyboardHelpFlow();
    };

    const handleOperationHistory = () => {
      void showOperationHistoryFlow();
    };

    const handleSetColorLabel = () => {
      void showSetColorLabelFlow();
    };

    const handleFolderMetrics = () => {
      void showFolderMetricsFlow();
    };

    const handleDiskCleanup = () => {
      void showDiskCleanupFlow();
    };

    const handleDuplicateChecker = () => {
      void showDuplicateCheckerFlow();
    };

    const handleDuplicateCheckerClose = () => {
      closeDuplicateCheckerUi();
    };

    const handleDuplicateCheckerPathAction = (
      event: Event,
      action: (path: PathString) => Promise<unknown>,
    ) => {
      const path = detailOf<DuplicateCheckerPathDetail>(event).path;
      if (path) void action(path);
    };

    const handleDuplicateCheckerDelete = (event: Event) => {
      const paths = detailOf<DuplicateCheckerDeleteDetail>(event).paths || [];
      void deleteDuplicateCheckerSelection(paths);
    };

    const handleDuplicateCheckerOpen = (event: Event) => {
      handleDuplicateCheckerPathAction(event, openDuplicateCheckerPath);
    };

    const handleDuplicateCheckerPreview = (event: Event) => {
      handleDuplicateCheckerPathAction(event, previewDuplicateCheckerPath);
    };

    const handleDuplicateCheckerReveal = (event: Event) => {
      handleDuplicateCheckerPathAction(event, revealDuplicateCheckerPath);
    };

    const handleFileListContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const fileList = target?.closest('#file-list, #secondary-file-list');
      if (!fileList) return;
      const pane: PaneId = fileList.id === 'secondary-file-list' ? 'secondary' : 'primary';
      const selectedSet = selectedSetForPane(pane);

      event.preventDefault();
      const item = target?.closest<HTMLElement>('.file-item');
      if (item?.dataset.path) {
        const index = Number(item.dataset.index ?? -1);
        if (!selectedSet.has(item.dataset.path)) {
          if (pane === 'secondary') selectSecondaryPaths([item.dataset.path], Number.isFinite(index) ? index : -1);
          else selectPaths([item.dataset.path], Number.isFinite(index) ? index : -1);
        }
      } else {
        appState.activePane = pane;
        updateStatusBar();
      }

      showContextMenuAt(event.clientX, event.clientY);
    };

    const handleContextMenuClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('#context-menu button[id]');
      if (!button || button.disabled) return;
      event.preventDefault();
      void handleContextMenuCommand(button.id);
    };

    const handleDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#context-menu')) {
        hideContextMenu();
      }
    };

    const handleSettingsOpen = () => {
      try {
        openSettingsModal();
        void tick().then(() => {
          syncSettingsControls();
          void updateToolStatus();
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showError(`Failed to open settings: ${message}`);
        console.error('Failed to open settings:', err);
      }
    };

    const persistedSettingsControlIds = new Set([
      'settings-theme',
      'settings-default-view',
      'settings-icon-size',
      'settings-show-hidden',
      'settings-confirm-delete',
      'settings-use-trash',
      'settings-new-tab',
      'settings-auto-collapse',
      'settings-recent-locations',
      'settings-folder-sizes',
      'settings-git-integration',
      'settings-start-location',
      'settings-custom-path',
      'settings-column-preset',
      'settings-photo-folder-mode',
      'settings-photo-folder-threshold',
      'settings-photo-icon-size',
    ]);

    const handleSettingsChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target instanceof HTMLInputElement && target.dataset.shortcutInput) {
        saveShortcutSettingFromInput(target);
        return;
      }
      if (!target.closest('.settings-body')) return;
      if (target instanceof HTMLInputElement && target.dataset.settingsColumn) {
        const preset = document.getElementById('settings-column-preset') as HTMLSelectElement | null;
        if (preset) preset.value = 'custom';
        saveSettingsFromControls();
        return;
      }
      if (!persistedSettingsControlIds.has(target.id)) return;
      saveSettingsFromControls();
    };

    const handleSettingsInput = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.dataset.shortcutInput) {
        previewShortcutSettingInput(target);
        return;
      }
      if (!(target instanceof HTMLInputElement) || target.id !== 'settings-icon-size') return;
      if (!target.closest('.settings-body')) return;
      saveSettingsFromControls();
    };

    const handleSettingsClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('.settings-body button');
      if (!button || button.disabled) return;

      const shortcutResetId = button.dataset.shortcutReset;
      if (shortcutResetId) {
        resetShortcutSetting(shortcutResetId);
        return;
      }

      const columnMove = button.dataset.columnMove as ColumnId | undefined;
      if (columnMove) {
        moveSettingsColumn(columnMove, Number(button.dataset.columnDirection || 0));
        event.preventDefault();
        return;
      }

      let handled = true;
      switch (button.id) {
        case 'settings-shortcuts-reset-all':
          resetAllShortcutSettings();
          break;
        case 'settings-columns-reset':
          resetColumnSettings();
          break;
        case 'settings-custom-path-browse':
          void (async () => {
            try {
              const fallbackPath = appState.currentPath || appState.homePath || null;
              const selectedPath = await selectDirectory(fallbackPath);
              if (!selectedPath) return;
              const customPathInput = document.getElementById('settings-custom-path') as HTMLInputElement | null;
              const startLocationSelect = document.getElementById('settings-start-location') as HTMLSelectElement | null;
              if (customPathInput) customPathInput.value = selectedPath;
              if (startLocationSelect) startLocationSelect.value = 'custom';
              saveSettingsFromControls();
              showSuccess('Startup folder updated');
            } catch (error) {
              showError(error);
            }
          })();
          break;
        case 'rar-install-btn':
          void installRarFlow('rar-install-msg');
          break;
        case 'update-check-btn':
          void checkForUpdatesFlow();
          break;
        case 'update-install-btn':
          void installUpdateFlow();
          break;
        case 'btn-about':
          void showAboutFlow();
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
      }
    };

    const handleSettingsListClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest('.settings-body')) return;

      const removeButton = target.closest<HTMLButtonElement>('.bookmark-remove');
      if (removeButton) {
        const bookmarkRow = removeButton.closest<HTMLElement>('.bookmark-item');
        if (bookmarkRow?.dataset.id && removeBookmark(bookmarkRow.dataset.id)) {
          event.preventDefault();
          showSuccess('Bookmark removed');
        }
        return;
      }

      const row = target.closest<HTMLElement>('.bookmark-item, .recent-item');
      if (!row?.dataset.path) return;
      event.preventDefault();
      closeSettingsModal();
      void loadDirectory(row.dataset.path);
    };


    const handleStage5OverlayClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      // Quick Look, archive, advanced rename, keyboard help, and about are component-owned.
      // Progress cancel is owned by ProgressModal (progressUi).
    };

    const handleAdvancedRenameControlInput = () => {
      if (!isAdvancedRenameVisible()) return;
      updateAdvancedRenameOperationClasses();
      void refreshAdvancedRenamePreview();
    };

    const handleAdvancedRenameClose = () => {
      closeAdvancedRenameFlow();
    };

    const handleAdvancedRenameConfirm = () => {
      void applyAdvancedRenameFlow();
    };

    const handleQuickLookClose = () => {
      closeQuickLookFlow();
    };

    const handleQuickLookOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ isDir?: boolean; path?: PathString }>).detail || {};
      const path = detail.path || localState.currentQuickLookPath;
      if (!path) return;
      if (detail.isDir) {
        closeQuickLookFlow();
        void openEntryPath(path, true, appState.activePane === 'secondary' ? 'secondary' : 'primary');
        return;
      }
      openFile(path).catch(showError);
    };

    const handleModalPointerDown = (_event: MouseEvent) => {
      // Backdrop dismiss for the generic/settings modal is owned by GenericModal.
    };

    const closePathBarEditor = () => {
      const input = document.querySelector<HTMLInputElement>('.pane-path-bar.editing .path-input');
      if (!input) return false;
      input.blur();
      return true;
    };

    const focusPathBar = () => {
      const pane = appState.activePane === 'secondary' && appState.dualPaneEnabled ? 'secondary' : 'primary';
      document.getElementById(`btn-${pane}-edit-path`)?.click();
    };

    const refreshActivePane = () => {
      if (appState.activePane === 'secondary') void refreshSecondaryPane();
      else void refreshCurrentDirectory();
    };

    const navigateParentDirectory = () => {
      const activePane = appState.activePane as PaneId;
      const parent = getParentPath(pathForPane(activePane));
      if (!parent) return;
      if (activePane === 'secondary') void loadSecondaryDirectory(parent);
      else void loadDirectory(parent);
    };

    const navigateActiveHistory = (delta: number) => {
      if (appState.activePane === 'secondary') void navigateSecondaryHistory(delta);
      else void navigateHistory(delta);
    };

    const closeActiveTab = () => {
      const activePane = appState.activePane as PaneId;
      const activeTabId = activeTabIdForPane(activePane);
      if (activeTabId) void closeTab(activeTabId, activePane);
    };

    const switchActiveTabBy = (delta: number) => {
      const activePane = appState.activePane as PaneId;
      const tabs = tabsForPane(activePane);
      if (tabs.length === 0) return;
      const activeIndex = Math.max(0, tabs.findIndex((tab: { id: string }) => tab.id === activeTabIdForPane(activePane)));
      const nextTab = tabs[(activeIndex + delta + tabs.length) % tabs.length];
      if (nextTab?.id) void switchToTab(nextTab.id, activePane);
    };

    const clearQuickFilter = () => {
      const filterBar = document.getElementById('quick-filter-bar') as HTMLElement | null;
      const filterInput = document.getElementById('filter-input') as HTMLInputElement | null;
      const hasVisibleFilter = Boolean(filterBar && filterBar.style.display !== 'none');
      if (!appState.filterQuery && !hasVisibleFilter) return false;

      appState.filterQuery = '';
      if (filterInput) filterInput.value = '';
      if (filterBar) filterBar.style.display = 'none';
      applyEntryFilters();
      return true;
    };

    const closeVisibleOverlay = () => {
      if (isQuickLookVisible()) {
        closeQuickLookFlow();
        return true;
      }
      if (isDuplicateCheckerVisible()) {
        closeDuplicateCheckerUi();
        return true;
      }
      if (isArchiveViewerVisible()) {
        closeArchiveFlow();
        return true;
      }
      if (isCreateArchiveVisible()) {
        closeCreateArchiveUi();
        return true;
      }
      if (isAdvancedRenameVisible()) {
        closeAdvancedRenameFlow();
        return true;
      }
      if (isKeyboardHelpVisible()) {
        closeKeyboardHelpFlow();
        return true;
      }
      if (isAboutVisible()) {
        closeAboutUi();
        return true;
      }
      if (isProgressDialogVisible()) {
        // Match prior Escape behavior: dismiss UI without backend cancel.
        dismissProgressUi();
        return true;
      }

      return false;
    };

    const handleEscapeShortcut = () => {
      if (closeVisibleOverlay()) return;

      if (isGenericModalVisible()) {
        // Escape always dismisses the component-owned modal surface.
        if (isSettingsModalOpen()) {
          closeSettingsModal();
        } else {
          cancelModalUi();
        }
        return;
      }

      hideContextMenu();
      if (appState.commandPaletteVisible) {
        appState.commandPaletteVisible = false;
        return;
      }
      if (appState.searchMode) {
        void clearSearch();
        return;
      }
      if (closePathBarEditor()) return;
      if (clearQuickFilter()) return;

      // Last step: clear the active-pane selection (matches help text).
      if (selectedSetForPane().size > 0 || appState.focusedIndex >= 0) {
        clearActiveSelection();
      }
    };

    const registerAppShortcuts = () => {
      const shortcutIds: string[] = [];
      const usedShortcutCombos = new Set<string>();
      const addShortcut = (
        id: string,
        defaultCombo: string,
        handler: (event: KeyboardEvent) => void | Promise<void>,
        options: ShortcutOptions = {},
      ) => {
        // Always register the true default first so Reset / settings labels stay correct.
        registerShortcut(id, defaultCombo, handler, options);
        shortcutIds.push(id);

        const override = appState.settings?.shortcutOverrides?.[id];
        let liveCombo = defaultCombo;
        try {
          if (override) {
            const normalizedOverride = normalizeShortcutCombo(override);
            if (options.when || !usedShortcutCombos.has(normalizedOverride)) {
              updateShortcutCombo(id, normalizedOverride);
              liveCombo = normalizedOverride;
            }
          } else {
            liveCombo = normalizeShortcutCombo(defaultCombo);
          }
        } catch {
          liveCombo = normalizeShortcutCombo(defaultCombo);
        }

        if (!options.when) {
          usedShortcutCombos.add(normalizeShortcutCombo(liveCombo));
        }
      };

      addShortcut('path.submit', 'Enter', (event) => {
        const target = event.target as HTMLInputElement | null;
        const value = target?.value.trim();
        closePathBarEditor();
        const pane: PaneId = target?.id === 'secondary-path-input' ? 'secondary' : 'primary';
        if (value) void loadDirectoryForPane(value, pane);
      }, {
        allowInEditable: true,
        when: (event) => event.target instanceof HTMLInputElement
          && (event.target.id === 'primary-path-input' || event.target.id === 'secondary-path-input'),
      });
      addShortcut('path.focus', 'Ctrl+L', focusPathBar, { allowInControls: true, allowInEditable: true });
      addShortcut('path.focus.alt', 'Alt+D', focusPathBar, { allowInControls: true, allowInEditable: true });
      addShortcut('nav.parent', 'Alt+Up', navigateParentDirectory);
      addShortcut('nav.parent.backspace', 'Backspace', navigateParentDirectory);
      addShortcut('nav.back', 'Alt+Left', () => navigateActiveHistory(-1));
      addShortcut('nav.forward', 'Alt+Right', () => navigateActiveHistory(1));
      addShortcut('directory.refresh', 'F5', refreshActivePane);

      addShortcut('selection.up', 'Up', () => moveActiveListFocus('up'));
      addShortcut('selection.down', 'Down', () => moveActiveListFocus('down'));
      addShortcut('selection.left', 'Left', () => moveActiveListFocus('left'));
      addShortcut('selection.right', 'Right', () => moveActiveListFocus('right'));
      addShortcut('selection.up.extend', 'Shift+Up', () => moveActiveListFocus('up', true));
      addShortcut('selection.down.extend', 'Shift+Down', () => moveActiveListFocus('down', true));
      addShortcut('selection.left.extend', 'Shift+Left', () => moveActiveListFocus('left', true));
      addShortcut('selection.right.extend', 'Shift+Right', () => moveActiveListFocus('right', true));
      addShortcut('selection.first', 'Home', () => focusActiveListEdge('first'));
      addShortcut('selection.last', 'End', () => focusActiveListEdge('last'));
      addShortcut('selection.first.extend', 'Shift+Home', () => focusActiveListEdge('first', true));
      addShortcut('selection.last.extend', 'Shift+End', () => focusActiveListEdge('last', true));

      addShortcut('file.open', 'Enter', () => void openSelected());
      addShortcut('file.rename', 'F2', () => void renameSelectedFlow());
      addShortcut('file.delete.trash', 'Delete', () => void deleteSelectedFlow({ mode: 'trash' }));
      addShortcut('file.delete.permanent', 'Shift+Delete', () => void deleteSelectedFlow({ mode: 'permanent' }));
      addShortcut('file.copy', 'Ctrl+C', () => copySelection('copy'));
      addShortcut('file.cut', 'Ctrl+X', () => copySelection('cut'));
      addShortcut('file.paste', 'Ctrl+V', () => void pasteClipboard());
      addShortcut('file.copyPath', 'Ctrl+Shift+C', () => void copySelectedPathsToSystemClipboard());
      addShortcut('selection.all', 'Ctrl+A', selectAllEntries);
      addShortcut('file.newFile', 'Ctrl+N', () => void createFileFlow());
      addShortcut('file.newFolder', 'Ctrl+Shift+N', () => void createFolderFlow());

      addShortcut('tabs.new', 'Ctrl+T', () => void openNewTab(undefined, appState.activePane as PaneId));
      addShortcut('tabs.close', 'Ctrl+W', closeActiveTab);
      addShortcut('tabs.next', 'Ctrl+Tab', () => switchActiveTabBy(1));
      addShortcut('tabs.previous', 'Ctrl+Shift+Tab', () => switchActiveTabBy(-1));

      addShortcut('quickLook.toggle', 'Space', () => void showQuickLookFlow());
      addShortcut('search.focus', 'Ctrl+F', handleSearchFocus, { allowInControls: true, allowInEditable: true });
      addShortcut('help.keyboard', 'F1', showKeyboardHelpFlow, { allowInControls: true, allowInEditable: true });
      addShortcut('help.keyboard.ctrl', 'Ctrl+?', showKeyboardHelpFlow, { allowInControls: true, allowInEditable: true });
      // Keep legacy id for settings/help tables; behavior is the layered escape stack above.
      addShortcut('escape', 'Escape', handleEscapeShortcut, { allowInControls: true, allowInEditable: true });

      addShortcut('commandPalette.open', 'Ctrl+Shift+P', () => {
        appState.commandPaletteVisible = true;
      }, { allowInControls: true, allowInEditable: true });
      addShortcut('history.undo', 'Ctrl+Z', () => void undoLastFlow());
      addShortcut('history.redo', 'Ctrl+Y', () => void redoLastFlow());
      addShortcut('history.redo.shift', 'Ctrl+Shift+Z', () => void redoLastFlow());
      addShortcut('clipboard.history', 'Ctrl+Shift+V', () => void showClipboardHistoryFlow());
      addShortcut('terminal.open', 'F4', () => {
        openTerminal(pathForPane()).catch(showError);
      });
      addShortcut('pane.toggleDual', 'F6', toggleDualPane);
      addShortcut('pane.switch', 'Tab', () => {
        if (!appState.dualPaneEnabled) return;
        switchActivePane();
      }, {
        when: () => Boolean(appState.dualPaneEnabled),
      });
      addShortcut('pane.focusPrimary', 'Alt+1', () => activatePane('primary'));
      addShortcut('pane.focusSecondary', 'Alt+2', () => {
        if (!appState.dualPaneEnabled) {
          toggleDualPane();
        }
        activatePane('secondary');
      });
      addShortcut('pane.focusLeft', 'Ctrl+Shift+Left', () => activatePane('primary'));
      addShortcut('pane.focusRight', 'Ctrl+Shift+Right', () => {
        if (!appState.dualPaneEnabled) {
          toggleDualPane();
        }
        activatePane('secondary');
      });
      addShortcut('pane.copyToOther', 'Ctrl+Alt+C', () => {
        void copyOrMoveToOtherPane('copy');
      });
      addShortcut('pane.moveToOther', 'Ctrl+Alt+M', () => {
        void copyOrMoveToOtherPane('move');
      });

      return () => {
        for (const id of shortcutIds) {
          unregisterShortcut(id);
        }
      };
    };

    const cleanupShortcuts = registerAppShortcuts();

    const handleTypeAheadKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      if (event.key.length !== 1 || event.key === ' ') {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      // Avoid type-ahead while modal/overlay surfaces own the keyboard.
      if (
        isProgressDialogVisible()
        || isQuickLookVisible()
        || isAdvancedRenameVisible()
        || isKeyboardHelpVisible()
        || isAboutVisible()
        || isGenericModalVisible()
        || appState.commandPaletteVisible
      ) {
        return;
      }

      event.preventDefault();
      handleActiveTypeAhead(event.key);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      handleKeyDown(event);
      handleTypeAheadKey(event);
    };

    const handlePageHideFlush = () => {
      flushWorkspaceLayoutSave();
    };

    const handleOperationProgress = (event: { payload: ProgressUpdate }) => {
      const update = event.payload;
      if (!update?.operation_id) return;

      // Backend cancel returns Ok(partial results) with status "cancelled".
      // Persist the id so transfer finalization cannot race into "completed".
      if (update.status === 'cancelled') {
        localState.lastCancelledOperationId = update.operation_id;
      }

      if (progressUi.operationId !== update.operation_id) return;

      const currentBytes = Number(update.current) || 0;
      const totalBytes = Number(update.total) || 0;
      const percent = totalBytes > 0 ? (currentBytes / totalBytes) * 100 : progressUi.percent;
      const item = update.current_item || progressUi.item;

      if (update.status === 'cancelled') {
        progressUi.phase = 'cancelling';
        progressUi.statusMessage = update.error || 'Cancelling…';
        updateProgressFlow(percent, item || 'Cancelled', {
          currentBytes,
          totalBytes: totalBytes > 0 ? totalBytes : progressUi.totalBytes,
        });
        return;
      }

      if (update.status === 'error') {
        progressUi.statusMessage = update.error || 'Transfer failed';
      } else if (progressUi.phase !== 'cancelling') {
        progressUi.statusMessage = totalBytes <= 0 && !item
          ? 'Preparing…'
          : '';
      }

      updateProgressFlow(percent, item, {
        currentBytes,
        totalBytes: totalBytes > 0 ? totalBytes : progressUi.totalBytes,
      });
    };

    const handleNativeDropHover = (event: { payload: NativeFileDropEventPayload }) => {
      const paths = pathsFromNativeDropPayload(event.payload);
      setExternalDropOverlayVisible(paths.length > 0, appState.currentPath);
    };

    const handleNativeDrop = (event: { payload: NativeFileDropEventPayload }) => {
      const paths = pathsFromNativeDropPayload(event.payload);
      setExternalDropOverlayVisible(false);
      if (paths.length > 0) {
        void transferEntriesWithSafety(paths, appState.currentPath, 'copy', {
          successMessage: `Copied ${paths.length} dropped item${paths.length === 1 ? '' : 's'}`,
        });
      }
    };

    const handleNativeDropLeave = () => {
      setExternalDropOverlayVisible(false);
    };

    const handleFileChange = (event: { payload: { path?: PathString } }) => {
      const path = event.payload?.path;
      if (path) scheduleFileChangeRefresh(path);
    };

    const handleDragStart = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      const item = target?.closest<HTMLElement>('.file-item[data-path]');
      const path = item?.dataset.path as PathString | undefined;
      if (!path) return;

      const selectedPaths = currentSelectionPaths();
      const paths = selectedPaths.includes(path) ? selectedPaths : [path];
      appState.draggedItems = paths;
      appState.isDragging = true;
      event.dataTransfer?.setData('text/plain', paths.join('\n'));
      event.dataTransfer?.setData('text/uri-list', paths.join('\n'));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';
    };

    const handleDragOver = (event: DragEvent) => {
      const hasInternalDrag = (appState.draggedItems?.length || 0) > 0;
      const hasNativeFiles = Array.from(event.dataTransfer?.types || []).includes('Files');
      if (!hasInternalDrag && !hasNativeFiles) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = event.ctrlKey ? 'copy' : 'move';
    };

    const handleDrop = (event: DragEvent) => {
      const paths = [...(appState.draggedItems || [])] as PathString[];
      if (paths.length === 0) return;
      event.preventDefault();
      const destination = dropDestinationFromTarget(event.target);
      const action: TransferAction = event.ctrlKey ? 'copy' : 'move';
      resetInternalDragState();
      void transferEntriesWithSafety(paths, destination, action);
    };

    const handleDragEnd = () => {
      resetInternalDragState();
    };

    const unlistenPromises = [
      onFileChange(handleFileChange),
      onOperationProgress(handleOperationProgress),
      onExternalFileDropHover(handleNativeDropHover),
      onExternalFileDrop(handleNativeDrop),
      onExternalFileDropLeave(handleNativeDropLeave),
    ];

    document.addEventListener('simplefile:file-list-item-open', handleOpenEntry);
    document.addEventListener('simplefile:file-list-item-click', handleItemSelection);
    document.addEventListener('simplefile:tree-node-open', handleOpenEntry);
    document.addEventListener('simplefile:tree-node-toggle', handleTreeToggle);
    document.addEventListener('simplefile:breadcrumb-navigate', handleOpenEntry);
    document.addEventListener('simplefile:file-list-sort', handleSort);
    document.addEventListener('simplefile:toolbar-command', handleToolbarCommand);
    document.addEventListener('simplefile:pane-command', handlePaneCommand);
    document.addEventListener('simplefile:activate-pane', handleActivatePane);
    document.addEventListener('simplefile:refresh-drives', handleRefreshDrives);
    document.addEventListener('simplefile:toolbar-icon-size', handleIconSize);
    document.addEventListener('simplefile:toast', handleToast);
    document.addEventListener('simplefile:open-settings', handleSettingsOpen);
    document.addEventListener('simplefile:search-submit', handleSearchSubmit);
    document.addEventListener('simplefile:search-clear', handleSearchClear);
    document.addEventListener('simplefile:search-results-clear', handleSearchClear);
    document.addEventListener('simplefile:search-cancel', handleSearchCancel);
    document.addEventListener('simplefile:search-open-advanced', handleSearchAdvanced);
    document.addEventListener('simplefile:search-results-save', handleSearchResultsSave);
    document.addEventListener('simplefile:focus-search', handleSearchFocus);
    document.addEventListener('simplefile:smart-folder-open', handleSmartFolderOpen);
    document.addEventListener('simplefile:smart-folder-delete', handleSmartFolderDelete);
    document.addEventListener('simplefile:smart-folders-changed', handleSmartFoldersChanged);
    document.addEventListener('simplefile:tab-new', handleTabNew);
    document.addEventListener('simplefile:tab-switch', handleTabSwitch);
    document.addEventListener('simplefile:tab-close', handleTabClose);
    document.addEventListener('simplefile:tab-focus-move', handleTabFocusMove);
    document.addEventListener('simplefile:properties', handleProperties);
    document.addEventListener('simplefile:quick-look', handleQuickLook);
    document.addEventListener('simplefile:preview-close', handlePreviewClose);
    document.addEventListener('simplefile:create-archive', handleCreateArchive);
    document.addEventListener('simplefile:archive-extract', handleArchiveExtract);
    document.addEventListener('simplefile:create-archive-confirm', handleCreateArchiveConfirm);
    document.addEventListener('simplefile:advanced-rename', handleAdvancedRename);
    document.addEventListener('simplefile:advanced-rename-close', handleAdvancedRenameClose);
    document.addEventListener('simplefile:advanced-rename-confirm', handleAdvancedRenameConfirm);
    document.addEventListener('simplefile:advanced-rename-input', handleAdvancedRenameControlInput);
    document.addEventListener('simplefile:quick-look-close', handleQuickLookClose);
    document.addEventListener('simplefile:quick-look-open', handleQuickLookOpen);
    document.addEventListener('simplefile:keyboard-help', handleKeyboardHelp);
    document.addEventListener('simplefile:operation-history', handleOperationHistory);
    document.addEventListener('simplefile:set-color-label', handleSetColorLabel);
    document.addEventListener('simplefile:folder-metrics', handleFolderMetrics);
    document.addEventListener('simplefile:disk-cleanup', handleDiskCleanup);
    document.addEventListener('simplefile:duplicate-checker', handleDuplicateChecker);
    document.addEventListener('simplefile:duplicate-checker-close', handleDuplicateCheckerClose);
    document.addEventListener('simplefile:duplicate-checker-delete', handleDuplicateCheckerDelete);
    document.addEventListener('simplefile:duplicate-checker-open', handleDuplicateCheckerOpen);
    document.addEventListener('simplefile:duplicate-checker-preview', handleDuplicateCheckerPreview);
    document.addEventListener('simplefile:duplicate-checker-reveal', handleDuplicateCheckerReveal);
    document.addEventListener('contextmenu', handleFileListContextMenu);
    document.addEventListener('click', handleContextMenuClick);
    document.addEventListener('click', handleSettingsClick);
    document.addEventListener('click', handleSettingsListClick);

    document.addEventListener('click', handleStage5OverlayClick);
    document.addEventListener('change', handleSettingsChange);
    document.addEventListener('change', handleAdvancedRenameControlInput);
    document.addEventListener('input', handleSettingsInput);
    document.addEventListener('input', handleAdvancedRenameControlInput);
    document.addEventListener('mousedown', handleDocumentPointerDown);
    document.addEventListener('mousedown', handleModalPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    window.addEventListener('pagehide', handlePageHideFlush);
    window.addEventListener('beforeunload', handlePageHideFlush);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);

    return () => {
      if (localState.fileChangeRefreshTimer !== null) {
        window.clearTimeout(localState.fileChangeRefreshTimer);
        localState.fileChangeRefreshTimer = null;
      }
      flushWorkspaceLayoutSave();
      unsubscribeWorkspaceLayout();
      unwatchDirectory().catch(() => {});
      Promise.all(unlistenPromises).then((unlisteners) => {
        for (const unlisten of unlisteners) void unlisten();
      }).catch(() => {});
      document.removeEventListener('simplefile:file-list-item-open', handleOpenEntry);
      document.removeEventListener('simplefile:file-list-item-click', handleItemSelection);
      document.removeEventListener('simplefile:tree-node-open', handleOpenEntry);
      document.removeEventListener('simplefile:tree-node-toggle', handleTreeToggle);
      document.removeEventListener('simplefile:breadcrumb-navigate', handleOpenEntry);
      document.removeEventListener('simplefile:file-list-sort', handleSort);
      document.removeEventListener('simplefile:toolbar-command', handleToolbarCommand);
      document.removeEventListener('simplefile:pane-command', handlePaneCommand);
      document.removeEventListener('simplefile:activate-pane', handleActivatePane);
      document.removeEventListener('simplefile:refresh-drives', handleRefreshDrives);
      document.removeEventListener('simplefile:toolbar-icon-size', handleIconSize);
      document.removeEventListener('simplefile:toast', handleToast);
      document.removeEventListener('simplefile:open-settings', handleSettingsOpen);
      document.removeEventListener('simplefile:search-submit', handleSearchSubmit);
      document.removeEventListener('simplefile:search-clear', handleSearchClear);
      document.removeEventListener('simplefile:search-results-clear', handleSearchClear);
      document.removeEventListener('simplefile:search-cancel', handleSearchCancel);
      document.removeEventListener('simplefile:search-open-advanced', handleSearchAdvanced);
      document.removeEventListener('simplefile:search-results-save', handleSearchResultsSave);
      document.removeEventListener('simplefile:focus-search', handleSearchFocus);
      document.removeEventListener('simplefile:smart-folder-open', handleSmartFolderOpen);
      document.removeEventListener('simplefile:smart-folder-delete', handleSmartFolderDelete);
      document.removeEventListener('simplefile:smart-folders-changed', handleSmartFoldersChanged);
      document.removeEventListener('simplefile:tab-new', handleTabNew);
      document.removeEventListener('simplefile:tab-switch', handleTabSwitch);
      document.removeEventListener('simplefile:tab-close', handleTabClose);
      document.removeEventListener('simplefile:tab-focus-move', handleTabFocusMove);
      document.removeEventListener('simplefile:properties', handleProperties);
      document.removeEventListener('simplefile:quick-look', handleQuickLook);
      document.removeEventListener('simplefile:preview-close', handlePreviewClose);
      document.removeEventListener('simplefile:create-archive', handleCreateArchive);
      document.removeEventListener('simplefile:archive-extract', handleArchiveExtract);
      document.removeEventListener('simplefile:create-archive-confirm', handleCreateArchiveConfirm);
      document.removeEventListener('simplefile:advanced-rename', handleAdvancedRename);
      document.removeEventListener('simplefile:advanced-rename-close', handleAdvancedRenameClose);
      document.removeEventListener('simplefile:advanced-rename-confirm', handleAdvancedRenameConfirm);
      document.removeEventListener('simplefile:advanced-rename-input', handleAdvancedRenameControlInput);
      document.removeEventListener('simplefile:quick-look-close', handleQuickLookClose);
      document.removeEventListener('simplefile:quick-look-open', handleQuickLookOpen);
      document.removeEventListener('simplefile:keyboard-help', handleKeyboardHelp);
      document.removeEventListener('simplefile:operation-history', handleOperationHistory);
      document.removeEventListener('simplefile:set-color-label', handleSetColorLabel);
      document.removeEventListener('simplefile:folder-metrics', handleFolderMetrics);
      document.removeEventListener('simplefile:disk-cleanup', handleDiskCleanup);
      document.removeEventListener('simplefile:duplicate-checker', handleDuplicateChecker);
      document.removeEventListener('simplefile:duplicate-checker-close', handleDuplicateCheckerClose);
      document.removeEventListener('simplefile:duplicate-checker-delete', handleDuplicateCheckerDelete);
      document.removeEventListener('simplefile:duplicate-checker-open', handleDuplicateCheckerOpen);
      document.removeEventListener('simplefile:duplicate-checker-preview', handleDuplicateCheckerPreview);
      document.removeEventListener('simplefile:duplicate-checker-reveal', handleDuplicateCheckerReveal);
      document.removeEventListener('contextmenu', handleFileListContextMenu);
      document.removeEventListener('click', handleContextMenuClick);
      document.removeEventListener('click', handleSettingsClick);
      document.removeEventListener('click', handleSettingsListClick);

      document.removeEventListener('click', handleStage5OverlayClick);
      document.removeEventListener('change', handleSettingsChange);
      document.removeEventListener('change', handleAdvancedRenameControlInput);
      document.removeEventListener('input', handleSettingsInput);
      document.removeEventListener('input', handleAdvancedRenameControlInput);
      document.removeEventListener('mousedown', handleDocumentPointerDown);
      document.removeEventListener('mousedown', handleModalPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
      window.removeEventListener('pagehide', handlePageHideFlush);
      window.removeEventListener('beforeunload', handlePageHideFlush);
      cleanupShortcuts();
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragend', handleDragEnd);
    };

}
