
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
  import { clearSettingsBody, renderSettingsBody } from '../components/settings-body';
  import { showError, showSuccess } from '../components/toasts';
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
import { setOverlayVisible, singleSelectedEntry, overlayById, setElementText, pathForPane, runWithProgress, refreshSecondaryPane, refreshCurrentDirectory, selectedFileEntries, showHtmlDialog, openEntryPath } from "./core.js";

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
    setOverlayVisible('archive-overlay', false);
    localState.currentArchivePath = null;
  }

  export async function showArchiveContentsFlow(entry = singleSelectedEntry()) {
    if (!isArchiveEntry(entry)) {
      showError('Select a ZIP, TAR, TAR.GZ, or RAR archive.');
      return;
    }

    const overlay = overlayById('archive-overlay');
    if (!overlay || !entry) {
      showError('Archive viewer is unavailable.');
      return;
    }

    try {
      const info = await listArchive(entry.path);
      localState.currentArchivePath = entry.path;
      setElementText('archive-title', `Archive: ${entry.name}`);
      renderArchiveInfo(document.getElementById('archive-info'), {
        archivePath: info.path,
        compressedSize: info.compressed_size,
        entries: info.entries,
        format: info.format,
        totalSize: info.total_size,
      });
      renderArchiveContents(document.getElementById('archive-list'), {
        entries: info.entries,
      });
      overlay.classList.add('visible');
      overlay.querySelector<HTMLElement>('#archive-close')?.focus();
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
      await runWithProgress('Extracting Archive', basename(archivePath), async () => {
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

    const dialogPromise = showHtmlDialog({
      bodyHtml: '<div id="create-archive-stage5-host"></div>',
      confirmText: 'Create',
      onConfirm: () => {
        const nameInput = document.getElementById('archive-name') as HTMLInputElement | null;
        const formatSelect = document.getElementById('archive-format') as HTMLSelectElement | null;
        const format = (formatSelect?.value || defaultFormat) as ArchiveFormat;
        const archiveName = normalizeArchiveFileName(nameInput?.value || defaultName, format);
        const archivePath = joinPath(archiveDirectory, archiveName);
        void (async () => {
          try {
            await runWithProgress('Creating Archive', archiveName, async () => {
              await createArchive(selectedPaths, archivePath, format);
            });
            showSuccess(`Created ${archiveName}`);
            if (activePane === 'secondary') await refreshSecondaryPane();
            else await refreshCurrentDirectory();
          } catch (error) {
            showError(error);
          }
        })();
        return true;
      },
      title: 'Create Archive',
    });

    renderCreateArchiveBody(document.getElementById('create-archive-stage5-host'), {
      defaultName,
      format: defaultFormat,
      selectedNames: selectedEntries.map((entry: FileEntry) => entry.name),
    });
    await dialogPromise;
  }
