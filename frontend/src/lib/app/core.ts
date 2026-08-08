
import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, removeBookmark, saveSettings, saveTabs, state as appState } from '../../vanilla-js/runtime/state.svelte';
import { resolveStartupLocation } from '../../vanilla-js/runtime/startup-location';
  import { getActiveFileSystem } from '../vfs';
import {
    applyPassiveFolderMetricsToState,
    cancelPassiveFolderMetricWork,
    clearThumbnailCache,
    resetPassiveMetricFailures,
} from '../fileListLazyData';
import {
    batchRename,
    calculateFolderSize,
    cancelFolderItemCount,
    cancelFolderSize,
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
    discardRarInstall,
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
    installRar,
    installUpdate,
    prepareRarInstall,
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
    isNetworkFsPath,
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

    import { renderStatusBar } from '../components/status-bar';
  import { showError, showSuccess } from '../components/toasts';
  import {
    closeSettingsModalUi,
    isModalVisible,
    isSettingsModalOpen,
    openConfirmDialog,
    openHtmlDialog,
    openPromptDialog,
    openSettingsModalUi,
  } from './modalUi.svelte';
  import {
    hideProgressUi,
    isProgressCancelling,
    isProgressVisible,
    progressUi,
    showProgressUi,
    updateProgressUi,
    type ProgressTransferDetails,
  } from './progressUi.svelte';
  import type {
    ArchiveFormat,
    ColumnId,
    ClipboardAction,
    CleanupResult,
    ConflictAction,
    DriveInfo,
    FileEntry,
    NativeFileDropEventPayload,
    OperationId,
    PathString,
    ProgressUpdate,
    RarInstallPlan,
    RenameRequest,
    SearchOptions,
    SmartFolder,
    TransferResult,
    ViewMode,
  } from '../types';
  import type { FileTab, OperationLogEntry, OperationLogRetry, OperationLogStatus } from '../appState';

  export type ColorLabelTag = import('../types').ColorLabelTag;

  export type UndoEntry = {
    undo: () => Promise<unknown>;
    redo?: () => Promise<unknown>;
    description: string;
  };

import { localState } from './localState.svelte';
import type { PaneId } from "../fileNavigation.js";
import { findShortcutConflict, getShortcutDefinitions, getShortcutMap, normalizeShortcutCombo, resetShortcutCombo, updateShortcutCombo } from "../keyboardShortcuts.js";
import type { TransferAction } from "../transferPathUtils.js";
import { setTransferClipboard } from "../transferClipboard.js";
import { showAdvancedRenameFlow } from "./advanced_rename.js";
import { isArchiveEntry, showArchiveContentsFlow, showCreateArchiveFlow, extractArchiveFlow, archiveExtractFolderNameForPath } from "./archive.js";
import { resetSearchStateForNavigation, showPropertiesFlow } from "./search.js";
import { closeAboutUi, openAboutUi, setAboutInfo } from './aboutUi.svelte';
import {
  closeKeyboardHelpUi,
  openKeyboardHelpUi,
} from './keyboardHelpUi.svelte';
import { closeQuickLookUi, openQuickLookUi } from './quickLookUi.svelte';

const defaultColorLabels = [
    { color: '#ef4444', name: 'Red' },
    { color: '#f97316', name: 'Orange' },
    { color: '#eab308', name: 'Yellow' },
    { color: '#22c55e', name: 'Green' },
    { color: '#3b82f6', name: 'Blue' },
    { color: '#a855f7', name: 'Purple' }
];

  type HistoryMode = 'push' | 'replace-current' | 'none';

  export function safeTagColor(value: unknown) {
    const color = String(value || '#64748b').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color) || /^[a-z]+$/i.test(color)) {
      return color;
    }
    return '#64748b';
  }

  export function normalizeTag(raw: unknown): ColorLabelTag | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const id = Number(record.id);
    if (!Number.isFinite(id)) return null;
    const name = String(record.name || record.label || 'Label').trim() || 'Label';
    return {
      color: safeTagColor(record.color),
      emoji: typeof record.emoji === 'string' && record.emoji ? record.emoji : '\u25cf',
      id,
      label: name,
      name,
    };
  }

  export function normalizeTags(rawTags: unknown[] = []) {
    return rawTags
      .map(normalizeTag)
      .filter((tag): tag is ColorLabelTag => Boolean(tag));
  }

  export function normalizeFileTagMap(rawTags: Record<string, unknown> = {}) {
    const next: Record<PathString, ColorLabelTag> = {};
    for (const [path, rawTag] of Object.entries(rawTags)) {
      const tag = normalizeTag(rawTag);
      if (tag) next[path] = tag;
    }
    return next;
  }

  export async function loadTagsFlow({ reportErrors = false } = {}) {
    try {
      const [tags, fileTags] = await Promise.all([
        getAllTags(),
        getAllFileTags(),
      ]);
      appState.tags = normalizeTags(tags);
      appState.fileTags = normalizeFileTagMap(fileTags);
    } catch (error) {
      if (reportErrors) showError(error);
      else console.warn('Failed to load file labels:', error);
    }
  }

  export async function ensureColorLabelsAvailable() {
    await loadTagsFlow();
    if (appState.tags?.length) {
      return appState.tags as ColorLabelTag[];
    }

    const created: ColorLabelTag[] = [];
    for (const label of defaultColorLabels) {
      const tag = normalizeTag(await createTag(label.name, label.color));
      if (tag) created.push(tag);
    }
    appState.tags = created;
    return created;
  }

  export function selectedFolderEntries() {
    return selectedFileEntries().filter((entry: FileEntry) => entry.is_dir);
  }

  export function itemCountLabel(count: number) {
    return `${count} item${count === 1 ? '' : 's'}`;
  }

  function cancelFolderMetricWork() {
    localState.folderMetricsToken += 1;
    cancelPassiveFolderMetricWork();
  }

  async function stopPreviousFolderMetricWork() {
    cancelPassiveFolderMetricWork();
    await Promise.all([
      cancelFolderSize().catch((error) => console.warn('Failed to cancel previous folder size work:', error)),
      cancelFolderItemCount().catch((error) => console.warn('Failed to cancel previous folder item count work:', error)),
    ]);
  }

  export function applyFolderMetrics(metrics: Map<PathString, { count: number; size: number }>) {
    const withMetrics = (entries: FileEntry[]) => entries.map((entry: FileEntry) => {
      const metric = metrics.get(entry.path);
      if (!metric) return entry;
      return {
        ...entry,
        itemCount: itemCountLabel(metric.count),
        itemCountValue: metric.count,
        size: metric.size,
      };
    });

    appState.entries = withMetrics(appState.entries);
    appState.secondaryEntries = withMetrics(appState.secondaryEntries || []);
    if (appState._savedEntries) {
      appState._savedEntries = withMetrics(appState._savedEntries);
    }
    applyEntryFilters();
    if (appState.dualPaneEnabled) applySecondaryEntryFilters();
  }

  /** Apply lazily-loaded visible-folder size/count results without a full metric dialog. */
  export function applyPassiveFolderMetrics(
    sizes: Map<PathString, number>,
    counts: Map<PathString, number>,
  ) {
    applyPassiveFolderMetricsToState(appState, sizes, counts, {
      primary: applyEntryFilters,
      secondary: applySecondaryEntryFilters,
    });
  }

  export async function showFolderMetricsFlow() {
    const folders = selectedFolderEntries();
    if (folders.length === 0) {
      showError('Select one or more folders to calculate size and item count.');
      return;
    }

    const metricsToken = ++localState.folderMetricsToken;
    const totalFolders = folders.length;
    let completedFolders = 0;
    let totalBytes = 0;
    let cancelled = false;

    try {
      await stopPreviousFolderMetricWork();
      if (metricsToken !== localState.folderMetricsToken) return;

      const metrics = new Map<PathString, { count: number; size: number }>();
      const nextFolderSizes = new Map(appState.folderSizes || new Map());

      showProgressFlow(
        'Calculating Folder Metrics',
        `Preparing ${totalFolders} folder${totalFolders === 1 ? '' : 's'}…`,
        2,
        null,
        {
          onCancel: () => {
            cancelled = true;
            cancelFolderMetricWork();
          },
          detailLine: `0 of ${totalFolders} folders`,
        },
      );

      for (let index = 0; index < folders.length; index += 1) {
        if (metricsToken !== localState.folderMetricsToken || cancelled || isProgressCancelling()) {
          cancelled = true;
          break;
        }

        const folder = folders[index];
        const ordinal = index + 1;
        updateProgressFlow(
          ((index) / Math.max(1, totalFolders)) * 100,
          folder.name,
          {
            detailLine: `Folder ${ordinal} of ${totalFolders} · scanning…`,
          },
        );

        const [size, count] = await Promise.all([
          calculateFolderSize(folder.path),
          countFolderItems(folder.path),
        ]);

        if (metricsToken !== localState.folderMetricsToken || cancelled || isProgressCancelling()) {
          cancelled = true;
          break;
        }

        const metric = { count: Number(count || 0), size: Number(size || 0) };
        metrics.set(folder.path, metric);
        nextFolderSizes.set(folder.path, metric.size);
        completedFolders += 1;
        totalBytes += metric.size;

        updateProgressFlow(
          (ordinal / Math.max(1, totalFolders)) * 100,
          folder.name,
          {
            detailLine: `${ordinal} of ${totalFolders} folders · ${formatFileSize(totalBytes, false) || '0 B'} total`,
          },
        );
      }

      if (metricsToken !== localState.folderMetricsToken) {
        hideProgressFlow();
        return;
      }

      if (cancelled || isProgressCancelling()) {
        if (completedFolders > 0) {
          appState.folderSizes = nextFolderSizes;
          applyFolderMetrics(metrics);
        }
        progressUi.statusMessage = 'Cancelled';
        updateProgressFlow(
          (completedFolders / Math.max(1, totalFolders)) * 100,
          completedFolders > 0 ? `Stopped after ${completedFolders} folder${completedFolders === 1 ? '' : 's'}` : 'Cancelled',
          {
            detailLine: completedFolders > 0
              ? `${completedFolders} of ${totalFolders} folders kept · ${formatFileSize(totalBytes, false) || '0 B'}`
              : 'No folders completed',
          },
        );
        window.setTimeout(() => {
          if (localState.folderMetricsToken === metricsToken) hideProgressFlow();
        }, 700);
        return;
      }

      appState.folderSizes = nextFolderSizes;
      applyFolderMetrics(metrics);
      updateProgressFlow(100, 'Complete', {
        detailLine: `${totalFolders} folder${totalFolders === 1 ? '' : 's'} · ${formatFileSize(totalBytes, false) || '0 B'} total`,
      });
      showSuccess(
        `Calculated ${totalFolders} folder${totalFolders === 1 ? '' : 's'} (${formatFileSize(totalBytes, false) || '0 B'})`,
      );
      window.setTimeout(hideProgressFlow, 280);
    } catch (error) {
      if (metricsToken === localState.folderMetricsToken) {
        hideProgressFlow();
        showError(error);
      }
    }
  }

  export function renderTagOptions(tags: ColorLabelTag[], currentTagId: number | null) {
    const tagOptions = tags.map((tag) => `
      <label class="tag-option">
        <input type="radio" name="stage9-color-label" value="${tag.id}" ${currentTagId === tag.id ? 'checked' : ''}>
        <span class="tag-swatch" style="background-color:${escapeHtml(tag.color)}"></span>
        <span>${escapeHtml(tag.name)}</span>
      </label>
    `).join('');

    return `
      <div class="tags-selector">
        ${tagOptions}
        <label class="tag-option">
          <input type="radio" name="stage9-color-label" value="none" ${currentTagId ? '' : 'checked'}>
          <span class="tag-swatch tag-swatch--empty"></span>
          <span>None</span>
        </label>
      </div>
    `;
  }

  export async function showSetColorLabelFlow() {
    const entries = selectedFileEntries();
    if (entries.length === 0) {
      showError('Select one or more items to label.');
      return;
    }

    try {
      const tags = await ensureColorLabelsAvailable();
      if (tags.length === 0) {
        showError('No color labels are available.');
        return;
      }

      const currentTag = entries.length === 1 ? appState.fileTags?.[entries[0].path] : null;
      const currentTagId = Number.isFinite(Number(currentTag?.id)) ? Number(currentTag?.id) : null;
      const result = await showHtmlDialog({
        bodyHtml: renderTagOptions(tags, currentTagId),
        confirmText: 'Apply',
        onConfirm: () => (
          document.querySelector<HTMLInputElement>('input[name="stage9-color-label"]:checked')?.value || 'none'
        ),
        title: 'Set Color Label',
      });
      if (result === false) return;

      const value = String(result || 'none');
      const selectedTag = value === 'none'
        ? null
        : tags.find((tag) => tag.id === Number(value)) || null;

      const nextFileTags = { ...(appState.fileTags || {}) };
      for (const entry of entries) {
        await setTagsForPath(entry.path, selectedTag ? [selectedTag.id] : []);
        if (selectedTag) nextFileTags[entry.path] = selectedTag;
        else delete nextFileTags[entry.path];
      }

      appState.fileTags = nextFileTags;
      applyEntryFilters();
      document.dispatchEvent(new CustomEvent('simplefile:tags-updated'));
      showSuccess(`Updated ${entries.length} label${entries.length === 1 ? '' : 's'}`);
    } catch (error) {
      showError(error);
    }
  }

  export function renderCleanupResults(result: CleanupResult, thresholdBytes: number) {
    const largeFiles = result.large_files || [];
    const duplicateGroups = result.duplicates || [];
    const largeLimit = 50;
    const duplicateLimit = 25;
    const largeRows = largeFiles.slice(0, largeLimit).map(([path, size]) => `
      <li class="cleanup-result-row">
        <span title="${escapeHtml(path)}">${escapeHtml(path)}</span>
        <strong>${escapeHtml(formatFileSize(size))}</strong>
      </li>
    `).join('');
    const duplicateRows = duplicateGroups.slice(0, duplicateLimit).map((group) => `
      <li class="cleanup-result-row cleanup-result-row--stacked">
        <strong>${escapeHtml(group.files.length)} duplicate files</strong>
        <span class="cleanup-hash">SHA-256 ${escapeHtml(group.hash.slice(0, 16))}...</span>
        <span class="cleanup-path-list">${group.files.map((path) => escapeHtml(path)).join('<br>')}</span>
      </li>
    `).join('');

    return `
      <div class="cleanup-results">
        <div class="cleanup-summary">
          <span>${largeFiles.length} large file${largeFiles.length === 1 ? '' : 's'} at or above ${escapeHtml(formatFileSize(thresholdBytes))}</span>
          <span>${duplicateGroups.length} duplicate group${duplicateGroups.length === 1 ? '' : 's'}</span>
        </div>
        <h4>Large Files</h4>
        ${largeRows
          ? `<ul class="cleanup-result-list">${largeRows}</ul>${largeFiles.length > largeLimit ? `<p class="settings-section-hint">Showing first ${largeLimit} files.</p>` : ''}`
          : '<p class="placeholder-msg">No large files matched the threshold.</p>'}
        <h4>Duplicates</h4>
        ${duplicateRows
          ? `<ul class="cleanup-result-list">${duplicateRows}</ul>${duplicateGroups.length > duplicateLimit ? `<p class="settings-section-hint">Showing first ${duplicateLimit} groups.</p>` : ''}`
          : '<p class="placeholder-msg">No duplicate files found.</p>'}
      </div>
    `;
  }

  export async function showDiskCleanupFlow() {
    const cleanupPath = pathForPane();
    if (!cleanupPath || appState.cleanupInProgress) return;

    const thresholdResult = await showHtmlDialog({
      bodyHtml: `
        <div class="form-group">
          <label class="form-label" for="cleanup-threshold-mb">Large file threshold (MB)</label>
          <input id="cleanup-threshold-mb" class="form-input input-full" type="number" min="0" step="1" value="100">
        </div>
        <p class="settings-section-hint">The scan reports candidates only. It does not delete or move files.</p>
      `,
      confirmText: 'Analyze',
      onConfirm: () => {
        const value = Number((document.getElementById('cleanup-threshold-mb') as HTMLInputElement | null)?.value || 100);
        if (!Number.isFinite(value) || value < 0) return 100 * 1024 * 1024;
        return Math.max(1, Math.round(value * 1024 * 1024));
      },
      title: 'Analyze Cleanup',
    });
    if (thresholdResult === false) return;

    const thresholdBytes = Number(thresholdResult || 100 * 1024 * 1024);
    appState.cleanupInProgress = true;
    try {
      const result = await runWithProgress(
        'Analyzing Cleanup',
        cleanupPath,
        () => diskCleanup(cleanupPath, thresholdBytes),
      );

      await showHtmlDialog({
        bodyHtml: renderCleanupResults(result, thresholdBytes),
        confirmText: 'Close',
        showCancel: false,
        title: 'Cleanup Results',
      });
    } catch (error) {
      showError(error);
    } finally {
      appState.cleanupInProgress = false;
    }
  }

  export function applyTheme() {
    document.documentElement.setAttribute('data-theme', appState.theme || 'dark');
  }

  export function applyPersistedViewSettings() {
    appState.theme = appState.settings?.theme || appState.theme || 'dark';
    appState.isGridView = appState.settings?.defaultView === 'grid';
    appState.iconSize = Number(appState.settings?.defaultIconSize || appState.iconSize || 64);
    appState.showHiddenFiles = Boolean(appState.settings?.showHidden);
    document.documentElement.style.setProperty('--icon-size', `${appState.iconSize}px`);
    applyTheme();
  }

  export function entriesForPane(pane: PaneId = appState.activePane as PaneId) {
    return pane === 'secondary' ? (appState.secondaryEntries || []) : appState.entries;
  }

  export function filteredEntriesForPane(pane: PaneId = appState.activePane as PaneId) {
    return pane === 'secondary' ? (appState.secondaryFilteredEntries || []) : appState.filteredEntries;
  }

  export function selectedSetForPane(pane: PaneId = appState.activePane as PaneId) {
    return pane === 'secondary' ? (appState.secondarySelectedEntries || new Set<PathString>()) : appState.selectedEntries;
  }

  export function pathForPane(pane: PaneId = appState.activePane as PaneId) {
    return pane === 'secondary' ? appState.secondaryPath : appState.currentPath;
  }

  export function selectedEntriesInView(pane: PaneId = appState.activePane as PaneId) {
    const selectedSet = selectedSetForPane(pane);
    return filteredEntriesForPane(pane).filter((entry: FileEntry) => selectedSet.has(entry.path));
  }

  export function selectedSizeText() {
    const total = selectedEntriesInView()
      .filter((entry: FileEntry) => !entry.is_dir)
      .reduce((sum: number, entry: FileEntry) => sum + Number(entry.size || 0), 0);

    return total > 0 ? formatFileSize(total) : null;
  }

  export function updateStatusBar() {
    const activePane = appState.activePane as PaneId;
    renderStatusBar(document.getElementById('status-bar'), {
      activePaneLabel: activePaneLabel(),
      currentPath: pathForPane(activePane) || appState.currentPath,
      selectedCount: selectedSetForPane(activePane).size,
      selectedSizeText: selectedSizeText(),
      totalItems: filteredEntriesForPane(activePane).length,
    });
  }

  export function applyEntryFilters() {
    appState.filteredEntries = visibleEntries(appState.entries, {
      filterQuery: appState.filterQuery,
      showHidden: appState.showHiddenFiles,
      sortAsc: appState.sortAsc,
      sortBy: appState.sortBy,
    });
    updateStatusBar();
  }

  export function applySecondaryEntryFilters() {
    appState.secondaryFilteredEntries = visibleEntries(appState.secondaryEntries || [], {
      filterQuery: '',
      showHidden: appState.showHiddenFiles,
      sortAsc: appState.sortAsc,
      sortBy: appState.sortBy,
    });
    updateStatusBar();
  }

  export function syncActiveTab() {
    if (!appState.currentPath) return;

    const activeTabId = appState.activeTabId || `tab-${Date.now()}`;
    const tab: FileTab = {
      id: activeTabId,
      path: appState.currentPath,
      title: basename(appState.currentPath),
      history: [...appState.history],
      historyIndex: appState.historyIndex,
    };

    const existingIndex = appState.tabs.findIndex((candidate: FileTab) => candidate.id === activeTabId);
    appState.tabs = existingIndex >= 0
      ? appState.tabs.map((candidate: FileTab) => candidate.id === activeTabId ? tab : candidate)
      : [...appState.tabs, tab];
    appState.activeTabId = activeTabId;
    saveTabs();
  }

  export function createTabState(path: PathString) {
    return {
      id: `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      path,
      title: basename(path),
      history: [path],
      historyIndex: 0,
    };
  }

  export async function openNewTab(path: PathString = appState.currentPath || appState.homePath) {
    if (!path) return;
    const tab = createTabState(path);
    appState.tabs = [...appState.tabs, tab];
    appState.activeTabId = tab.id;
    appState.history = [...tab.history];
    appState.historyIndex = tab.historyIndex;
    saveTabs();
    await loadDirectory(path, 'replace-current');
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-tab-id="${tab.id}"]`)?.focus();
    }, 0);
  }

  export async function switchToTab(tabId: string) {
    const tab = appState.tabs.find((candidate: { id: string }) => candidate.id === tabId);
    if (!tab) return;
    appState.activeTabId = tab.id;
    appState.history = [...(tab.history || [tab.path])];
    appState.historyIndex = typeof tab.historyIndex === 'number' ? tab.historyIndex : appState.history.length - 1;
    await loadDirectory(tab.path, 'none');
  }

  export async function closeTab(tabId: string) {
    const closingIndex = appState.tabs.findIndex((tab: { id: string }) => tab.id === tabId);
    if (closingIndex < 0) return;

    const remainingTabs = appState.tabs.filter((tab: { id: string }) => tab.id !== tabId);
    if (remainingTabs.length === 0) {
      appState.tabs = [];
      await openNewTab(appState.homePath || appState.currentPath);
      return;
    }

    appState.tabs = remainingTabs;
    if (appState.activeTabId !== tabId) {
      saveTabs();
      return;
    }

    const nextTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)];
    saveTabs();
    await switchToTab(nextTab.id);
  }

  export function moveTabFocus(tabId: string, direction: number) {
    const tabs = appState.tabs;
    const index = tabs.findIndex((tab: { id: string }) => tab.id === tabId);
    if (index < 0 || tabs.length === 0) return;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    document.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus();
  }

  export function recordHistory(path: PathString, mode: HistoryMode) {
    if (mode === 'none') return;

    if (mode === 'replace-current' && appState.historyIndex >= 0) {
      const nextHistory = [...appState.history];
      nextHistory[appState.historyIndex] = path;
      appState.history = nextHistory;
      return;
    }

    if (appState.history[appState.historyIndex] === path) {
      return;
    }

    appState.history = [...appState.history.slice(0, appState.historyIndex + 1), path];
    appState.historyIndex = appState.history.length - 1;
  }

  export function recordSecondaryHistory(path: PathString, mode: HistoryMode) {
    if (mode === 'none') return;

    if (mode === 'replace-current' && appState.secondaryHistoryIndex >= 0) {
      const nextHistory = [...appState.secondaryHistory];
      nextHistory[appState.secondaryHistoryIndex] = path;
      appState.secondaryHistory = nextHistory;
      return;
    }

    if (appState.secondaryHistory[appState.secondaryHistoryIndex] === path) {
      return;
    }

    appState.secondaryHistory = [
      ...appState.secondaryHistory.slice(0, appState.secondaryHistoryIndex + 1),
      path,
    ];
    appState.secondaryHistoryIndex = appState.secondaryHistory.length - 1;
  }

  export async function updatePreviewPane() {
    const token = ++localState.previewPaneToken;
    const contentTarget = document.getElementById('preview-content');
    const infoTarget = document.getElementById('preview-info');

    if (!appState.showPreviewPane) {
      contentTarget?.replaceChildren();
      infoTarget?.replaceChildren();
      appState.previewEntry = null;
      return;
    }

    const { renderPreviewPane } = await import('../components/preview-pane.js');
    if (token !== localState.previewPaneToken || !appState.showPreviewPane) return;

    const selected = selectedEntriesInView();
    if (selected.length !== 1) {
      appState.previewEntry = null;
      renderPreviewPane(contentTarget, infoTarget, { mode: 'empty' });
      return;
    }

    const entry = selected[0];
    appState.previewEntry = entry;
    if (entry.is_dir) {
      renderPreviewPane(contentTarget, infoTarget, { entry, mode: 'folder' });
      return;
    }

    renderPreviewPane(contentTarget, infoTarget, { entry, mode: 'loading' });
    try {
      const preview = await readFilePreview(entry.path);
      if (token !== localState.previewPaneToken || !appState.showPreviewPane || appState.previewEntry?.path !== entry.path) return;
      renderPreviewPane(contentTarget, infoTarget, { entry, mode: 'preview', preview });
    } catch (error) {
      if (token !== localState.previewPaneToken || !appState.showPreviewPane || appState.previewEntry?.path !== entry.path) return;
      renderPreviewPane(contentTarget, infoTarget, {
        entry,
        error: error instanceof Error ? error.message : String(error),
        mode: 'error',
      });
    }
  }

  export async function clearPreviewPaneContent() {
    localState.previewPaneToken += 1;
    appState.previewEntry = null;
    const { clearPreviewPane } = await import('../components/preview-pane.js');
    clearPreviewPane(
      document.getElementById('preview-content'),
      document.getElementById('preview-info'),
    );
  }

  export function closePreviewPaneFlow() {
    appState.showPreviewPane = false;
    void clearPreviewPaneContent();
  }

  export function selectPaths(paths: PathString[], focusedIndex = -1) {
    appState.selectedEntries = new Set(paths);
    appState.activePane = 'primary';
    appState.focusedIndex = focusedIndex;
    appState.lastSelectedIndex = focusedIndex;
    updateStatusBar();
    void updatePreviewPane();
  }

  export function selectSecondaryPaths(paths: PathString[], focusedIndex = -1) {
    appState.secondarySelectedEntries = new Set(paths);
    appState.activePane = 'secondary';
    appState.focusedIndex = focusedIndex;
    appState.lastSelectedIndex = focusedIndex;
    updateStatusBar();
  }

  /** Focus the file list for the active pane so keyboard nav lands correctly. */
  export function focusActiveFileList() {
    const listId = appState.activePane === 'secondary' ? 'secondary-file-list' : 'file-list';
    const list = document.getElementById(listId) as HTMLElement | null;
    list?.focus({ preventScroll: true });
  }

  export function activatePane(pane: PaneId) {
    if (!appState.dualPaneEnabled) {
      appState.activePane = 'primary';
      updateStatusBar();
      focusActiveFileList();
      return;
    }

    const next: PaneId = pane === 'secondary' ? 'secondary' : 'primary';
    if (appState.activePane === next) {
      focusActiveFileList();
      return;
    }

    appState.activePane = next;
    // Keep a sensible focus index if the target pane has items but no focus yet.
    const entries = filteredEntriesForPane(next);
    if (entries.length > 0 && (appState.focusedIndex < 0 || appState.focusedIndex >= entries.length)) {
      appState.focusedIndex = 0;
      appState.lastSelectedIndex = 0;
    }
    updateStatusBar();
    if (next === 'primary') void updatePreviewPane();
    focusActiveFileList();
  }

  export function switchActivePane() {
    if (!appState.dualPaneEnabled) return;
    activatePane(appState.activePane === 'primary' ? 'secondary' : 'primary');
  }

  export function activePaneLabel() {
    if (!appState.dualPaneEnabled) return null;
    return appState.activePane === 'secondary' ? 'Right pane' : 'Left pane';
  }

  export function selectAllEntries() {
    const activePane = appState.activePane as PaneId;
    const entries = filteredEntriesForPane(activePane);
    if (activePane === 'secondary') {
      selectSecondaryPaths(entries.map((entry: FileEntry) => entry.path), entries.length - 1);
    } else {
      selectPaths(entries.map((entry: FileEntry) => entry.path), entries.length - 1);
    }
  }

  export function clearActiveSelection() {
    const activePane = appState.activePane as PaneId;
    if (activePane === 'secondary') {
      appState.secondarySelectedEntries = new Set();
    } else {
      appState.selectedEntries = new Set();
    }
    appState.focusedIndex = -1;
    appState.lastSelectedIndex = -1;
    updateStatusBar();
    void updatePreviewPane();
  }

  function getActiveGridColumnCount() {
    if (!appState.isGridView) {
      return 1;
    }

    const listId = appState.activePane === 'secondary' ? 'secondary-file-list' : 'file-list';
    const list = document.getElementById(listId);
    if (!list) {
      return 1;
    }

    const styles = getComputedStyle(list);
    const itemWidth = Number.parseFloat(styles.getPropertyValue('--file-list-grid-item-width')) || 112;
    const gap = 12;
    return Math.max(1, Math.floor((list.clientWidth + gap) / (itemWidth + gap)));
  }

  function focusDeltaForDirection(direction: 'up' | 'down' | 'left' | 'right') {
    if (!appState.isGridView) {
      return direction === 'up' || direction === 'left' ? -1 : 1;
    }

    const columns = getActiveGridColumnCount();
    switch (direction) {
      case 'up':
        return -columns;
      case 'down':
        return columns;
      case 'left':
        return -1;
      case 'right':
        return 1;
      default:
        return 0;
    }
  }

  function applyPaneSelection(paths: PathString[], focusedIndex: number, pane: PaneId) {
    if (pane === 'secondary') {
      selectSecondaryPaths(paths, focusedIndex);
      return;
    }
    selectPaths(paths, focusedIndex);
  }

  export function selectRangeInActivePane(fromIndex: number, toIndex: number) {
    const pane = appState.activePane as PaneId;
    const entries = filteredEntriesForPane(pane);
    if (entries.length === 0) {
      return;
    }

    const start = Math.max(0, Math.min(fromIndex, toIndex));
    const end = Math.min(entries.length - 1, Math.max(fromIndex, toIndex));
    const paths = entries.slice(start, end + 1).map((entry: FileEntry) => entry.path);
    applyPaneSelection(paths, toIndex, pane);
    appState.lastSelectedIndex = fromIndex;
    appState.focusedIndex = toIndex;
  }

  export function moveActiveListFocus(
    direction: 'up' | 'down' | 'left' | 'right',
    extendSelection = false,
  ) {
    const pane = appState.activePane as PaneId;
    const entries = filteredEntriesForPane(pane);
    if (entries.length === 0) {
      return;
    }

    const currentIndex = appState.focusedIndex >= 0 ? appState.focusedIndex : 0;
    const nextIndex = Math.max(
      0,
      Math.min(entries.length - 1, currentIndex + focusDeltaForDirection(direction)),
    );

    if (extendSelection) {
      const anchor = appState.lastSelectedIndex >= 0 ? appState.lastSelectedIndex : currentIndex;
      selectRangeInActivePane(anchor, nextIndex);
      return;
    }

    const entry = entries[nextIndex];
    if (!entry) {
      return;
    }
    applyPaneSelection([entry.path], nextIndex, pane);
  }

  export function focusActiveListEdge(edge: 'first' | 'last', extendSelection = false) {
    const pane = appState.activePane as PaneId;
    const entries = filteredEntriesForPane(pane);
    if (entries.length === 0) {
      return;
    }

    const nextIndex = edge === 'first' ? 0 : entries.length - 1;
    if (extendSelection) {
      const anchor = appState.lastSelectedIndex >= 0 ? appState.lastSelectedIndex : Math.max(0, appState.focusedIndex);
      selectRangeInActivePane(anchor, nextIndex);
      return;
    }

    const entry = entries[nextIndex];
    if (!entry) {
      return;
    }
    applyPaneSelection([entry.path], nextIndex, pane);
  }

  export function handleActiveTypeAhead(char: string) {
    if (!char) {
      return;
    }

    appState.typeAheadBuffer = `${appState.typeAheadBuffer || ''}${char.toLowerCase()}`;
    window.clearTimeout(appState.typeAheadTimeout ?? undefined);
    appState.typeAheadTimeout = window.setTimeout(() => {
      appState.typeAheadBuffer = '';
      appState.typeAheadTimeout = null;
    }, 500);

    const pane = appState.activePane as PaneId;
    const entries = filteredEntriesForPane(pane);
    const matchIndex = entries.findIndex((entry: FileEntry) =>
      entry.name?.toLowerCase().startsWith(appState.typeAheadBuffer),
    );
    if (matchIndex < 0) {
      return;
    }

    const entry = entries[matchIndex];
    if (!entry) {
      return;
    }
    applyPaneSelection([entry.path], matchIndex, pane);
  }

  export function findEntry(path: PathString) {
    return appState.entries.find((entry: FileEntry) => entry.path === path)
      ?? appState.filteredEntries.find((entry: FileEntry) => entry.path === path)
      ?? null;
  }

  export function findSecondaryEntry(path: PathString) {
    return (appState.secondaryEntries || []).find((entry: FileEntry) => entry.path === path)
      ?? (appState.secondaryFilteredEntries || []).find((entry: FileEntry) => entry.path === path)
      ?? null;
  }

  export function currentSelectionPaths() {
    const source = appState.activePane === 'secondary' ? appState.secondarySelectedEntries : appState.selectedEntries;
    return [...(source || new Set<PathString>())] as PathString[];
  }

  export function closeSettingsModal() {
    closeSettingsModalUi();
  }

  export function openSettingsModal() {
    openSettingsModalUi();
  }

  export function resetGenericModal() {
    // Settings/dialogs are owned by modalUi; closing clears the surface.
    if (isSettingsModalOpen()) {
      closeSettingsModalUi();
    }
  }

  export function showDialog({
    confirmText = 'OK',
    defaultValue = '',
    label = '',
    message = '',
    title,
    type = 'confirm',
  }: {
    confirmText?: string;
    defaultValue?: string;
    label?: string;
    message?: string;
    title: string;
    type?: 'confirm' | 'prompt';
  }) {
    if (type === 'prompt') {
      return openPromptDialog({
        confirmText,
        defaultValue,
        label,
        message,
        title,
      });
    }

    return openConfirmDialog({
      confirmText,
      message,
      title,
    });
  }

  export function escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  export function showHtmlDialog({
    bodyHtml,
    confirmText = 'OK',
    onConfirm,
    showCancel = true,
    title,
  }: {
    bodyHtml: string;
    confirmText?: string;
    onConfirm?: () => unknown;
    showCancel?: boolean;
    title: string;
  }) {
    return openHtmlDialog({
      bodyHtml,
      confirmText,
      onConfirm,
      showCancel,
      title,
    });
  }

  export function isGenericModalVisible() {
    return isModalVisible();
  }

  const MAX_OPERATION_HISTORY = 50;
  const BULK_TRANSFER_PREFLIGHT_THRESHOLD = 10;

  type OperationLogConfig = {
    action: string;
    detail?: string;
    itemCount?: number;
    retry?: OperationLogRetry;
    target?: PathString;
    title: string;
  };

  type OperationProgressLogConfig = OperationLogConfig & {
    item: string;
    onCancel?: (() => unknown) | null;
  };

  function operationErrorMessage(error: unknown) {
    if (typeof error === 'string') return error;
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
      const value = (error as { message?: unknown }).message;
      if (typeof value === 'string' && value) return value;
    }
    return String(error ?? 'Operation failed');
  }

  function isCancellationError(error: unknown) {
    return /cancelled|canceled|operation cancelled/i.test(operationErrorMessage(error));
  }

  function updateOperationLogEntry(id: OperationId, patch: Partial<OperationLogEntry>, force = false) {
    appState.operationHistory = (appState.operationHistory || []).map((entry) => {
      if (entry.id !== id) return entry;
      if (!force && entry.status !== 'running') return entry;
      return { ...entry, ...patch };
    });
  }

  function operationLogEntry(id: OperationId) {
    return (appState.operationHistory || []).find((entry) => entry.id === id) || null;
  }

  export function startOperationLog({
    action,
    detail,
    itemCount = 0,
    retry,
    target,
    title,
  }: OperationLogConfig) {
    const id = uniqueId(`history-${action}`);
    const entry: OperationLogEntry = {
      id,
      action,
      detail,
      itemCount,
      retry,
      startedAt: Date.now(),
      status: 'running',
      target,
      title,
    };
    appState.operationHistory = [entry, ...(appState.operationHistory || [])].slice(0, MAX_OPERATION_HISTORY);
    return id;
  }

  export function completeOperationLog(id: OperationId, detail?: string) {
    updateOperationLogEntry(id, {
      detail: detail || operationLogEntry(id)?.detail,
      finishedAt: Date.now(),
      status: 'completed',
    });
  }

  export function failOperationLog(id: OperationId, error: unknown) {
    updateOperationLogEntry(id, {
      error: operationErrorMessage(error),
      finishedAt: Date.now(),
      status: 'failed',
    });
  }

  export function cancelOperationLog(id: OperationId, detail = 'Cancelled') {
    updateOperationLogEntry(id, {
      detail,
      finishedAt: Date.now(),
      status: 'cancelled',
    });
  }

  export async function runWithOperationLog<T>(
    {
      action,
      detail,
      item,
      itemCount = 0,
      onCancel,
      retry,
      target,
      title,
    }: OperationProgressLogConfig,
    work: () => Promise<T>,
  ) {
    const historyId = startOperationLog({ action, detail, itemCount, retry, target, title });
    let cancelRequested = false;

    try {
      const result = await runWithProgress(title, item, work, {
        onCancel: onCancel
          ? () => {
              cancelRequested = true;
              cancelOperationLog(historyId);
              return onCancel();
            }
          : null,
      });
      if (!cancelRequested) completeOperationLog(historyId);
      return result;
    } catch (error) {
      if (cancelRequested || isCancellationError(error)) cancelOperationLog(historyId);
      else failOperationLog(historyId, error);
      throw error;
    }
  }

  function operationStatusLabel(status: OperationLogStatus) {
    if (status === 'completed') return 'Completed';
    if (status === 'failed') return 'Failed';
    if (status === 'cancelled') return 'Cancelled';
    return 'Running';
  }

  function operationTimeLabel(timestamp: number) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString([], {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
    });
  }

  function operationPreviewList(paths: PathString[], limit = 8) {
    const rows = paths.slice(0, limit).map((path) => `
      <li title="${escapeHtml(path)}">${escapeHtml(basename(path))}</li>
    `).join('');
    const extra = paths.length > limit
      ? `<p class="settings-section-hint">And ${paths.length - limit} more item${paths.length - limit === 1 ? '' : 's'}.</p>`
      : '';
    return `${rows ? `<ul class="preflight-item-list">${rows}</ul>` : ''}${extra}`;
  }

  function operationHistoryBody(history: OperationLogEntry[]) {
    if (history.length === 0) {
      return '<p class="placeholder-msg">No recent operations yet.</p>';
    }

    const firstRetryableId = history.find((entry) => entry.status === 'failed' && entry.retry)?.id || '';

    return `
      <div class="operation-history-list">
        ${history.map((entry) => {
          const retryable = entry.status === 'failed' && Boolean(entry.retry);
          const detail = entry.error || entry.detail || entry.target || '';
          const itemCount = entry.itemCount > 0
            ? `${entry.itemCount} item${entry.itemCount === 1 ? '' : 's'}`
            : '';
          return `
            <label class="operation-history-item operation-history-item--${escapeHtml(entry.status)} ${retryable ? 'operation-history-item--retryable' : ''}">
              ${retryable ? `<input type="radio" name="operation-history-entry" value="${escapeHtml(entry.id)}" ${entry.id === firstRetryableId ? 'checked' : ''}>` : '<span class="operation-history-spacer" aria-hidden="true"></span>'}
              <span class="operation-history-main">
                <span class="operation-history-title">${escapeHtml(entry.title)}</span>
                <span class="operation-history-detail" title="${escapeHtml(detail)}">${escapeHtml(detail || itemCount || entry.action)}</span>
              </span>
              <span class="operation-history-meta">
                <span class="operation-history-count">${escapeHtml(itemCount)}</span>
                <span class="operation-history-status">${escapeHtml(operationStatusLabel(entry.status))}</span>
                <span class="operation-history-time">${escapeHtml(operationTimeLabel(entry.finishedAt || entry.startedAt))}</span>
              </span>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  async function retryOperation(retry: OperationLogRetry) {
    if (retry.kind === 'transfer') {
      await transferEntriesWithSafety(retry.sources, retry.destination, retry.action, retry.options || {});
      return;
    }

    if (retry.kind === 'delete') {
      await deletePathsWithOperationLog(retry.paths, retry.useTrash);
      return;
    }

    if (retry.kind === 'create-archive') {
      await runWithOperationLog({
        action: 'create-archive',
        item: basename(retry.archivePath),
        itemCount: retry.sourcePaths.length,
        retry,
        target: retry.archivePath,
        title: 'Creating Archive',
      }, () => createArchive(retry.sourcePaths, retry.archivePath, retry.format));
      showSuccess(`Created ${basename(retry.archivePath)}`);
      await refreshTransferSurfaces();
      return;
    }

    if (retry.kind === 'extract-archive') {
      await runWithOperationLog({
        action: 'extract-archive',
        item: basename(retry.archivePath),
        itemCount: 1,
        retry,
        target: retry.targetDirectory,
        title: 'Extracting Archive',
      }, () => extractArchive(retry.archivePath, retry.targetDirectory));
      showSuccess(`Extracted ${basename(retry.archivePath)}`);
      await refreshTransferSurfaces();
      return;
    }

    await runWithOperationLog({
      action: 'advanced-rename',
      item: `${retry.requests.length} item${retry.requests.length === 1 ? '' : 's'}`,
      itemCount: retry.requests.length,
      retry,
      title: 'Renaming Items',
    }, () => batchRename(retry.requests));
    showSuccess(`Renamed ${retry.requests.length} item${retry.requests.length === 1 ? '' : 's'}`);
    await refreshTransferSurfaces();
  }

  export async function showOperationHistoryFlow() {
    const history = appState.operationHistory || [];
    const retryable = history.some((entry) => entry.status === 'failed' && entry.retry);

    const result = await showHtmlDialog({
      bodyHtml: operationHistoryBody(history),
      confirmText: retryable ? 'Retry Selected' : 'Close',
      onConfirm: () => (
        document.querySelector<HTMLInputElement>('input[name="operation-history-entry"]:checked')?.value || ''
      ),
      showCancel: retryable,
      title: 'Operation History',
    });

    if (result === false || !retryable) return;
    const entry = history.find((candidate) => candidate.id === String(result));
    if (!entry?.retry) return;

    try {
      await retryOperation(entry.retry);
    } catch (error) {
      showError(error);
    }
  }



  export function startDirectoryWatch(path: PathString) {
    if (!path || localState.watchedDirectoryPath === path) return;
    localState.watchedDirectoryPath = path;
    watchDirectory(path).catch((error) => {
      localState.watchedDirectoryPath = null;
      console.warn('Directory watch unavailable:', error);
    });
  }

  export function scheduleFileChangeRefresh(path: PathString) {
    const touchesPrimary = appState.currentPath && pathContains(appState.currentPath, path);
    const touchesSecondary = appState.secondaryPath && pathContains(appState.secondaryPath, path);
    if (!touchesPrimary && !touchesSecondary) return;

    if (localState.fileChangeRefreshTimer !== null) {
      window.clearTimeout(localState.fileChangeRefreshTimer);
    }

    localState.fileChangeRefreshTimer = window.setTimeout(() => {
      localState.fileChangeRefreshTimer = null;
      if (touchesPrimary) void refreshCurrentDirectory();
      if (touchesSecondary) void refreshSecondaryPane();
    }, 250);
  }

  export function findDriveForPath(path: PathString): DriveInfo | null {
    const normalized = normalizeComparablePath(path);
    if (!normalized) return null;

    const drives = [...(appState.drives || [])].sort(
      (left, right) => String(right.path || '').length - String(left.path || '').length,
    );

    for (const drive of drives) {
      const drivePath = normalizeComparablePath(drive.path);
      if (!drivePath) continue;
      if (normalized === drivePath || normalized.startsWith(drivePath.endsWith('/') ? drivePath : `${drivePath}/`)) {
        return drive;
      }
    }
    return null;
  }

  export async function refreshDrives(options: { quiet?: boolean } = {}) {
    try {
      const drives = await listDrives();
      if (drives.length > 0) {
        appState.drives = drives;
      } else {
        const fallbackDrive = createFallbackDriveForPath(appState.homePath || appState.currentPath);
        appState.drives = fallbackDrive ? [fallbackDrive] : [];
      }
      return appState.drives;
    } catch (error) {
      if (!options.quiet) showError(error);
      console.error('Failed to refresh drives:', error);
      return appState.drives || [];
    }
  }

  async function offerNetworkDriveReconnect(drive: DriveInfo, path: PathString, pane: PaneId) {
    const status = String(drive.drive_status || 'available').toLowerCase();
    if (status === 'available') return false;

    const detail = escapeHtml(drive.status_detail || 'This mapped network drive is not reachable right now.');
    const share = drive.remote_path
      ? `<p class="settings-section-hint"><strong>Share:</strong> ${escapeHtml(drive.remote_path)}</p>`
      : '';
    const letter = escapeHtml(drive.path);

    const shouldRetry = await showHtmlDialog({
      bodyHtml: `
        <div class="network-drive-dialog">
          <p><strong>${escapeHtml(drive.name || drive.path)}</strong> is currently
            <span class="network-drive-status network-drive-status--${escapeHtml(status)}">${escapeHtml(status)}</span>.
          </p>
          <p>${detail}</p>
          ${share}
          <p class="settings-section-hint">Path: ${letter}</p>
          <p>Retry probes the mapping again (with a short timeout). Check VPN or credentials if it stays offline.</p>
        </div>
      `,
      confirmText: 'Retry',
      showCancel: true,
      title: 'Network drive unavailable',
    });

    if (!shouldRetry) return true;

    showProgressFlow('Checking network drive', drive.name || drive.path, 12);
    try {
      await refreshDrives({ quiet: true });
      const updated = findDriveForPath(path);
      const nextStatus = String(updated?.drive_status || 'offline').toLowerCase();
      if (nextStatus === 'available') {
        showSuccess(updated?.remote_path
          ? `Connected to ${updated.remote_path}`
          : 'Network drive is available again');
        if (pane === 'secondary') await loadSecondaryDirectory(path);
        else await loadDirectory(path);
      } else {
        showError(updated?.status_detail || 'The network drive is still unavailable.');
      }
    } finally {
      hideProgressFlow();
    }
    return true;
  }

  export async function loadDirectory(path: string, historyMode: HistoryMode = 'push') {
    const token = ++localState.navigationToken;
    try {
      cancelFolderMetricWork();
      clearThumbnailCache();
      resetPassiveMetricFailures();
      resetSearchStateForNavigation();
      appState.isNavigating = true;
      appState.primaryListingInProgress = true;
      appState.currentPath = path;
      appState.entries = [];
      appState.filteredEntries = [];
      appState.selectedEntries = new Set();
      appState.focusedIndex = -1;
      appState.lastSelectedIndex = -1;
      appState.filterQuery = '';
      appState.primaryPathIsNetwork = isNetworkFsPath(path, appState.drives || []);

      let progressive: FileEntry[] = [];
      let firstChunkPainted = false;

      const listing = await getActiveFileSystem().listDirectory(path, {
        onChunk: (chunk) => {
          if (token !== localState.navigationToken) return;
          if (typeof chunk.is_network === 'boolean') {
            appState.primaryPathIsNetwork = chunk.is_network;
          }
          if (chunk.path) {
            appState.currentPath = chunk.path;
          }
          // Append streamed pages so the first viewport paints before enumeration finishes.
          progressive = progressive.concat(chunk.entries || []);
          appState.entries = progressive;
          applyEntryFilters();
          if (!firstChunkPainted && progressive.length > 0) {
            firstChunkPainted = true;
            appState.isNavigating = false;
          }
        },
      });
      if (token !== localState.navigationToken) return;

      appState.currentPath = listing.path;
      appState.entries = listing.entries;
      appState.primaryPathIsNetwork = listing.is_network
        ?? isNetworkFsPath(listing.path, appState.drives || []);
      recordHistory(listing.path, historyMode);
      applyEntryFilters();
      startDirectoryWatch(listing.path);
      addRecentLocation(listing.path);
      syncActiveTab();
      void updatePreviewPane();
    } catch (e) {
      const drive = findDriveForPath(path);
      if (drive && String(drive.drive_type || '').toLowerCase() === 'network') {
        const detail = drive.status_detail || String(e);
        showError(detail);
        // Refresh status so badges update after a failed open.
        void refreshDrives({ quiet: true });
      } else {
        showError(e);
      }
      console.error('Failed to load directory:', e);
    } finally {
      if (token === localState.navigationToken) {
        appState.isNavigating = false;
        appState.primaryListingInProgress = false;
      }
    }
  }

  export async function loadSecondaryDirectory(path: PathString, historyMode: HistoryMode = 'push', activate = true) {
    if (!path) return;
    const token = ++localState.secondaryNavigationToken;
    try {
      cancelFolderMetricWork();
      clearThumbnailCache();
      resetPassiveMetricFailures();
      appState.secondaryListingInProgress = true;
      appState.secondaryPath = path;
      appState.secondaryEntries = [];
      appState.secondaryFilteredEntries = [];
      appState.secondarySelectedEntries = new Set();
      appState.secondaryPathIsNetwork = isNetworkFsPath(path, appState.drives || []);

      let progressive: FileEntry[] = [];
      const listing = await getActiveFileSystem().listDirectory(path, {
        onChunk: (chunk) => {
          if (token !== localState.secondaryNavigationToken) return;
          if (typeof chunk.is_network === 'boolean') {
            appState.secondaryPathIsNetwork = chunk.is_network;
          }
          if (chunk.path) {
            appState.secondaryPath = chunk.path;
          }
          progressive = progressive.concat(chunk.entries || []);
          appState.secondaryEntries = progressive;
          applySecondaryEntryFilters();
        },
      });
      if (token !== localState.secondaryNavigationToken) return;

      appState.secondaryPath = listing.path;
      appState.secondaryEntries = listing.entries;
      appState.secondaryPathIsNetwork = listing.is_network
        ?? isNetworkFsPath(listing.path, appState.drives || []);
      if (activate) appState.activePane = 'secondary';
      recordSecondaryHistory(listing.path, historyMode);
      applySecondaryEntryFilters();
    } catch (error) {
      const drive = findDriveForPath(path);
      if (drive && String(drive.drive_type || '').toLowerCase() === 'network') {
        showError(drive.status_detail || String(error));
        void refreshDrives({ quiet: true });
      } else {
        showError(error);
      }
    } finally {
      if (token === localState.secondaryNavigationToken) {
        appState.secondaryListingInProgress = false;
      }
    }
  }

  export async function refreshCurrentDirectory() {
    if (appState.currentPath) {
      await loadDirectory(appState.currentPath, 'none');
    }
  }

  export async function refreshSecondaryPane() {
    if (!appState.secondaryPath) return;
    const selectedPaths = new Set(appState.secondarySelectedEntries || new Set<PathString>());
    await loadSecondaryDirectory(appState.secondaryPath, 'none', false);
    const visiblePaths = new Set(appState.secondaryFilteredEntries.map((entry: FileEntry) => entry.path));
    appState.secondarySelectedEntries = new Set(
      [...selectedPaths].filter((path) => visiblePaths.has(path)),
    );
  }

  export async function navigateSecondaryHistory(delta: number) {
    const nextIndex = appState.secondaryHistoryIndex + delta;
    if (nextIndex < 0 || nextIndex >= appState.secondaryHistory.length) return;
    appState.secondaryHistoryIndex = nextIndex;
    await loadSecondaryDirectory(appState.secondaryHistory[nextIndex], 'none');
  }

  export async function refreshTransferSurfaces() {
    await refreshCurrentDirectory();
    if (appState.dualPaneEnabled && appState.secondaryPath) {
      await refreshSecondaryPane();
    }
  }

  export function getUndoStack(): UndoEntry[] {
    return appState.undoStack || [];
  }

  export function getRedoStack(): UndoEntry[] {
    return (appState.redoStack || []).filter((entry: UndoEntry) => typeof entry.redo === 'function');
  }

  export function pushUndoEntry(entry: UndoEntry) {
    appState.undoStack = [entry, ...getUndoStack()].slice(0, localState.MAX_UNDO_STACK);
    appState.redoStack = [];
  }

  export async function undoLastFlow() {
    const [entry, ...rest] = getUndoStack();
    if (!entry) return;

    try {
      appState.undoStack = rest;
      await entry.undo();
      appState.redoStack = entry.redo
        ? [entry, ...getRedoStack()].slice(0, localState.MAX_UNDO_STACK)
        : getRedoStack();
      await refreshTransferSurfaces();
      showSuccess(`Undid ${entry.description}`);
    } catch (error) {
      appState.undoStack = [entry, ...rest].slice(0, localState.MAX_UNDO_STACK);
      showError(error);
    }
  }

  export async function redoLastFlow() {
    const [entry, ...rest] = getRedoStack();
    if (!entry?.redo) return;

    try {
      appState.redoStack = rest;
      await entry.redo();
      appState.undoStack = [entry, ...getUndoStack()].slice(0, localState.MAX_UNDO_STACK);
      await refreshTransferSurfaces();
      showSuccess(`Redid ${entry.description}`);
    } catch (error) {
      appState.redoStack = [entry, ...rest].slice(0, localState.MAX_UNDO_STACK);
      showError(error);
    }
  }

  export async function navigateHistory(delta: number) {
    const nextIndex = appState.historyIndex + delta;
    if (nextIndex < 0 || nextIndex >= appState.history.length) return;
    appState.historyIndex = nextIndex;
    await loadDirectory(appState.history[nextIndex], 'none');
    syncActiveTab();
  }

  export async function navigateSpecial(command: string) {
    const specialFolders: Record<string, string> = {
      navigateDesktop: 'Desktop',
      navigateDocuments: 'Documents',
      navigateDownloads: 'Downloads',
      navigatePictures: 'Pictures',
    };

    if (command === 'navigateHome') {
      await loadDirectory(appState.homePath);
      return;
    }

    const folder = specialFolders[command];
    if (folder) {
      await loadDirectory(joinPath(appState.homePath, folder));
    }
  }

  export function normalizeComparablePath(path: PathString) {
    return String(path || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  export function pathsEqual(a: PathString, b: PathString) {
    return normalizeComparablePath(a) === normalizeComparablePath(b);
  }

  export function pathContains(parent: PathString, child: PathString) {
    const parentPath = normalizeComparablePath(parent);
    const childPath = normalizeComparablePath(child);
    if (!parentPath || !childPath) return false;
    if (parentPath === childPath) return true;
    return childPath.startsWith(parentPath.endsWith('/') ? parentPath : `${parentPath}/`);
  }

  export function transferVerb(action: TransferAction) {
    return action === 'move' ? 'Moved' : 'Copied';
  }

  export function transferProgressTitle(action: TransferAction) {
    return action === 'move' ? 'Moving Items' : 'Copying Items';
  }

  export async function destinationConflicts(sources: PathString[], destination: PathString) {
    try {
      const listing = await listDirectory(destination);
      const names = new Set((listing.entries || []).map((entry: FileEntry) => entry.name.toLowerCase()));
      return sources.filter((source) => names.has(basename(source).toLowerCase()));
    } catch {
      return [];
    }
  }

  export async function chooseConflictAction(
    sources: PathString[],
    destination: PathString,
    action: TransferAction,
  ): Promise<ConflictAction | null> {
    const conflicts = await destinationConflicts(sources, destination);
    if (conflicts.length === 0) return 'error';

    const rows = conflicts.slice(0, 8).map((path) => `
      <li title="${escapeHtml(path)}">${escapeHtml(basename(path))}</li>
    `).join('');
    const extra = conflicts.length > 8
      ? `<p class="settings-section-hint">And ${conflicts.length - 8} more item${conflicts.length - 8 === 1 ? '' : 's'}.</p>`
      : '';

    const result = await showHtmlDialog({
      bodyHtml: `
        <div class="transfer-conflict-dialog">
          <p>The destination already contains item${conflicts.length === 1 ? '' : 's'} with the same name.</p>
          <ul class="transfer-conflict-list">${rows}</ul>
          ${extra}
          <div class="transfer-conflict-options" role="radiogroup" aria-label="Conflict action">
            <label class="tag-option">
              <input type="radio" name="transfer-conflict-action" value="rename" checked>
              <span>Keep both</span>
            </label>
            <label class="tag-option">
              <input type="radio" name="transfer-conflict-action" value="replace">
              <span>Replace destination</span>
            </label>
            <label class="tag-option">
              <input type="radio" name="transfer-conflict-action" value="skip">
              <span>Skip conflicts</span>
            </label>
          </div>
        </div>
      `,
      confirmText: action === 'move' ? 'Move' : 'Copy',
      onConfirm: () => (
        document.querySelector<HTMLInputElement>('input[name="transfer-conflict-action"]:checked')?.value || 'rename'
      ),
      title: `${action === 'move' ? 'Move' : 'Copy'} Conflicts`,
    });

    if (result === false) return null;
    return String(result || 'rename') as ConflictAction;
  }

  async function confirmBulkTransferPreflight(
    sources: PathString[],
    destination: PathString,
    action: TransferAction,
  ) {
    if (sources.length < BULK_TRANSFER_PREFLIGHT_THRESHOLD) return true;

    const actionLabel = action === 'move' ? 'Move' : 'Copy';
    const result = await showHtmlDialog({
      bodyHtml: `
        <div class="preflight-summary">
          <dl class="preflight-detail-list">
            <div><dt>Action</dt><dd>${actionLabel}</dd></div>
            <div><dt>Items</dt><dd>${sources.length}</dd></div>
            <div><dt>Destination</dt><dd title="${escapeHtml(destination)}">${escapeHtml(destination)}</dd></div>
          </dl>
          ${operationPreviewList(sources)}
        </div>
      `,
      confirmText: actionLabel,
      title: `${actionLabel} ${sources.length} Items`,
    });

    return result !== false;
  }

  export function normalizeTransferResults(result: unknown, sources: PathString[]) {
    if (!Array.isArray(result)) return [];
    return result
      .filter((item): item is TransferResult => Boolean(item?.source && item?.destination))
      .filter((item) => !String(item.destination).startsWith('SKIPPED:'))
      .map((item, index) => ({
        source: item.source || sources[index],
        destination: item.destination,
      }));
  }

  export async function runTransferCommand(
    sources: PathString[],
    destination: PathString,
    action: TransferAction,
    conflictAction: ConflictAction,
    operationId: OperationId | null = null,
  ) {
    const result = action === 'copy'
      ? await copyWithProgress(sources, destination, operationId, conflictAction)
      : await moveWithProgress(sources, destination, operationId, conflictAction);
    return normalizeTransferResults(result, sources);
  }

  export async function safeDeletePaths(paths: PathString[]) {
    if (paths.length === 0) return;
    try {
      await moveToTrash(paths);
    } catch (error) {
      if (typeof error !== 'string' || !error.startsWith('TRASH_UNAVAILABLE')) {
        throw error;
      }
      for (const path of paths) await deleteEntry(path);
    }
  }

  export function addCopyUndo(transferred: TransferResult[], destination: PathString, description: string) {
    if (transferred.length === 0) return;
    pushUndoEntry({
      description,
      undo: () => safeDeletePaths(transferred.map((item) => item.destination)),
      redo: async () => {
        for (const item of transferred) {
          try {
            await getActiveFileSystem().copyEntry(item.source, destination, 'rename');
          } catch (e) {
            console.error('Failed to redo paste:', e);
          }
        }
      },
    });
  }

  export function addMoveUndo(transferred: TransferResult[], destination: PathString, description: string) {
    if (transferred.length === 0) return;
    pushUndoEntry({
      description,
      undo: async () => {
        for (const item of [...transferred].reverse()) {
          const sourceParent = getParentPath(item.source);
          if (sourceParent) await getActiveFileSystem().moveEntry(item.destination, sourceParent, 'rename');
        }
      },
      redo: async () => {
        for (const item of transferred) {
          await getActiveFileSystem().moveEntry(item.source, destination, 'rename');
        }
      },
    });
  }

  export async function transferEntriesWithSafety(
    rawSources: PathString[],
    destination: PathString,
    action: TransferAction,
    options: { pushUndo?: boolean; showSuccess?: boolean; successMessage?: string } = {},
  ) {
    const sources = rawSources.filter((source) => {
      const sourceParent = getParentPath(source);
      return (
        source
        && destination
        && !pathsEqual(source, destination)
        && !(action === 'move' && sourceParent && pathsEqual(sourceParent, destination))
        && !(action === 'move' && pathContains(source, destination))
      );
    });
    if (sources.length === 0 || !destination) return [];

    const preflightConfirmed = await confirmBulkTransferPreflight(sources, destination, action);
    if (!preflightConfirmed) return [];

    const conflictAction = await chooseConflictAction(sources, destination, action);
    if (conflictAction === null) return [];

    const operationId = uniqueId(action === 'move' ? 'file-move' : 'file-copy');
    const historyId = startOperationLog({
      action,
      detail: `To ${destination}`,
      itemCount: sources.length,
      retry: {
        kind: 'transfer',
        action,
        destination,
        options: { ...options },
        sources: [...sources],
      },
      target: destination,
      title: transferProgressTitle(action),
    });
    const label = sources.length === 1 ? basename(sources[0]) : `${sources.length} items`;
    // Track cancel separately from history status so a late Ok result cannot
    // complete/undo-race against an explicit user cancel.
    let cancelRequested = false;
    if (localState.lastCancelledOperationId === operationId) {
      localState.lastCancelledOperationId = null;
    }
    showProgressFlow(transferProgressTitle(action), label, 0, operationId, {
      onCancel: () => {
        cancelRequested = true;
        cancelOperationLog(historyId);
      },
    });

    const finalizeCancelledTransfer = async (transferred: TransferResult[]) => {
      const detail = transferred.length > 0
        ? `Cancelled after ${transferred.length} item${transferred.length === 1 ? '' : 's'}`
        : 'Cancelled';
      // force=true so a first cancel ("Cancelling…") can be refined with the final count
      updateOperationLogEntry(historyId, {
        detail,
        finishedAt: Date.now(),
        status: 'cancelled',
      }, true);

      if (options.pushUndo !== false && transferred.length > 0) {
        const description = `Cancelled ${action === 'move' ? 'move' : 'copy'} (${transferred.length} item${transferred.length === 1 ? '' : 's'})`;
        if (action === 'copy') addCopyUndo(transferred, destination, description);
        else addMoveUndo(transferred, destination, description);
      }

      await refreshTransferSurfaces();
      return transferred;
    };

    try {
      const transferred = await runTransferCommand(sources, destination, action, conflictAction, operationId);
      const historyStatus = operationLogEntry(historyId)?.status;
      const backendCancelled = localState.lastCancelledOperationId === operationId;
      const wasCancelled = cancelRequested || historyStatus === 'cancelled' || backendCancelled;

      if (wasCancelled) {
        if (localState.lastCancelledOperationId === operationId) {
          localState.lastCancelledOperationId = null;
        }
        return finalizeCancelledTransfer(transferred);
      }

      updateProgressFlow(100, label);
      completeOperationLog(
        historyId,
        `${transferVerb(action)} ${transferred.length} item${transferred.length === 1 ? '' : 's'}`,
      );

      if (options.pushUndo !== false && transferred.length > 0) {
        const description = `${action === 'move' ? 'Move' : 'Copy'} ${transferred.length} item${transferred.length === 1 ? '' : 's'}`;
        if (action === 'copy') addCopyUndo(transferred, destination, description);
        else addMoveUndo(transferred, destination, description);
      }

      await refreshTransferSurfaces();
      if (options.showSuccess !== false && transferred.length > 0) {
        showSuccess(options.successMessage || `${transferVerb(action)} ${transferred.length} item${transferred.length === 1 ? '' : 's'}`);
      }
      return transferred;
    } catch (error) {
      if (cancelRequested || isCancellationError(error)) {
        // Do not rethrow cancellations: callers treat thrown errors as failures
        // and would surface a spurious "Operation cancelled" toast.
        return finalizeCancelledTransfer([]);
      }
      failOperationLog(historyId, error);
      throw error;
    } finally {
      window.setTimeout(() => {
        if (progressUi.operationId === operationId) hideProgressFlow();
      }, 220);
    }
  }

  export async function createFolderFlow() {
    const result = await showDialog({
      confirmText: 'Create',
      defaultValue: 'New Folder',
      label: 'Folder name',
      title: 'New Folder',
      type: 'prompt',
    });
    const name = typeof result === 'string' ? result : '';
    if (!name) return;
    if (!isValidFileName(name)) {
      showError('Enter a valid folder name.');
      return;
    }

    try {
      const activePane = appState.activePane as PaneId;
      const parentPathAtCreation = pathForPane(activePane);
      const newPath = await getActiveFileSystem().createDirectory(parentPathAtCreation, name);
      pushUndoEntry({
        description: `Create folder ${name}`,
        undo: () => safeDeletePaths([newPath]),
        redo: () => getActiveFileSystem().createDirectory(parentPathAtCreation, name),
      });
      showSuccess(`Created folder "${name}"`);
      if (activePane === 'secondary') {
        await refreshSecondaryPane();
        const index = appState.secondaryFilteredEntries.findIndex((entry: FileEntry) => entry.path === newPath);
        selectSecondaryPaths([newPath], index);
      } else {
        await refreshCurrentDirectory();
        const index = appState.filteredEntries.findIndex((entry: FileEntry) => entry.path === newPath);
        selectPaths([newPath], index);
      }
    } catch (error) {
      showError(error);
    }
  }

  export async function createFileFlow() {
    const result = await showDialog({
      confirmText: 'Create',
      defaultValue: 'New File.txt',
      label: 'File name',
      title: 'New File',
      type: 'prompt',
    });
    const name = typeof result === 'string' ? result : '';
    if (!name) return;
    if (!isValidFileName(name)) {
      showError('Enter a valid file name.');
      return;
    }

    try {
      const activePane = appState.activePane as PaneId;
      const parentPathAtCreation = pathForPane(activePane);
      const newPath = await getActiveFileSystem().createFile(parentPathAtCreation, name);
      pushUndoEntry({
        description: `Create file ${name}`,
        undo: () => safeDeletePaths([newPath]),
        redo: () => getActiveFileSystem().createFile(parentPathAtCreation, name),
      });
      showSuccess(`Created file "${name}"`);
      if (activePane === 'secondary') {
        await refreshSecondaryPane();
        const index = appState.secondaryFilteredEntries.findIndex((entry: FileEntry) => entry.path === newPath);
        selectSecondaryPaths([newPath], index);
      } else {
        await refreshCurrentDirectory();
        const index = appState.filteredEntries.findIndex((entry: FileEntry) => entry.path === newPath);
        selectPaths([newPath], index);
      }
    } catch (error) {
      showError(error);
    }
  }

  export async function renameSelectedFlow() {
    const activePane = appState.activePane as PaneId;
    if (selectedSetForPane(activePane).size !== 1) return;
    const path = currentSelectionPaths()[0];
    const entry = activePane === 'secondary' ? findSecondaryEntry(path) : findEntry(path);
    if (!entry) return;

    const result = await showDialog({
      confirmText: 'Rename',
      defaultValue: entry.name,
      label: 'New name',
      title: 'Rename',
      type: 'prompt',
    });
    const newName = typeof result === 'string' ? result : '';
    if (!newName || newName === entry.name) return;
    if (!isValidFileName(newName)) {
      showError('Enter a valid name.');
      return;
    }

    try {
      const newPath = await getActiveFileSystem().renameEntry(path, newName);
      pushUndoEntry({
        description: `Rename ${entry.name}`,
        undo: () => getActiveFileSystem().renameEntry(newPath, entry.name),
        redo: () => getActiveFileSystem().renameEntry(path, newName),
      });
      showSuccess(`Renamed to "${newName}"`);
      if (activePane === 'secondary') {
        await refreshSecondaryPane();
        const index = appState.secondaryFilteredEntries.findIndex((candidate: FileEntry) => candidate.path === newPath);
        selectSecondaryPaths([newPath], index);
      } else {
        await refreshCurrentDirectory();
        const index = appState.filteredEntries.findIndex((candidate: FileEntry) => candidate.path === newPath);
        selectPaths([newPath], index);
      }
    } catch (error) {
      showError(error);
    }
  }

  export type DeleteSelectedMode = 'settings' | 'trash' | 'permanent';

  function selectedItemCountText(count: number) {
    return `${count} selected item${count === 1 ? '' : 's'}`;
  }

  async function confirmDeleteSelection(paths: PathString[], useTrash: boolean) {
    const shouldConfirmDelete = appState.settings?.confirmDelete !== false;
    if (!shouldConfirmDelete) return true;

    const selectedItems = selectedItemCountText(paths.length);
    return Boolean(await showHtmlDialog({
      bodyHtml: `
        <div class="preflight-summary preflight-summary--danger">
          <dl class="preflight-detail-list">
            <div><dt>Action</dt><dd>${useTrash ? 'Move to Trash' : 'Permanent Delete'}</dd></div>
            <div><dt>Items</dt><dd>${paths.length}</dd></div>
          </dl>
          <p>${useTrash
            ? `Move ${selectedItems} to trash?`
            : `Permanently delete ${selectedItems}?`}</p>
          ${operationPreviewList(paths)}
        </div>
      `,
      confirmText: useTrash ? 'Move to Trash' : 'Delete',
      title: useTrash ? 'Delete Items' : 'Confirm Permanent Delete',
    }));
  }

  async function confirmPermanentDeleteFallback(paths: PathString[]) {
    const selectedItems = selectedItemCountText(paths.length);
    return Boolean(await showHtmlDialog({
      bodyHtml: `
        <div class="preflight-summary preflight-summary--danger">
          <p>Trash is unavailable. Permanently delete ${selectedItems} instead?</p>
          ${operationPreviewList(paths)}
        </div>
      `,
      confirmText: 'Delete',
      title: 'Confirm Permanent Delete',
    }));
  }

  async function permanentlyDeletePaths(
    paths: PathString[],
    options: { onCancel?: (() => unknown) | null } = {},
  ) {
    let cancelRequested = false;
    showProgressFlow('Deleting Items', selectedItemCountText(paths.length), 0, null, {
      onCancel: () => {
        cancelRequested = true;
        return options.onCancel?.();
      },
    });

    try {
      for (let index = 0; index < paths.length; index += 1) {
        if (cancelRequested) throw new Error('Operation cancelled');
        const path = paths[index];
        updateProgressFlow((index / Math.max(1, paths.length)) * 95, basename(path));
        await getActiveFileSystem().deleteEntry(path);
      }
    } finally {
      window.setTimeout(() => {
        if (!progressUi.operationId) hideProgressFlow();
      }, 180);
    }

    updateProgressFlow(100, `Deleted ${paths.length} items`);
  }

  async function deletePathsWithOperationLog(paths: PathString[], useTrash: boolean) {
    const title = useTrash ? 'Moving to Trash' : 'Deleting Items';
    const historyId = startOperationLog({
      action: useTrash ? 'trash' : 'delete',
      detail: useTrash ? 'Move selected items to trash' : 'Permanent delete',
      itemCount: paths.length,
      retry: {
        kind: 'delete',
        paths: [...paths],
        useTrash,
      },
      title,
    });

    try {
      if (useTrash) {
        await getActiveFileSystem().moveToTrash(paths);
      } else {
        await permanentlyDeletePaths(paths, {
          onCancel: () => cancelOperationLog(historyId),
        });
      }
      completeOperationLog(historyId, `Deleted ${paths.length} item${paths.length === 1 ? '' : 's'}`);
    } catch (error) {
      if (isCancellationError(error)) cancelOperationLog(historyId);
      else failOperationLog(historyId, error);
      throw error;
    }
  }

  export async function deleteSelectedFlow({ mode = 'settings' }: { mode?: DeleteSelectedMode } = {}) {
    const activePane = appState.activePane as PaneId;
    const paths = currentSelectionPaths();
    if (paths.length === 0) return;

    const useTrash = mode === 'trash'
      || (mode === 'settings' && appState.settings?.useTrash !== false);
    const confirmed = await confirmDeleteSelection(paths, useTrash);
    if (!confirmed) return;

    try {
      await deletePathsWithOperationLog(paths, useTrash);
      showSuccess(`Deleted ${paths.length} item${paths.length === 1 ? '' : 's'}`);
      if (activePane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      if (useTrash && typeof error === 'string' && error.startsWith('TRASH_UNAVAILABLE')) {
        try {
          const confirmedPermanentDelete = await confirmPermanentDeleteFallback(paths);
          if (!confirmedPermanentDelete) return;
          await deletePathsWithOperationLog(paths, false);
          showSuccess(`Deleted ${paths.length} item${paths.length === 1 ? '' : 's'}`);
          if (activePane === 'secondary') await refreshSecondaryPane();
          else await refreshCurrentDirectory();
        } catch (deleteError) {
          showError(deleteError);
        }
        return;
      }
      showError(error);
    }
  }

  export function copySelection(action: 'copy' | 'cut') {
    const paths = currentSelectionPaths();
    if (paths.length === 0) return;
    setTransferClipboard(appState, paths, action);
    showSuccess(`${action === 'copy' ? 'Copied' : 'Cut'} ${paths.length} item${paths.length === 1 ? '' : 's'}`);
  }

  async function writeTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand('copy')) {
        throw new Error('System clipboard is unavailable.');
      }
    } finally {
      textarea.remove();
    }
  }

  export async function copySelectedPathsToSystemClipboard() {
    const paths = currentSelectionPaths();
    if (paths.length === 0) return;

    try {
      await writeTextToClipboard(paths.join('\n'));
      showSuccess(`Copied ${paths.length === 1 ? 'path' : `${paths.length} paths`}`);
    } catch (error) {
      showError(error);
    }
  }

  export async function showClipboardHistoryFlow() {
    const history = appState.clipboardHistory || [];
    const bodyHtml = history.length === 0
      ? '<p class="placeholder-msg">Clipboard history is empty.</p>'
      : `<div class="clipboard-history-list" role="radiogroup" aria-label="Clipboard history">
          ${history.map((entry: { action: ClipboardAction; paths: PathString[] }, index: number) => {
            const label = entry.paths.length === 1 ? basename(entry.paths[0]) : `${entry.paths.length} items`;
            return `
              <label class="clipboard-history-item" role="radio">
                <input type="radio" name="clipboard-history-entry" value="${index}" ${index === 0 ? 'checked' : ''}>
                <span class="clipboard-history-icon" aria-hidden="true">${entry.action === 'cut' ? '&#9986;' : '&#128203;'}</span>
                <span class="clipboard-history-label" title="${escapeHtml(entry.paths.join('\n'))}">${escapeHtml(label)}</span>
                <span class="clipboard-history-action">${escapeHtml(entry.action)}</span>
              </label>
            `;
          }).join('')}
        </div>`;

    const result = await showHtmlDialog({
      bodyHtml,
      confirmText: history.length === 0 ? 'Close' : 'Restore',
      onConfirm: () => (
        document.querySelector<HTMLInputElement>('input[name="clipboard-history-entry"]:checked')?.value || '0'
      ),
      showCancel: history.length > 0,
      title: 'Clipboard History',
    });

    if (result === false || history.length === 0) return;
    const index = Number(result || 0);
    const entry = history[index];
    if (!entry) return;
    appState.clipboard = [...entry.paths];
    appState.clipboardAction = entry.action;
    showSuccess(`Restored ${entry.action} clipboard item${entry.paths.length === 1 ? '' : 's'}`);
  }

  export async function pasteClipboard() {
    const paths = appState.clipboard || [];
    if (!paths.length || !appState.clipboardAction) return;

    try {
      const activePane = appState.activePane as PaneId;
      const action: TransferAction = appState.clipboardAction === 'copy' ? 'copy' : 'move';
      const pasted = await transferEntriesWithSafety(paths, pathForPane(activePane), action);
      // Only clear a cut clipboard after a full successful move. Cancelled or
      // partial transfers leave the remaining sources on the clipboard.
      if (appState.clipboardAction === 'cut' && pasted.length === paths.length) {
        appState.clipboard = null;
        appState.clipboardAction = null;
      }
      const pastedPaths = pasted.map((item) => item.destination);
      if (activePane === 'secondary') {
        selectSecondaryPaths(
          pastedPaths.filter((path) => appState.secondaryEntries.some((entry: FileEntry) => entry.path === path)),
        );
      } else {
        selectPaths(
          pastedPaths.filter((path) => appState.entries.some((entry: FileEntry) => entry.path === path)),
        );
      }
    } catch (error) {
      if (!isCancellationError(error)) showError(error);
    }
  }

  export async function openEntryPath(path: PathString, isDirectory?: boolean, pane: PaneId = 'primary') {
    const entry = pane === 'secondary' ? findSecondaryEntry(path) : findEntry(path);
    let shouldNavigate = isDirectory ?? entry?.is_dir;

    // Drive roots from the tree are always directories.
    const drive = findDriveForPath(path);
    if (drive && pathsEqual(drive.path, path)) {
      shouldNavigate = true;
      if (String(drive.drive_type || '').toLowerCase() === 'network') {
        const handled = await offerNetworkDriveReconnect(drive, path, pane);
        if (handled) return;
      }
    }

    // When neither the caller nor the local entries list knows the type,
    // ask the backend instead of guessing.  This covers edge cases such as
    // stale entry lists or paths that arrive from external sources.
    if (shouldNavigate === undefined) {
      try {
        const info = await getActiveFileSystem().getEntryInfo(path);
        shouldNavigate = info.is_dir;
      } catch {
        shouldNavigate = false;
      }
    }

    if (shouldNavigate) {
      if (pane === 'secondary') await loadSecondaryDirectory(path);
      else await loadDirectory(path);
      return;
    }

    if (isArchiveEntry(entry)) {
      await showArchiveContentsFlow(entry);
      return;
    }

    try {
      await getActiveFileSystem().openFile(path);
    } catch (error) {
      showError(error);
    }
  }

  export async function openSelected() {
    if (selectedSetForPane().size !== 1) return;
    const path = currentSelectionPaths()[0];
    const pane = appState.activePane as PaneId;
    const entry = pane === 'secondary' ? findSecondaryEntry(path) : findEntry(path);
    await openEntryPath(path, entry?.is_dir, pane);
  }

  export async function loadTreeChildren(path: PathString) {
    const children = await getActiveFileSystem().listSubdirectories(path);
    const nextTreeData = new Map(appState.treeData);
    nextTreeData.set(path, children);
    appState.treeData = nextTreeData;
  }

  export function hideContextMenu() {
    document.getElementById('context-menu')?.classList.remove('visible');
  }

  export function showContextMenuAt(x: number, y: number) {
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    menu.classList.add('visible');
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  const archiveExtensions = new Set(['zip', 'tar', 'tgz', 'gz', 'rar']);

  export function selectedFileEntries() {
    const seen = new Set<PathString>();
    const pane = appState.activePane as PaneId;
    const selectedSet = selectedSetForPane(pane);
    return [
      ...selectedEntriesInView(pane),
      ...entriesForPane(pane).filter((entry: FileEntry) => selectedSet.has(entry.path)),
    ].filter((entry: FileEntry) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    });
  }

  export function singleSelectedEntry() {
    const entries = selectedFileEntries();
    return entries.length === 1 ? entries[0] : null;
  }



  export function overlayById(id: string) {
    return document.getElementById(id) as HTMLElement | null;
  }

  export function setOverlayVisible(id: string, visible: boolean) {
    overlayById(id)?.classList.toggle('visible', visible);
  }

  type ProgressFlowOptions = {
    onCancel?: (() => unknown) | null;
  } & ProgressTransferDetails;

  export function showProgressFlow(
    title: string,
    item = '',
    percent = 0,
    operationId: string | null = null,
    options: ProgressFlowOptions = {},
  ) {
    const {
      onCancel = null,
      currentBytes = null,
      totalBytes = null,
      detailLine = null,
    } = options;
    showProgressUi(title, item, percent, operationId, onCancel, {
      currentBytes,
      detailLine,
      totalBytes,
    });
  }

  export function updateProgressFlow(
    percent: number,
    item = '',
    details: ProgressTransferDetails = {},
  ) {
    updateProgressUi(percent, item, details);
  }

  export function hideProgressFlow() {
    hideProgressUi();
  }

  export function isProgressDialogVisible() {
    return isProgressVisible();
  }

  export async function runWithProgress<T>(
    title: string,
    item: string,
    work: () => Promise<T>,
    options: ProgressFlowOptions = {},
  ) {
    showProgressFlow(title, item, 8, null, options);
    try {
      const result = await work();
      updateProgressFlow(100, item);
      return result;
    } finally {
      window.setTimeout(hideProgressFlow, 180);
    }
  }

  export function uniqueId(prefix = 'op'): OperationId {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  export function elementById<T extends HTMLElement = HTMLElement>(id: string) {
    return document.getElementById(id) as T | null;
  }

  export function inputValue(id: string, fallback = '') {
    return elementById<HTMLInputElement>(id)?.value ?? fallback;
  }

  export function setElementDisabledById(id: string, disabled: boolean) {
    const button = elementById<HTMLButtonElement>(id);
    if (button) button.disabled = disabled;
  }



  export function closeQuickLookFlow() {
    closeQuickLookUi();
    localState.currentQuickLookPath = null;
  }

  export async function showQuickLookFlow() {
    const entry = singleSelectedEntry();
    if (!entry) {
      showError('Select one item to preview.');
      return;
    }

    const quickLookPath = entry.path;
    localState.currentQuickLookPath = quickLookPath;
    try {
      const preview = entry.is_dir ? null : await getActiveFileSystem().readFilePreview(entry.path, 2_000_000);
      if (localState.currentQuickLookPath !== quickLookPath) return;
      openQuickLookUi({
        info: `${fileType(entry)} - ${formatFileSize(entry.size, entry.is_dir) || 'Folder'}`,
        path: quickLookPath,
        preview,
        title: entry.name,
      });
      await Promise.resolve();
      document.getElementById('quicklook-close')?.focus();
    } catch (error) {
      if (localState.currentQuickLookPath === quickLookPath) {
        localState.currentQuickLookPath = null;
        closeQuickLookUi();
      }
      showError(error);
    }
  }



  export async function openWithFlow() {
    const entry = singleSelectedEntry();
    if (!entry || entry.is_dir) {
      showError('Select one file to open with another application.');
      return;
    }

    const suggestions = getOpenWithSuggestions(appState, window.localStorage);
    const datalistOptions = suggestions
      .map((application) => `<option value="${escapeHtml(application)}"></option>`)
      .join('');
    const recentHint = suggestions.length > 0
      ? '<p class="settings-section-hint">Recent and common applications are available in the suggestions list.</p>'
      : '';
    const result = await showHtmlDialog({
      bodyHtml: `
        <p class="mb-md">Choose an application to open <strong>${escapeHtml(entry.name)}</strong>.</p>
        ${recentHint}
        <input
          type="text"
          id="open-with-app-input"
          list="open-with-apps"
          class="input-full"
          placeholder="Application name or executable path"
          autocomplete="off"
        >
        <datalist id="open-with-apps">${datalistOptions}</datalist>
      `,
      confirmText: 'Open',
      onConfirm: () => (document.getElementById('open-with-app-input') as HTMLInputElement | null)?.value?.trim() || '',
      title: 'Open With',
    });
    const application = typeof result === 'string' ? result.trim() : '';
    if (!application) return;

    try {
      await getActiveFileSystem().openFileWith(entry.path, application);
      rememberOpenWithApplication(window.localStorage, application);
      showSuccess(`Opening ${entry.name} with ${application}`);
    } catch (error) {
      showError(error);
    }
  }

  export async function compareSelectedFilesFlow() {
    const selectedEntries = selectedFileEntries().filter((entry: FileEntry) => !entry.is_dir);
    if (selectedEntries.length !== 2) {
      showError('Select exactly two files to compare.');
      return;
    }

    try {
      const comparison = await getActiveFileSystem().compareFiles(selectedEntries[0].path, selectedEntries[1].path);
      const rows = comparison.rows.slice(0, 200).map((row: any) => `
        <tr class="diff-row diff-${escapeHtml(row.kind)}">
          <td>${row.left_line ?? ''}</td>
          <td>${escapeHtml(row.left_text ?? '')}</td>
          <td>${row.right_line ?? ''}</td>
          <td>${escapeHtml(row.right_text ?? '')}</td>
        </tr>
      `).join('');
      await showHtmlDialog({
        bodyHtml: `
          <div class="comparison-summary">
            <p><strong>${escapeHtml(comparison.left_name)}</strong> and <strong>${escapeHtml(comparison.right_name)}</strong> are ${comparison.identical ? 'identical' : 'different'}.</p>
            <p>${comparison.added} added, ${comparison.removed} removed, ${comparison.changed} changed.</p>
            ${comparison.rows.length > 200 ? `<p>Showing first 200 of ${comparison.rows.length} comparison rows.</p>` : ''}
          </div>
          <div class="comparison-table-wrap">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>Left</th>
                  <th>${escapeHtml(comparison.left_name)}</th>
                  <th>Right</th>
                  <th>${escapeHtml(comparison.right_name)}</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="4">No text differences to display.</td></tr>'}</tbody>
            </table>
          </div>
        `,
        confirmText: 'Close',
        showCancel: false,
        title: 'Compare Files',
      });
    } catch (error) {
      showError(error);
    }
  }

  export async function copyOrMoveToOtherPane(action: 'copy' | 'move') {
    if (!appState.dualPaneEnabled) {
      showError('Turn on Dual Pane (F6) first.');
      return;
    }

    const destinationPane: PaneId = appState.activePane === 'secondary' ? 'primary' : 'secondary';
    const destination = pathForPane(destinationPane);
    if (!destination) {
      showError('Open a folder in the other pane first.');
      return;
    }

    const selectedEntries = selectedFileEntries();
    if (selectedEntries.length === 0) {
      showError('Select one or more items in the active pane first.');
      return;
    }

    try {
      await transferEntriesWithSafety(
        selectedEntries.map((entry: FileEntry) => entry.path),
        destination,
        action,
        {
          successMessage: action === 'copy'
            ? `Copied to ${destinationPane === 'secondary' ? 'right' : 'left'} pane`
            : `Moved to ${destinationPane === 'secondary' ? 'right' : 'left'} pane`,
        },
      );
      if (destinationPane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      if (!isCancellationError(error)) showError(error);
    }
  }

  export async function packIntoFolderFlow() {
    const selectedEntries = selectedFileEntries();
    if (selectedEntries.length === 0) return;
    const result = await showDialog({
      confirmText: 'Pack',
      defaultValue: 'Packed Items',
      label: 'Folder name',
      title: 'Pack into Folder',
      type: 'prompt',
    });
    const folderName = typeof result === 'string' ? result.trim() : '';
    if (!folderName) return;
    if (!isValidFileName(folderName)) {
      showError('Enter a valid folder name.');
      return;
    }

    try {
      const activePane = appState.activePane as PaneId;
      const sourceParentPath = pathForPane(activePane);
      const folderPath = await getActiveFileSystem().createDirectory(sourceParentPath, folderName);
      const transferred = await transferEntriesWithSafety(
        selectedEntries.map((entry: FileEntry) => entry.path),
        folderPath,
        'move',
        { pushUndo: false, showSuccess: false },
      );
      if (transferred.length === 0) {
        await safeDeletePaths([folderPath]);
        return;
      }
      pushUndoEntry({
        description: `Pack ${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'}`,
        undo: async () => {
          const listing = await getActiveFileSystem().listDirectory(folderPath);
          for (const child of listing.entries) {
            await getActiveFileSystem().moveEntry(child.path, sourceParentPath, 'rename');
          }
          await getActiveFileSystem().deleteEntry(folderPath);
        },
        redo: async () => {
          const redoFolderPath = await getActiveFileSystem().createDirectory(sourceParentPath, folderName);
          for (const entry of selectedEntries) {
            await getActiveFileSystem().moveEntry(entry.path, redoFolderPath, 'rename');
          }
        },
      });
      showSuccess(`Packed ${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'} into ${folderName}`);
      if (activePane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      if (!isCancellationError(error)) showError(error);
    }
  }

  export async function unpackFolderFlow() {
    const entry = singleSelectedEntry();
    if (!entry?.is_dir) {
      showError('Select one folder to unpack.');
      return;
    }

    try {
      const listing = await getActiveFileSystem().listDirectory(entry.path);
      if (listing.entries.length === 0) {
        showError('The selected folder is empty.');
        return;
      }

      const activePane = appState.activePane as PaneId;
      const destinationPath = pathForPane(activePane);
      const transferred = await transferEntriesWithSafety(
        listing.entries.map((child: FileEntry) => child.path),
        destinationPath,
        'move',
        { pushUndo: false, showSuccess: false },
      );
      if (transferred.length === 0) return;
      await getActiveFileSystem().deleteEntry(entry.path);
      pushUndoEntry({
        description: `Unpack ${entry.name}`,
        undo: async () => {
          const folderPath = await getActiveFileSystem().createDirectory(destinationPath, entry.name);
          for (const item of transferred) {
            await getActiveFileSystem().moveEntry(item.destination, folderPath, 'rename');
          }
        },
      });
      showSuccess(`Unpacked ${entry.name}`);
      if (activePane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      if (!isCancellationError(error)) showError(error);
    }
  }

  const keyboardShortcutSections = [
    {
      rows: [
        ['path.focus', 'Focus path bar'],
        ['path.focus.alt', 'Focus path bar'],
        ['path.submit', 'Go to entered path'],
        ['nav.parent', 'Parent folder'],
        ['nav.parent.backspace', 'Parent folder'],
        ['nav.back', 'Back'],
        ['nav.forward', 'Forward'],
        ['directory.refresh', 'Refresh'],
        ['file.open', 'Open selected item'],
        ['selection.up', 'Move selection up'],
        ['selection.down', 'Move selection down'],
        ['selection.left', 'Move selection left'],
        ['selection.right', 'Move selection right'],
        ['selection.first', 'Select first item'],
        ['selection.last', 'Select last item'],
      ],
      title: 'Navigation',
    },
    {
      rows: [
        ['selection.all', 'Select all'],
        ['selection.up.extend', 'Extend selection up'],
        ['selection.down.extend', 'Extend selection down'],
        ['file.copy', 'Copy'],
        ['file.cut', 'Cut'],
        ['file.paste', 'Paste'],
        ['file.copyPath', 'Copy full path'],
        ['file.rename', 'Rename'],
        ['file.delete.trash', 'Move to trash'],
        ['file.delete.permanent', 'Permanently delete'],
        ['file.newFile', 'New file'],
        ['file.newFolder', 'New folder'],
      ],
      title: 'File Operations',
    },
    {
      rows: [
        ['tabs.new', 'New tab'],
        ['tabs.close', 'Close tab'],
        ['tabs.next', 'Next tab'],
        ['tabs.previous', 'Previous tab'],
      ],
      title: 'Tabs',
    },
    {
      rows: [
        ['pane.toggleDual', 'Toggle dual pane'],
        ['pane.switch', 'Switch active pane'],
        ['pane.focusPrimary', 'Focus left pane'],
        ['pane.focusSecondary', 'Focus right pane'],
        ['pane.focusLeft', 'Focus left pane'],
        ['pane.focusRight', 'Focus right pane'],
        ['pane.copyToOther', 'Copy selection to other pane'],
        ['pane.moveToOther', 'Move selection to other pane'],
      ],
      title: 'Dual Pane',
    },
    {
      rows: [
        ['quickLook.toggle', 'Quick Look'],
        ['search.focus', 'Focus search'],
        ['commandPalette.open', 'Command palette'],
        ['clipboard.history', 'Clipboard history'],
        ['history.undo', 'Undo last create/rename/copy/move'],
        ['history.redo', 'Redo last create/rename/copy/move'],
        ['history.redo.shift', 'Redo last create/rename/copy/move'],
        ['terminal.open', 'Open terminal here'],
        ['help.keyboard', 'Keyboard shortcuts'],
        ['help.keyboard.ctrl', 'Keyboard shortcuts'],
        ['escape', 'Close surface, clear filter, or clear selection'],
      ],
      title: 'View & Tools',
    },
  ] as const;

  function shortcutLabelMap() {
    const labels = new Map<string, string>();
    for (const section of keyboardShortcutSections) {
      for (const [shortcutId, label] of section.rows) {
        labels.set(shortcutId, label);
      }
    }
    return labels;
  }

  function shortcutElementId(shortcutId: string) {
    return shortcutId.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function setShortcutInputStatus(input: HTMLInputElement, message: string, kind: 'error' | 'muted' | 'success') {
    const row = input.closest<HTMLElement>('.shortcut-settings-row');
    const status = row?.querySelector<HTMLElement>('[data-shortcut-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.status = kind;
  }

  function shortcutOverrideMap() {
    return { ...(appState.settings?.shortcutOverrides || {}) };
  }

  export function renderShortcutSettingsControls() {
    const container = document.getElementById('settings-shortcut-list');
    if (!container) return;

    const labels = shortcutLabelMap();
    const definitions = getShortcutDefinitions()
      .filter((definition) => labels.has(definition.id));

    const rows = definitions.map((definition) => {
      const row = document.createElement('div');
      row.className = 'shortcut-settings-row';
      row.dataset.shortcutId = definition.id;

      const label = document.createElement('label');
      label.htmlFor = `settings-shortcut-${shortcutElementId(definition.id)}`;
      label.textContent = labels.get(definition.id) || definition.id;

      const controls = document.createElement('div');
      controls.className = 'shortcut-settings-controls';

      const input = document.createElement('input');
      input.type = 'text';
      input.id = `settings-shortcut-${shortcutElementId(definition.id)}`;
      input.value = definition.combo;
      input.dataset.shortcutInput = definition.id;
      input.setAttribute('aria-label', `${label.textContent} shortcut`);
      input.autocomplete = 'off';
      input.spellcheck = false;

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'btn btn-secondary shortcut-reset-btn';
      reset.dataset.shortcutReset = definition.id;
      reset.textContent = 'Reset';
      reset.disabled = normalizeShortcutCombo(definition.combo) === normalizeShortcutCombo(definition.defaultCombo);

      const status = document.createElement('span');
      status.className = 'shortcut-settings-status';
      status.dataset.shortcutStatus = '';
      status.dataset.status = 'muted';
      status.textContent = `Default: ${definition.defaultCombo}`;

      controls.append(input, reset, status);
      row.append(label, controls);
      return row;
    });

    container.replaceChildren(...rows);
  }

  export function previewShortcutSettingInput(input: HTMLInputElement) {
    const shortcutId = input.dataset.shortcutInput;
    if (!shortcutId) return;

    const value = input.value.trim();
    if (!value) {
      setShortcutInputStatus(input, 'Enter a shortcut', 'error');
      return;
    }

    try {
      const normalized = normalizeShortcutCombo(value);
      const conflict = findShortcutConflict(shortcutId, normalized);
      if (conflict) {
        const labels = shortcutLabelMap();
        setShortcutInputStatus(input, `Already used by ${labels.get(conflict.id) || conflict.id}`, 'error');
        return;
      }
      setShortcutInputStatus(input, `Will save as ${normalized}`, 'success');
    } catch (error) {
      setShortcutInputStatus(input, error instanceof Error ? error.message : String(error), 'error');
    }
  }

  export function saveShortcutSettingFromInput(input: HTMLInputElement) {
    const shortcutId = input.dataset.shortcutInput;
    if (!shortcutId) return;

    const value = input.value.trim();
    try {
      const normalized = normalizeShortcutCombo(value);
      const conflict = findShortcutConflict(shortcutId, normalized);
      if (conflict) {
        const labels = shortcutLabelMap();
        throw new Error(`Shortcut is already used by ${labels.get(conflict.id) || conflict.id}.`);
      }

      updateShortcutCombo(shortcutId, normalized);
      const definition = getShortcutDefinitions().find((candidate) => candidate.id === shortcutId);
      const overrides = shortcutOverrideMap();
      if (definition && normalized === normalizeShortcutCombo(definition.defaultCombo)) {
        delete overrides[shortcutId];
      } else {
        overrides[shortcutId] = normalized;
      }

      appState.settings = {
        ...appState.settings,
        shortcutOverrides: overrides,
      };
      saveSettings();
      renderShortcutSettingsControls();
      showSuccess('Shortcut updated');
    } catch (error) {
      input.value = getShortcutMap()[shortcutId] || input.value;
      previewShortcutSettingInput(input);
      showError(error);
    }
  }

  export function resetShortcutSetting(shortcutId: string) {
    try {
      resetShortcutCombo(shortcutId);
      const overrides = shortcutOverrideMap();
      delete overrides[shortcutId];
      appState.settings = {
        ...appState.settings,
        shortcutOverrides: overrides,
      };
      saveSettings();
      renderShortcutSettingsControls();
      showSuccess('Shortcut reset');
    } catch (error) {
      showError(error);
    }
  }

  export function resetAllShortcutSettings() {
    for (const definition of getShortcutDefinitions()) {
      resetShortcutCombo(definition.id);
    }
    appState.settings = {
      ...appState.settings,
      shortcutOverrides: {},
    };
    saveSettings();
    renderShortcutSettingsControls();
    showSuccess('Shortcuts reset');
  }

  function buildKeyboardHelpSections() {
    const shortcutMap = getShortcutMap();
    const sections: Array<{ rows: Array<{ action: string; shortcut: string }>; title: string }> = [];

    for (const sectionDefinition of keyboardShortcutSections) {
      const groupedRows = new Map<string, string[]>();
      for (const [shortcutId, label] of sectionDefinition.rows) {
        const combo = shortcutMap[shortcutId];
        if (!combo) continue;
        groupedRows.set(label, [...(groupedRows.get(label) || []), combo]);
      }

      if (groupedRows.size === 0) continue;

      sections.push({
        title: sectionDefinition.title,
        rows: [...groupedRows.entries()].map(([action, combos]) => ({
          action,
          shortcut: combos.join(' / '),
        })),
      });
    }

    return sections;
  }

  export function showKeyboardHelpFlow() {
    openKeyboardHelpUi(buildKeyboardHelpSections());
    queueMicrotask(() => document.getElementById('keyboard-help-close')?.focus());
  }

  export function closeKeyboardHelpFlow() {
    closeKeyboardHelpUi();
  }

  export function pathsFromNativeDropPayload(payload: NativeFileDropEventPayload | null | undefined) {
    if (Array.isArray(payload)) return payload as PathString[];
    return ((payload?.paths || payload?.files || []) as PathString[]).filter(Boolean);
  }

  export function setExternalDropOverlayVisible(visible: boolean, destination = appState.currentPath) {
    const overlay = document.getElementById('external-drop-overlay');
    const pathElement = document.getElementById('external-drop-path');
    if (pathElement) pathElement.textContent = destination || '';
    overlay?.classList.toggle('visible', visible);
    overlay?.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  export function dropDestinationFromTarget(target: EventTarget | null) {
    const element = target instanceof HTMLElement ? target : null;
    const folderItem = element?.closest<HTMLElement>('.file-item[data-is-dir="true"]');
    if (folderItem?.dataset.path) return folderItem.dataset.path as PathString;
    if (element?.closest('#secondary-file-list')) return appState.secondaryPath || appState.currentPath;
    return appState.currentPath;
  }

  export function resetInternalDragState() {
    appState.draggedItems = [];
    appState.isDragging = false;
  }



  export async function handleContextMenuCommand(commandId: string) {
    hideContextMenu();

    if (commandId === 'ctx-open') {
      await openSelected();
    } else if (commandId === 'ctx-open-with') {
      await openWithFlow();
    } else if (commandId === 'ctx-preview') {
      await showQuickLookFlow();
    } else if (commandId === 'ctx-compare') {
      await compareSelectedFilesFlow();
    } else if (commandId === 'ctx-terminal') {
      openTerminal(pathForPane()).catch(showError);
    } else if (commandId === 'ctx-powershell-admin') {
      openPowerShellAdmin(pathForPane()).catch(showError);
    } else if (commandId === 'ctx-color-label') {
      await showSetColorLabelFlow();
    } else if (commandId === 'ctx-folder-metrics') {
      await showFolderMetricsFlow();
    } else if (commandId === 'ctx-cleanup') {
      await showDiskCleanupFlow();
    } else if (commandId === 'ctx-rename') {
      await renameSelectedFlow();
    } else if (commandId === 'ctx-advanced-rename') {
      await showAdvancedRenameFlow();
    } else if (commandId === 'ctx-copy') {
      copySelection('copy');
    } else if (commandId === 'ctx-cut') {
      copySelection('cut');
    } else if (commandId === 'ctx-paste') {
      await pasteClipboard();
    } else if (commandId === 'ctx-copy-to-pane') {
      await copyOrMoveToOtherPane('copy');
    } else if (commandId === 'ctx-move-to-pane') {
      await copyOrMoveToOtherPane('move');
    } else if (commandId === 'ctx-pack') {
      await packIntoFolderFlow();
    } else if (commandId === 'ctx-unpack') {
      await unpackFolderFlow();
    } else if (commandId === 'ctx-compress') {
      await showCreateArchiveFlow();
    } else if (commandId === 'ctx-extract') {
      const entry = singleSelectedEntry();
      if (entry) {
        localState.currentArchivePath = entry.path;
        await extractArchiveFlow(pathForPane());
      }
    } else if (commandId === 'ctx-extract-folder') {
      const entry = singleSelectedEntry();
      if (entry) {
        localState.currentArchivePath = entry.path;
        await extractArchiveFlow(joinPath(pathForPane(), archiveExtractFolderNameForPath(entry.path)));
      }
    } else if (commandId === 'ctx-extract-to') {
      const entry = singleSelectedEntry();
      if (entry) {
        const destination = await selectDirectory(pathForPane());
        localState.currentArchivePath = entry.path;
        await extractArchiveFlow(destination);
      }
    } else if (commandId === 'ctx-delete') {
      await deleteSelectedFlow();
    } else if (commandId === 'ctx-info') {
      await showPropertiesFlow();
    }
  }

  export function setElementText(id: string, value: string) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  export function setElementDisplayById(id: string, display: string) {
    const element = document.getElementById(id) as HTMLElement | null;
    if (element) element.style.display = display;
  }

  export function setCheckbox(id: string, checked: boolean) {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.checked = checked;
  }

  export function setInputValue(id: string, value: string | number) {
    const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (input) input.value = String(value);
  }

  export function syncSettingsControls() {
    const settings = appState.settings || {};
    setInputValue('settings-theme', settings.theme || appState.theme || 'dark');
    setInputValue('settings-default-view', settings.defaultView || (appState.isGridView ? 'grid' : 'list'));
    setInputValue('settings-icon-size', settings.defaultIconSize || appState.iconSize || 64);
    setElementText('settings-icon-size-value', `${settings.defaultIconSize || appState.iconSize || 64}px`);
    setCheckbox('settings-show-hidden', Boolean(settings.showHidden));
    setCheckbox('settings-confirm-delete', settings.confirmDelete !== false);
    setCheckbox('settings-use-trash', settings.useTrash !== false);
    setCheckbox('settings-new-tab', Boolean(settings.openInNewTab));
    setCheckbox('settings-auto-collapse', Boolean(settings.autoCollapseTree));
    setCheckbox('settings-recent-locations', settings.showRecentLocations !== false);
    setCheckbox('settings-folder-sizes', settings.showFolderSizes !== false);
    setCheckbox('settings-git-integration', settings.enableGitIntegration !== false);
    setInputValue('settings-start-location', settings.startLocation || 'home');
    setInputValue('settings-custom-path', settings.customPath || '');
    setElementDisplayById('settings-custom-path-row', settings.startLocation === 'custom' ? 'grid' : 'none');

    const visibleColumns = new Set(settings.visibleColumns || ['size', 'date', 'type']);
    setCheckbox('settings-col-size', visibleColumns.has('size'));
    setCheckbox('settings-col-items', visibleColumns.has('items'));
    setCheckbox('settings-col-date', visibleColumns.has('date'));
    setCheckbox('settings-col-type', visibleColumns.has('type'));
    renderShortcutSettingsControls();
  }

  export function saveSettingsFromControls() {
    const visibleColumns = [
      ['settings-col-size', 'size'],
      ['settings-col-items', 'items'],
      ['settings-col-date', 'date'],
      ['settings-col-type', 'type'],
    ] satisfies Array<[string, ColumnId]>;
    const selectedVisibleColumns = visibleColumns
      .filter(([id]) => (document.getElementById(id) as HTMLInputElement | null)?.checked)
      .map(([, value]) => value);

    const iconSize = Number((document.getElementById('settings-icon-size') as HTMLInputElement | null)?.value || appState.iconSize || 64);
    const defaultViewValue = (document.getElementById('settings-default-view') as HTMLSelectElement | null)?.value;
    const defaultView: ViewMode = defaultViewValue === 'grid' ? 'grid' : 'list';
    appState.settings = {
      ...appState.settings,
      autoCollapseTree: (document.getElementById('settings-auto-collapse') as HTMLInputElement | null)?.checked || false,
      confirmDelete: (document.getElementById('settings-confirm-delete') as HTMLInputElement | null)?.checked !== false,
      customPath: (document.getElementById('settings-custom-path') as HTMLInputElement | null)?.value?.trim() || '',
      defaultIconSize: iconSize,
      defaultView,
      enableGitIntegration: (document.getElementById('settings-git-integration') as HTMLInputElement | null)?.checked !== false,
      openInNewTab: (document.getElementById('settings-new-tab') as HTMLInputElement | null)?.checked || false,
      showFolderSizes: (document.getElementById('settings-folder-sizes') as HTMLInputElement | null)?.checked !== false,
      showHidden: (document.getElementById('settings-show-hidden') as HTMLInputElement | null)?.checked || false,
      showRecentLocations: (document.getElementById('settings-recent-locations') as HTMLInputElement | null)?.checked !== false,
      startLocation: (document.getElementById('settings-start-location') as HTMLSelectElement | null)?.value || 'home',
      theme: (document.getElementById('settings-theme') as HTMLSelectElement | null)?.value || 'dark',
      useTrash: (document.getElementById('settings-use-trash') as HTMLInputElement | null)?.checked !== false,
      visibleColumns: selectedVisibleColumns,
    };
    appState.theme = appState.settings.theme;
    appState.isGridView = appState.settings.defaultView === 'grid';
    appState.iconSize = iconSize;
    appState.showHiddenFiles = Boolean(appState.settings.showHidden);
    document.documentElement.style.setProperty('--icon-size', `${iconSize}px`);
    applyTheme();
    saveSettings();
    applyEntryFilters();
    if (appState.dualPaneEnabled) applySecondaryEntryFilters();
    syncSettingsControls();
  }

  
  export async function updateToolStatus() {
    const checks = [
      { id: 'rar-status-text', check: checkRarInstalled },
      
      
    ];

    for (const item of checks) {
      const element = document.getElementById(item.id);
      if (!element) continue;
      element.textContent = 'Checking...';
      try {
        element.textContent = await item.check() ? 'Installed' : 'Not installed';
      } catch (error) {
        element.textContent = 'Unavailable';
        element.setAttribute('title', error instanceof Error ? error.message : String(error));
      }
    }

    try {
      setElementText('update-current-version', await getAppVersion());
    } catch {
      setElementText('update-current-version', 'Unavailable');
    }
  }

  export async function installToolFlow(
    label: string,
    install: () => Promise<string>,
    messageId: string,
  ) {
    const message = document.getElementById(messageId) as HTMLElement | null;
    if (message) {
      message.style.display = 'inline';
      message.textContent = `Installing ${label}...`;
    }

    try {
      const result = await install();
      if (message) message.textContent = result || `${label} installed.`;
      showSuccess(`${label} installed`);
      await updateToolStatus();
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : String(error);
      showError(error);
    }
  }

  function setInstallMessage(messageId: string, text: string) {
    const message = document.getElementById(messageId) as HTMLElement | null;
    if (message) {
      message.style.display = 'inline';
      message.textContent = text;
    }
    return message;
  }

  function rarInstallConfirmationBody(plan: RarInstallPlan) {
    const publisher = plan.publisher || 'Not applicable on this platform';
    return `
      <div class="rar-install-confirmation">
        <p>SimpleFile downloaded and verified the RAR installer before running it.</p>
        <dl class="metadata-list">
          <dt>Source</dt>
          <dd>${escapeHtml(plan.download_url)}</dd>
          <dt>File</dt>
          <dd>${escapeHtml(plan.file_name)}</dd>
          <dt>SHA-256</dt>
          <dd><code>${escapeHtml(plan.sha256)}</code></dd>
          <dt>Publisher</dt>
          <dd>${escapeHtml(publisher)}</dd>
          <dt>Staged installer</dt>
          <dd>${escapeHtml(plan.installer_path)}</dd>
        </dl>
      </div>
    `;
  }

  export async function installRarFlow(messageId: string) {
    setInstallMessage(messageId, 'Preparing verified RAR installer...');

    let plan: RarInstallPlan | null = null;
    try {
      plan = await prepareRarInstall();
      setInstallMessage(messageId, 'RAR installer verified. Waiting for confirmation...');

      const confirmed = await showHtmlDialog({
        bodyHtml: rarInstallConfirmationBody(plan),
        confirmText: 'Run Installer',
        title: 'Confirm RAR Installer',
      });

      if (!confirmed) {
        await discardRarInstall(plan.confirmation_token).catch(() => undefined);
        setInstallMessage(messageId, 'RAR installation cancelled.');
        return;
      }

      setInstallMessage(messageId, 'Installing RAR...');
      const result = await installRar(plan.confirmation_token);
      setInstallMessage(messageId, result || 'RAR installed.');
      showSuccess('RAR installed');
      await updateToolStatus();
    } catch (error) {
      if (plan) {
        await discardRarInstall(plan.confirmation_token).catch(() => undefined);
      }
      setInstallMessage(messageId, error instanceof Error ? error.message : String(error));
      showError(error);
    }
  }

  


  export async function showAboutFlow() {
    closeSettingsModal();
    openAboutUi(null);
    queueMicrotask(() => document.getElementById('about-close')?.focus());
    try {
      const info = await getAppAboutInfo();
      setAboutInfo(info);
    } catch (error) {
      closeAboutUi();
      showError(error);
    }
  }

  export async function checkForUpdatesFlow() {
    const status = document.getElementById('update-status-msg') as HTMLElement | null;
    if (status) {
      status.style.display = 'inline';
      status.textContent = 'Checking for updates...';
    }

    try {
      const update = await checkForUpdate();
      if (update) {
        if (status) status.textContent = `Version ${update.version} is available.`;
        setElementDisplayById('update-install-row', 'flex');
      } else {
        if (status) status.textContent = 'SimpleFile is up to date.';
        setElementDisplayById('update-install-row', 'none');
      }
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
      showError(error);
    }
  }

  export async function installUpdateFlow() {
    const status = document.getElementById('update-install-msg') as HTMLElement | null;
    if (status) {
      status.style.display = 'inline';
      status.textContent = 'Installing update...';
    }

    try {
      await installUpdate();
      if (status) status.textContent = 'Update installation started.';
      showSuccess('Update installation started');
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
      showError(error);
    }
  }
