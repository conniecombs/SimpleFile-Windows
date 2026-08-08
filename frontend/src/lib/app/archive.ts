
import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, removeBookmark, saveSettings, saveTabs, state as appState } from '../../vanilla-js/runtime/state.svelte';
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
    installRar,
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
  import type {
    ArchiveFormat,
    ArchiveInfo,
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
import {
  closeArchiveViewer,
  closeCreateArchiveUi,
  openCreateArchiveUi,
  showArchiveViewer,
} from './archiveUi.svelte';
import { singleSelectedEntry, pathForPane, refreshSecondaryPane, refreshCurrentDirectory, selectedFileEntries, showHtmlDialog, openEntryPath, runWithOperationLog, escapeHtml } from "./core.js";

const archiveExtensions = new Set(['zip', 'tar', 'tgz', 'gz', 'rar']);

  export function extensionForPath(path: string) {
    const name = basename(path).toLowerCase();
    if (name.endsWith('.tar.gz')) return 'tar.gz';
    const dotIndex = name.lastIndexOf('.');
    return dotIndex >= 0 ? name.slice(dotIndex + 1) : '';
  }

  export function archiveFormatForPath(path: string): ArchiveFormat {
    const extension = extensionForPath(path);
    if (extension === 'tgz') return 'tar.gz';
    if (extension === 'tar.gz') return 'tar.gz';
    if (extension === 'tar') return 'tar';
    if (extension === 'rar') return 'rar';
    return 'zip';
  }

  export function isArchiveEntry(entry: FileEntry | null | undefined) {
    if (!entry || entry.is_dir) return false;
    return archiveExtensions.has(extensionForPath(entry.path));
  }

  export function archiveExtensionForFormat(format: string) {
    return format === 'tar.gz' ? 'tar.gz' : format;
  }

  export function normalizeArchiveFileName(name: string, format: ArchiveFormat) {
    const trimmed = name.trim() || `archive.${archiveExtensionForFormat(format)}`;
    const extension = archiveExtensionForFormat(format);
    return trimmed.toLowerCase().endsWith(`.${extension}`) ? trimmed : `${trimmed}.${extension}`;
  }

  export function archiveExtractFolderNameForPath(path: string) {
    const name = basename(path).trim();
    const extension = extensionForPath(path);
    const suffix = extension ? `.${extension}` : '';
    if (suffix && name.toLowerCase().endsWith(suffix)) {
      return name.slice(0, -suffix.length) || name;
    }

    const dotIndex = name.lastIndexOf('.');
    return dotIndex > 0 ? name.slice(0, dotIndex) : name;
  }

  export function closeArchiveFlow() {
    closeArchiveViewer();
    localState.currentArchivePath = null;
  }

  function renderExtractArchivePreflight(info: ArchiveInfo, targetDirectory: PathString) {
    const safeRows = info.entries.slice(0, 8).map((entry) => `
      <li title="${escapeHtml(entry.path || entry.name)}">${escapeHtml(entry.path || entry.name)}</li>
    `).join('');
    const safeExtra = info.entries.length > 8
      ? `<p class="settings-section-hint">And ${info.entries.length - 8} more safe entr${info.entries.length - 8 === 1 ? 'y' : 'ies'}.</p>`
      : '';
    const unsafeRows = (info.unsafe_entries || []).slice(0, 5).map((entry) => `
      <li title="${escapeHtml(entry)}">${escapeHtml(entry)}</li>
    `).join('');
    const unsafeExtra = (info.unsafe_entries || []).length > 5
      ? `<p class="settings-section-hint">And ${(info.unsafe_entries || []).length - 5} more skipped unsafe name${(info.unsafe_entries || []).length - 5 === 1 ? '' : 's'}.</p>`
      : '';

    return `
      <div class="preflight-summary">
        <dl class="preflight-detail-list">
          <div><dt>Archive</dt><dd title="${escapeHtml(info.path)}">${escapeHtml(basename(info.path))}</dd></div>
          <div><dt>Destination</dt><dd title="${escapeHtml(targetDirectory)}">${escapeHtml(targetDirectory)}</dd></div>
          <div><dt>Safe Entries</dt><dd>${info.entries.length}</dd></div>
          <div><dt>Expanded Size</dt><dd>${escapeHtml(formatFileSize(info.total_size || 0))}</dd></div>
        </dl>
        ${(info.unsafe_entries || []).length > 0
          ? `<div class="preflight-warning">
              <strong>${(info.unsafe_entries || []).length} unsafe name${(info.unsafe_entries || []).length === 1 ? '' : 's'} will be skipped.</strong>
              <ul class="preflight-item-list">${unsafeRows}</ul>
              ${unsafeExtra}
            </div>`
          : ''}
        ${safeRows ? `<ul class="preflight-item-list">${safeRows}</ul>${safeExtra}` : '<p class="placeholder-msg">No safe entries were found.</p>'}
      </div>
    `;
  }

  export async function showArchiveContentsFlow(entry = singleSelectedEntry()) {
    if (!isArchiveEntry(entry)) {
      showError('Select a ZIP, TAR, TAR.GZ, or RAR archive.');
      return;
    }

    if (!entry) {
      showError('Archive viewer is unavailable.');
      return;
    }

    try {
      const info = await listArchive(entry.path);
      localState.currentArchivePath = entry.path;
      showArchiveViewer({
        archivePath: info.path,
        compressedSize: info.compressed_size,
        entries: info.entries,
        format: info.format,
        title: `Archive: ${entry.name}`,
        totalSize: info.total_size,
        unsafeEntries: info.unsafe_entries || [],
      });
    } catch (error) {
      showError(error);
    }
  }

  export async function extractArchiveFlow(destination: PathString | null = pathForPane()) {
    if (!localState.currentArchivePath) {
      const entry = singleSelectedEntry();
      if (!isArchiveEntry(entry) || !entry) {
        showError('Select an archive to extract.');
        return;
      }
      localState.currentArchivePath = entry.path;
    }

    const targetDirectory = destination || appState.currentPath;
    if (!targetDirectory) return;

    const archivePath = localState.currentArchivePath;
    if (!archivePath) return;

    try {
      const info = await listArchive(archivePath);
      const confirmed = await showHtmlDialog({
        bodyHtml: renderExtractArchivePreflight(info, targetDirectory),
        confirmText: 'Extract',
        title: 'Extract Archive',
      });
      if (confirmed === false) return;

      await runWithOperationLog({
        action: 'extract-archive',
        detail: `To ${targetDirectory}`,
        item: basename(archivePath),
        itemCount: info.entries.length,
        retry: {
          kind: 'extract-archive',
          archivePath,
          targetDirectory,
        },
        target: targetDirectory,
        title: 'Extracting Archive',
      }, async () => {
        await extractArchive(archivePath, targetDirectory);
      });
      showSuccess(`Extracted ${basename(archivePath)}`);
      closeArchiveFlow();
      if (appState.activePane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      showError(error);
    }
  }

  export async function showCreateArchiveFlow(defaultFormat: ArchiveFormat = 'zip') {
    const selectedEntries = selectedFileEntries();
    if (selectedEntries.length === 0) {
      showError('Select files or folders to compress.');
      return;
    }

    const selectedPaths = selectedEntries.map((entry: FileEntry) => entry.path);
    const activePane = appState.activePane as PaneId;
    const archiveDirectory = pathForPane(activePane);
    const defaultName = normalizeArchiveFileName(
      selectedEntries.length === 1 ? `${selectedEntries[0].name}-archive` : 'archive',
      defaultFormat,
    );

    openCreateArchiveUi({
      defaultName,
      format: defaultFormat,
      selectedNames: selectedEntries.map((entry: FileEntry) => entry.name),
      selectedPaths,
      targetDirectory: archiveDirectory,
    });
  }

  export async function confirmCreateArchiveFlow(detail: {
    format?: ArchiveFormat;
    name?: string;
    selectedPaths?: PathString[];
    targetDirectory?: PathString;
  } = {}) {
    const format = (detail.format || 'zip') as ArchiveFormat;
    const selectedPaths = detail.selectedPaths || [];
    const archiveDirectory = detail.targetDirectory || pathForPane();
    if (selectedPaths.length === 0 || !archiveDirectory) {
      showError('Select files or folders to compress.');
      closeCreateArchiveUi();
      return;
    }

    const archiveName = normalizeArchiveFileName(detail.name || 'archive', format);
    const archivePath = joinPath(archiveDirectory, archiveName);
    const activePane = appState.activePane as PaneId;
    closeCreateArchiveUi();

    try {
      await runWithOperationLog({
        action: 'create-archive',
        detail: `From ${selectedPaths.length} selected item${selectedPaths.length === 1 ? '' : 's'}`,
        item: archiveName,
        itemCount: selectedPaths.length,
        retry: {
          kind: 'create-archive',
          archivePath,
          format,
          sourcePaths: [...selectedPaths],
        },
        target: archivePath,
        title: 'Creating Archive',
      }, async () => {
        await createArchive(selectedPaths, archivePath, format);
      });
      showSuccess(`Created ${archiveName}`);
      if (activePane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      showError(error);
    }
  }
