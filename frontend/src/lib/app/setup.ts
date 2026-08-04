
import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, loadWorkspaceLayout, removeBookmark, saveSettings, saveTabs, saveWorkspaceLayout, state as appState, subscribe } from '../../vanilla-js/runtime/state.svelte';
import { resolveStartupLocation } from '../../vanilla-js/runtime/startup-location';
  import {
    batchRename,
    calculateFolderSize,
    cancelOperation,
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
    listDrives,
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
  import { clearSettingsBody, renderSettingsBody } from '../components/settings-body';
  import { showError, showSuccess } from '../components/toasts';
  import { renderLayoutShell } from '../components/layout-shell';
  import type {
    ArchiveFormat,
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
import { showCreateArchiveFlow, closeArchiveFlow, extractArchiveFlow } from "./archive.js";
import { applyPersistedViewSettings, updateStatusBar, loadTagsFlow, loadDirectory, openEntryPath, filteredEntriesForPane, selectedSetForPane, selectSecondaryPaths, selectPaths, updatePreviewPane, navigateHistory, refreshCurrentDirectory, createFolderFlow, createFileFlow, renameSelectedFlow, copySelection, pasteClipboard, deleteSelectedFlow, undoLastFlow, redoLastFlow, showClipboardHistoryFlow, showOperationHistoryFlow, showSetColorLabelFlow, showFolderMetricsFlow, showDiskCleanupFlow, closePreviewPaneFlow, applyTheme, loadSecondaryDirectory, pathForPane, navigateSpecial, navigateSecondaryHistory, loadTreeChildren, applyEntryFilters, applySecondaryEntryFilters, openNewTab, switchToTab, closeTab, moveTabFocus, showQuickLookFlow, showKeyboardHelpFlow, showContextMenuAt, handleContextMenuCommand, hideContextMenu, closeSettingsModal, syncSettingsControls, updateToolStatus, saveSettingsFromControls, installRarFlow, checkForUpdatesFlow, installUpdateFlow, showAboutFlow, overlayById, closeQuickLookFlow, closeKeyboardHelpFlow, hideProgressFlow, selectAllEntries, clearActiveSelection, moveActiveListFocus, focusActiveListEdge, handleActiveTypeAhead, refreshSecondaryPane, openSelected, copySelectedPathsToSystemClipboard, updateProgressFlow, pathsFromNativeDropPayload, setExternalDropOverlayVisible, transferEntriesWithSafety, scheduleFileChangeRefresh, currentSelectionPaths, dropDestinationFromTarget, resetInternalDragState, previewShortcutSettingInput, resetAllShortcutSettings, resetShortcutSetting, saveShortcutSettingFromInput } from "./core.js";
import { loadSmartFoldersFlow, runSearch, clearSearch, setSearchControlsVisible, openAdvancedSearchFlow, saveCurrentSearchAsSmartFolderFlow, openSmartFolderFlow, deleteSmartFolderFlow, showPropertiesFlow } from "./search.js";


export function initApp() {
    loadSettings();
    loadBookmarks();
    loadRecentLocations();
    const tabsLoaded = loadTabs();
    const workspaceLayoutLoaded = loadWorkspaceLayout();
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
      'secondaryHistory',
      'secondaryHistoryIndex',
      'secondaryPath',
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

    listDrives().then((drives) => {
      if (drives.length > 0) {
        appState.drives = drives;
        return;
      }

      const fallbackDrive = createFallbackDriveForPath(appState.homePath || appState.currentPath);
      if (fallbackDrive) {
        appState.drives = [fallbackDrive];
      }
    }).catch((error) => {
      console.error('Failed to load drives:', error);
      const fallbackDrive = createFallbackDriveForPath(appState.homePath || appState.currentPath);
      if (fallbackDrive) {
        appState.drives = [fallbackDrive];
      }
    });

    const handleOpenEntry = (e: any) => {
      const path = e.detail?.path || e.detail?.segment?.path;
      if (!path) return;

      // Tree-node and breadcrumb events are always directories; infer isDir
      // from the event type if the detail doesn't already include it.
      const alwaysDir = e.type === 'simplefile:tree-node-open' || e.type === 'simplefile:breadcrumb-navigate';
      const isDir = e.detail?.isDir ?? alwaysDir;

      void openEntryPath(path, isDir, e.detail?.pane || 'primary');
    };

    const handleItemSelection = (e: any) => {
      const { ctrlKey, index, metaKey, pane = 'primary', path, shiftKey } = e.detail;
      if (!path) return;
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

    const handleToolbarCommand = (e: any) => {
      const command = e.detail.command;
      if (command === 'back') void navigateHistory(-1);
      else if (command === 'forward') void navigateHistory(1);
      else if (command === 'up') {
        const parent = getParentPath(appState.currentPath);
        if (parent) void loadDirectory(parent);
      } else if (command === 'refresh') {
        void refreshCurrentDirectory();
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
        openTerminal(pathForPane()).catch(showError);
      } else if (command.startsWith?.('navigate')) {
        void navigateSpecial(command);
      }
    };

    const handleSecondaryPaneCommand = (e: any) => {
      const command = e.detail?.command;
      if (command === 'back') {
        void navigateSecondaryHistory(-1);
      } else if (command === 'forward') {
        void navigateSecondaryHistory(1);
      } else if (command === 'up') {
        const parent = getParentPath(appState.secondaryPath);
        if (parent) void loadSecondaryDirectory(parent);
      } else if (command === 'navigate' && e.detail?.path) {
        void loadSecondaryDirectory(e.detail.path);
      }
    };

    const handleTreeToggle = async (e: any) => {
      const path = e.detail?.path;
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

    const handleSort = (e: any) => {
      const sortBy = e.detail?.sort;
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

    const handleIconSize = (e: any) => {
      const value = Math.max(48, Math.min(128, Number(e.detail?.value || appState.iconSize || 64)));
      appState.iconSize = value;
      appState.settings = { ...appState.settings, defaultIconSize: value };
      document.documentElement.style.setProperty('--icon-size', `${value}px`);
      if (e.detail?.commit) saveSettings();
    };

    const handleToast = (e: any) => {
      const { message, type } = e.detail || {};
      if (type === 'error') showError(message);
      else showSuccess(message);
    };

    const handleSearchSubmit = (e: any) => {
      void runSearch(e.detail?.query || '');
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

    const handleSearchResultsSave = (e: any) => {
      if (e.detail?.handled) return;
      void saveCurrentSearchAsSmartFolderFlow();
    };

    const toggleDualPane = () => {
      appState.dualPaneEnabled = !appState.dualPaneEnabled;
      if (appState.dualPaneEnabled && !appState.secondaryPath) {
        void loadSecondaryDirectory(appState.currentPath, 'replace-current', false);
      }
    };

    const handleSearchFocus = () => {
      const input = document.getElementById('search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    };

    const handleSmartFolderOpen = (e: any) => {
      void openSmartFolderFlow(e.detail?.folder);
    };

    const handleSmartFolderDelete = (e: any) => {
      void deleteSmartFolderFlow(e.detail?.id);
    };

    const handleSmartFoldersChanged = (e: any) => {
      if (Array.isArray(e.detail?.smartFolders)) {
        appState.smartFolders = e.detail.smartFolders;
      }
    };

    const handleTabNew = () => {
      void openNewTab();
    };

    const handleTabSwitch = (e: any) => {
      const tabId = e.detail?.tabId;
      if (tabId) void switchToTab(tabId);
    };

    const handleTabClose = (e: any) => {
      const tabId = e.detail?.tabId;
      if (tabId) void closeTab(tabId);
    };

    const handleTabFocusMove = (e: any) => {
      const tabId = e.detail?.tabId;
      const direction = Number(e.detail?.direction || 0);
      if (tabId && direction) moveTabFocus(tabId, direction);
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
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const cancelBtn = document.getElementById('modal-cancel');
        const confirmBtn = document.getElementById('modal-confirm');
        const closeBtn = document.getElementById('modal-close');

        if (!overlay || !body) {
          showError('Settings modal elements not found in DOM');
          console.error("Settings modal elements not found in DOM");
          return;
        }

        if (title) title.textContent = 'Settings';
        modal?.classList.add('settings-modal');
        body.classList.add('settings-body');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (confirmBtn) {
          confirmBtn.textContent = 'Close';
          confirmBtn.onclick = closeSettingsModal;
        }
        if (closeBtn) {
          closeBtn.onclick = closeSettingsModal;
        }

        renderSettingsBody(body);
        window.setTimeout(() => {
          syncSettingsControls();
          void updateToolStatus();
        }, 0);
        overlay.classList.add('visible');
      } catch (err: any) {
        showError(`Failed to open settings: ${err?.message || err}`);
        console.error("Failed to open settings:", err);
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
      'settings-col-size',
      'settings-col-items',
      'settings-col-date',
      'settings-col-type',
    ]);

    const handleSettingsChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target instanceof HTMLInputElement && target.dataset.shortcutInput) {
        saveShortcutSettingFromInput(target);
        return;
      }
      if (!target.closest('.settings-body') || !persistedSettingsControlIds.has(target.id)) return;
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

      let handled = true;
      switch (button.id) {
        case 'settings-shortcuts-reset-all':
          resetAllShortcutSettings();
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

      const quickLookOverlay = overlayById('quicklook-overlay');
      if (quickLookOverlay?.classList.contains('visible')) {
        if (target === quickLookOverlay || target.closest('#quicklook-close')) {
          event.preventDefault();
          closeQuickLookFlow();
          return;
        }
        if (target.closest('#quicklook-open')) {
          event.preventDefault();
          if (localState.currentQuickLookPath) openFile(localState.currentQuickLookPath).catch(showError);
          return;
        }
      }

      const archiveOverlay = overlayById('archive-overlay');
      if (archiveOverlay?.classList.contains('visible')) {
        if (target === archiveOverlay || target.closest('#archive-close, #archive-cancel')) {
          event.preventDefault();
          closeArchiveFlow();
          return;
        }
        if (target.closest('#archive-extract')) {
          event.preventDefault();
          void extractArchiveFlow(pathForPane());
          return;
        }
      }

      const advancedRenameOverlay = overlayById('advanced-rename-overlay');
      if (advancedRenameOverlay?.classList.contains('visible')) {
        if (target === advancedRenameOverlay || target.closest('#adv-rename-close, #adv-rename-cancel')) {
          event.preventDefault();
          closeAdvancedRenameFlow();
          return;
        }
        if (target.closest('#adv-rename-confirm')) {
          event.preventDefault();
          void applyAdvancedRenameFlow();
          return;
        }
      }

      const keyboardHelpOverlay = overlayById('keyboard-help-overlay');
      if (
        keyboardHelpOverlay?.classList.contains('visible')
        && (target === keyboardHelpOverlay || target.closest('#keyboard-help-close, #keyboard-help-ok'))
      ) {
        event.preventDefault();
        closeKeyboardHelpFlow();
        return;
      }

      if (target.closest('#progress-cancel')) {
        event.preventDefault();
        if (localState.currentProgressOperationId) {
          cancelOperation(localState.currentProgressOperationId).catch(showError);
        }
        if (localState.currentProgressCancel) {
          Promise.resolve(localState.currentProgressCancel()).catch(showError);
        }
        hideProgressFlow();
      }
    };

    const handleAdvancedRenameControlInput = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest('#advanced-rename-overlay')) return;
      updateAdvancedRenameOperationClasses();
      void refreshAdvancedRenamePreview();
    };

    const handleModalPointerDown = (event: MouseEvent) => {
      if (
        event.target === document.getElementById('modal-overlay')
        && document.getElementById('modal')?.classList.contains('settings-modal')
      ) {
        closeSettingsModal();
      }
    };

    const closePathBarEditor = () => {
      const pathBar = document.getElementById('path-bar');
      if (!pathBar?.classList.contains('editing')) return false;
      pathBar.classList.remove('editing');
      const autocomplete = document.getElementById('path-autocomplete') as HTMLElement | null;
      if (autocomplete) autocomplete.style.display = 'none';
      return true;
    };

    const focusPathBar = () => {
      const pathBar = document.getElementById('path-bar');
      const input = document.getElementById('path-input') as HTMLInputElement | null;
      if (!input) return;
      pathBar?.classList.add('editing');
      input.value = appState.currentPath || '';
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
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
      if (appState.activeTabId) void closeTab(appState.activeTabId);
    };

    const switchActiveTabBy = (delta: number) => {
      const tabs = appState.tabs || [];
      if (tabs.length === 0) return;
      const activeIndex = Math.max(0, tabs.findIndex((tab: { id: string }) => tab.id === appState.activeTabId));
      const nextTab = tabs[(activeIndex + delta + tabs.length) % tabs.length];
      if (nextTab?.id) void switchToTab(nextTab.id);
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
      if (overlayById('quicklook-overlay')?.classList.contains('visible')) {
        closeQuickLookFlow();
        return true;
      }
      if (overlayById('archive-overlay')?.classList.contains('visible')) {
        closeArchiveFlow();
        return true;
      }
      if (overlayById('advanced-rename-overlay')?.classList.contains('visible')) {
        closeAdvancedRenameFlow();
        return true;
      }
      if (overlayById('keyboard-help-overlay')?.classList.contains('visible')) {
        closeKeyboardHelpFlow();
        return true;
      }
      if (overlayById('progress-overlay')?.classList.contains('visible')) {
        hideProgressFlow();
        return true;
      }

      return false;
    };

    const handleEscapeShortcut = () => {
      if (closeVisibleOverlay()) return;

      const modalOverlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('modal');
      if (modalOverlay?.classList.contains('visible')) {
        if (modal?.classList.contains('settings-modal')) {
          closeSettingsModal();
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
        if (value) void loadDirectory(value);
      }, {
        allowInEditable: true,
        when: (event) => event.target instanceof HTMLInputElement && event.target.id === 'path-input',
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

      addShortcut('tabs.new', 'Ctrl+T', () => void openNewTab());
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
        overlayById('progress-overlay')?.classList.contains('visible')
        || overlayById('quicklook-overlay')?.classList.contains('visible')
        || overlayById('keyboard-help-overlay')?.classList.contains('visible')
        || document.getElementById('modal-overlay')?.classList.contains('visible')
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

      const percent = update.total > 0 ? (update.current / update.total) * 100 : 0;
      if (localState.currentProgressOperationId === update.operation_id) {
        updateProgressFlow(percent, update.current_item || '');
      }


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
    document.addEventListener('simplefile:secondary-pane-command', handleSecondaryPaneCommand);
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
    document.addEventListener('simplefile:advanced-rename', handleAdvancedRename);
    document.addEventListener('simplefile:keyboard-help', handleKeyboardHelp);
    document.addEventListener('simplefile:operation-history', handleOperationHistory);
    document.addEventListener('simplefile:set-color-label', handleSetColorLabel);
    document.addEventListener('simplefile:folder-metrics', handleFolderMetrics);
    document.addEventListener('simplefile:disk-cleanup', handleDiskCleanup);
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
      document.removeEventListener('simplefile:secondary-pane-command', handleSecondaryPaneCommand);
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
      document.removeEventListener('simplefile:advanced-rename', handleAdvancedRename);
      document.removeEventListener('simplefile:keyboard-help', handleKeyboardHelp);
      document.removeEventListener('simplefile:operation-history', handleOperationHistory);
      document.removeEventListener('simplefile:set-color-label', handleSetColorLabel);
      document.removeEventListener('simplefile:folder-metrics', handleFolderMetrics);
      document.removeEventListener('simplefile:disk-cleanup', handleDiskCleanup);
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
