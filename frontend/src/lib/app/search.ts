
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
    getFileMetadata,
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
import { escapeHtml } from "./core.js";
import { findEntry } from "../localCommandSelection.js";
import { showHtmlDialog, uniqueId, applyEntryFilters, selectPaths, updateStatusBar, selectedSetForPane, currentSelectionPaths, findSecondaryEntry, setElementText } from "./core.js";

  export function setSearchControlsVisible({ clear = false, cancel = false } = {}) {
    const clearBtn = document.getElementById('search-clear') as HTMLElement | null;
    const cancelBtn = document.getElementById('search-cancel') as HTMLElement | null;
    if (clearBtn) clearBtn.style.display = clear ? 'inline-flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = cancel ? 'inline-flex' : 'none';
  }

  export function renderSearchHeader() {
    if (!appState.searchMode) {
      clearSearchResultsHeader(document.querySelector('.search-results-header'));
      return;
    }

    const count = appState.searchResults?.length || 0;
    renderSearchResultsHeader(
      document.getElementById('file-list')?.parentElement,
      document.getElementById('file-list'),
      {
        clearLabel: 'Clear',
        label: `${count} result${count === 1 ? '' : 's'} for "${appState.searchQuery}"`,
        onClear: () => {
          void clearSearch();
        },
        onSave: () => {
          void saveCurrentSearchAsSmartFolderFlow();
        },
        saveLabel: 'Save Search',
      },
    );
  }

  export function searchOptionsToWorkflowOptions(options: SearchOptions): SearchWorkflowOptions {
    return {
      caseSensitive: options.case_sensitive,
      contentSearch: options.content_search,
      dateAfter: options.date_after ?? null,
      dateBefore: options.date_before ?? null,
      fileTypes: options.file_types ?? [],
      includeHidden: options.include_hidden,
      maxDepth: options.max_depth ?? null,
      maxResults: options.max_results ?? null,
      maxSize: options.max_size ?? null,
      minSize: options.min_size ?? null,
      searchPath: options.search_path,
    };
  }

  export function currentSearchOptionsForSmartFolder(): SearchOptions {
    return toSearchCommandOptions({
      currentPath: appState.currentPath,
      options: appState.searchOptions ?? {},
      query: appState.searchQuery,
      showHiddenFiles: appState.showHiddenFiles,
    });
  }

  export async function loadSmartFoldersFlow() {
    try {
      appState.smartFolders = await loadSmartFolders();
    } catch (error) {
      showError(error);
    }
  }

  export async function saveCurrentSearchAsSmartFolderFlow() {
    const query = String(appState.searchQuery || '').trim();
    if (!appState.searchMode || !query) {
      showError('Run a search before saving a smart folder.');
      return;
    }

    const result = await showHtmlDialog({
      bodyHtml: `
        <div class="form-group">
          <label class="form-label" for="smart-folder-name">Name</label>
          <input
            id="smart-folder-name"
            class="form-input input-full"
            autocomplete="off"
            value="${escapeHtml(query)}"
          >
        </div>
      `,
      confirmText: 'Save',
      onConfirm: () => (document.getElementById('smart-folder-name') as HTMLInputElement | null)?.value?.trim() || '',
      title: 'Save Smart Folder',
    });

    if (result === false) return;

    const name = typeof result === 'string' ? result.trim() : '';
    if (!name) {
      showError('Enter a smart folder name.');
      return;
    }

    const folder: SmartFolder = {
      icon: '\u2315',
      id: uniqueId('smart-folder'),
      name,
      search_options: currentSearchOptionsForSmartFolder(),
    };

    try {
      appState.smartFolders = await saveSmartFolder(folder);
      showSuccess(`Saved smart folder "${folder.name}"`);
    } catch (error) {
      showError(error);
    }
  }

  export async function openSmartFolderFlow(folder: SmartFolder | null | undefined) {
    const options = folder?.search_options;
    const query = String(options?.query || '').trim();
    if (!folder || !options || !query) {
      showError('This smart folder is missing search options.');
      return;
    }

    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (searchInput) searchInput.value = query;
    await runSearch(query, searchOptionsToWorkflowOptions(options));
  }

  export async function deleteSmartFolderFlow(id: string | null | undefined) {
    if (!id) return;

    const folder = (appState.smartFolders || []).find((item: SmartFolder) => item.id === id);
    try {
      appState.smartFolders = await deleteSmartFolder(id);
      showSuccess(folder ? `Removed smart folder "${folder.name}"` : 'Removed smart folder');
    } catch (error) {
      showError(error);
    }
  }

  export function restoreDirectoryEntriesAfterSearch() {
    if (appState._savedEntries) {
      appState.entries = appState._savedEntries;
    }
    appState._savedEntries = null;
  }

  export async function clearSearch() {
    if (appState.currentSearchId) {
      try {
        await cancelSearch(appState.currentSearchId);
      } catch {
        // The backend may already have finished the search.
      }
    }

    appState.currentSearchId = null;
    appState.isSearching = false;
    appState.searchMode = false;
    appState.searchQuery = '';
    appState.searchResults = [];
    appState.searchOptions = null;
    restoreDirectoryEntriesAfterSearch();
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (input) input.value = '';
    setSearchControlsVisible();
    clearSearchResultsHeader(document.querySelector('.search-results-header'));
    applyEntryFilters();
    selectPaths([]);
  }

  export async function runSearch(query: string, options: SearchWorkflowOptions = {}) {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      await clearSearch();
      return;
    }

    const searchId = `search-${Date.now()}`;
    if (!appState.searchMode) {
      appState._savedEntries = appState.entries;
    }

    appState.currentSearchId = searchId;
    appState.searchQuery = cleanQuery;
    appState.searchOptions = { ...options };
    appState.searchMode = true;
    appState.isSearching = true;
    appState.filterQuery = '';
    appState.selectedEntries = new Set();
    rememberRecentSearch(cleanQuery);
    setSearchControlsVisible({ clear: true, cancel: true });

    try {
      const results = await searchFiles(toSearchCommandOptions({
        currentPath: appState.currentPath,
        options,
        query: cleanQuery,
        searchId,
        showHiddenFiles: appState.showHiddenFiles,
      }));
      if (appState.currentSearchId !== searchId) return;

      const entries = results.map(searchResultToFileEntry);
      appState.searchResults = results;
      appState.entries = entries;
      appState.filteredEntries = visibleEntries(entries, {
        showHidden: appState.showHiddenFiles,
        sortAsc: appState.sortAsc,
        sortBy: appState.sortBy,
      });
      updateStatusBar();
      renderSearchHeader();
    } catch (error) {
      showError(error);
    } finally {
      if (appState.currentSearchId === searchId) {
        appState.currentSearchId = null;
        appState.isSearching = false;
        setSearchControlsVisible({ clear: true, cancel: false });
      }
    }
  }

  export async function openAdvancedSearchFlow() {
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    const result = await showHtmlDialog({
      bodyHtml: renderAdvancedSearchDialog({
        escapeHtml,
        includeHidden: appState.showHiddenFiles,
        initialQuery: searchInput?.value || appState.searchQuery || '',
        recentSearches: getRecentSearches(),
      }),
      confirmText: 'Search',
      onConfirm: () => ({
        options: readAdvancedSearchOptions(document),
        query: (document.getElementById('advanced-search-query') as HTMLInputElement | null)?.value?.trim() || '',
      }),
      title: 'Advanced Search',
    });
    if (!result || typeof result !== 'object') return;

    const { options, query } = result as { options: SearchWorkflowOptions; query: string };
    if (searchInput) searchInput.value = query;
    await runSearch(query, options);
  }

  function documentKindForExtension(extension: string) {
    const documentKinds: Record<string, string> = {
      csv: 'CSV spreadsheet',
      doc: 'Word document',
      docx: 'Word document',
      md: 'Markdown document',
      odp: 'Presentation',
      ods: 'Spreadsheet',
      odt: 'Text document',
      pdf: 'PDF document',
      ppt: 'PowerPoint presentation',
      pptx: 'PowerPoint presentation',
      rtf: 'Rich Text document',
      txt: 'Text document',
      xls: 'Excel spreadsheet',
      xlsx: 'Excel spreadsheet',
    };
    return documentKinds[extension] || '';
  }

  function copyablePropertyValue(id: string, value: unknown, className = '') {
    return `
      <span class="prop-value-row">
        <span class="prop-value ${escapeHtml(className)}" id="${escapeHtml(id)}">${escapeHtml(value)}</span>
        <button class="btn btn-secondary btn-sm prop-copy-btn" type="button" data-index="${escapeHtml(id)}" title="Copy" aria-label="Copy value">Copy</button>
      </span>
    `;
  }

  async function copyTextToClipboard(text: string) {
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

  export async function showPropertiesFlow() {
    const activePane = appState.activePane as PaneId;
    if (selectedSetForPane(activePane).size !== 1) return;
    const selectedPath = currentSelectionPaths()[0];
    const fallbackEntry = activePane === 'secondary' ? findSecondaryEntry(selectedPath) : findEntry(appState, selectedPath);
    if (!selectedPath || !fallbackEntry) return;

    try {
      const info = await getEntryInfo(selectedPath).catch(() => fallbackEntry);
      const extension = String(info.extension || info.name.split('.').pop() || '').toLowerCase();
      const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff']);
      const isImage = !info.is_dir && imageExts.has(extension);
      const richMetadataExts = new Set([
        ...imageExts,
        'pdf',
        'mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'aiff', 'aif', 'wma', 'wv', 'ape',
        'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv',
        'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp',
      ]);
      const wantsRichMetadata = !info.is_dir && richMetadataExts.has(extension);
      const documentKind = !info.is_dir ? documentKindForExtension(extension) : '';
      const gitStatus = info.git_status || fallbackEntry.git_status || '';
      const documentKindRow = documentKind
        ? `<span class="prop-label">Document</span><span class="prop-value">${escapeHtml(documentKind)}</span>`
        : '';
      const extensionRow = !info.is_dir && extension
        ? `<span class="prop-label">Extension</span><span class="prop-value">${escapeHtml(extension)}</span>`
        : '';
      const gitRow = gitStatus
        ? `<span class="prop-label">Git State</span>${copyablePropertyValue('prop-git-state', gitStatus)}`
        : '';
      const permissionsRow = info.permissions
        ? `<span class="prop-label">Permissions</span><span class="prop-value prop-permissions">${escapeHtml(info.permissions)}</span>`
        : '';
      const symlinkRow = info.is_symlink
        ? `<span class="prop-label">Symlink target</span>${copyablePropertyValue('prop-symlink-target', info.symlink_target || '(unknown)')}`
        : '';
      const checksumRows = info.is_dir ? '' : `
          <span class="prop-label">MD5</span>${copyablePropertyValue('prop-md5', 'Computing...', 'prop-hash')}
          <span class="prop-label">SHA-1</span>${copyablePropertyValue('prop-sha1', 'Computing...', 'prop-hash')}
          <span class="prop-label">SHA-256</span>${copyablePropertyValue('prop-sha256', 'Computing...', 'prop-hash')}
        `;
      const imageRows = isImage ? `
          <span class="prop-label">Dimensions</span><span class="prop-value" id="prop-dimensions">Computing...</span>
          <span class="prop-label">EXIF</span><span class="prop-value" id="prop-exif">Computing...</span>
        ` : '';
      const richMetadataRows = wantsRichMetadata && !isImage ? `
          <span class="prop-label">Details</span><span class="prop-value" id="prop-summary">Computing...</span>
          <span class="prop-label">Metadata</span><span class="prop-value" id="prop-file-metadata">Computing...</span>
        ` : '';

      const dialogPromise = showHtmlDialog({
        bodyHtml: `
          <div class="properties-grid">
            <span class="prop-label">Name</span><span class="prop-value">${escapeHtml(info.name)}</span>
            <span class="prop-label">Path</span>${copyablePropertyValue('prop-path', info.path)}
            <span class="prop-label">Type</span><span class="prop-value">${escapeHtml(fileType(info))}</span>
            ${extensionRow}
            ${documentKindRow}
            <span class="prop-label">Size</span><span class="prop-value">${escapeHtml(formatFileSize(info.size, info.is_dir) || 'Folder')}</span>
            <span class="prop-label">Modified</span><span class="prop-value">${escapeHtml(formatModified(info.modified))}</span>
            ${gitRow}
            ${permissionsRow}
            ${symlinkRow}
            ${imageRows}
            ${richMetadataRows}
            ${checksumRows}
          </div>
        `,
        confirmText: 'Close',
        showCancel: false,
        title: 'Properties',
      });

      const modalBody = document.getElementById('modal-body');
      const handlePropertyCopy = (event: MouseEvent) => {
        const button = event.target instanceof HTMLElement
          ? event.target.closest<HTMLButtonElement>('.prop-copy-btn')
          : null;
        const valueId = button?.dataset.index || '';
        const value = valueId ? document.getElementById(valueId)?.textContent?.trim() || '' : '';
        if (!button || !value || value === 'Computing...') return;
        event.preventDefault();
        copyTextToClipboard(value)
          .then(() => showSuccess('Copied detail'))
          .catch(showError);
      };
      modalBody?.addEventListener('click', handlePropertyCopy);

      if (!info.is_dir) {
        computeChecksum(info.path).then((hashes) => {
          setElementText('prop-md5', hashes.md5);
          setElementText('prop-sha1', hashes.sha1);
          setElementText('prop-sha256', hashes.sha256);
        }).catch(() => {
          setElementText('prop-md5', 'Unavailable');
          setElementText('prop-sha1', 'Unavailable');
          setElementText('prop-sha256', 'Unavailable');
        });
      }

      if (isImage) {
        getImageMetadata(info.path).then((meta) => {
          setElementText('prop-dimensions', `${meta.width} x ${meta.height}`);
          const exifElement = document.getElementById('prop-exif');
          if (!exifElement) return;

          if (!Array.isArray(meta.exif) || meta.exif.length === 0) {
            exifElement.textContent = 'None';
            return;
          }

          const grid = document.createElement('div');
          grid.className = 'exif-grid';
          for (const [tag, value] of meta.exif) {
            const tagElement = document.createElement('span');
            tagElement.className = 'exif-tag';
            tagElement.textContent = tag;
            const valueElement = document.createElement('span');
            valueElement.className = 'exif-value';
            valueElement.textContent = value;
            grid.append(tagElement, valueElement);
          }
          exifElement.replaceChildren(grid);
        }).catch(() => {
          setElementText('prop-dimensions', 'Unavailable');
          setElementText('prop-exif', 'Unavailable');
        });
      } else if (wantsRichMetadata) {
        getFileMetadata(info.path).then((meta) => {
          setElementText('prop-summary', meta.summary || meta.kind || 'None');
          const host = document.getElementById('prop-file-metadata');
          if (!host) return;

          if (!Array.isArray(meta.fields) || meta.fields.length === 0) {
            host.textContent = 'None';
            return;
          }

          const grid = document.createElement('div');
          grid.className = 'exif-grid';
          for (const [label, value] of meta.fields) {
            const labelElement = document.createElement('span');
            labelElement.className = 'exif-tag';
            labelElement.textContent = label;
            const valueElement = document.createElement('span');
            valueElement.className = 'exif-value';
            valueElement.textContent = value;
            grid.append(labelElement, valueElement);
          }
          host.replaceChildren(grid);
        }).catch((error) => {
          const message = error instanceof Error ? error.message : 'Unavailable';
          setElementText('prop-summary', message);
          setElementText('prop-file-metadata', 'Unavailable');
        });
      }

      try {
        await dialogPromise;
      } finally {
        modalBody?.removeEventListener('click', handlePropertyCopy);
      }
    } catch (error) {
      showError(error);
    }
  }

  export function resetSearchStateForNavigation() {
    appState.currentSearchId = null;
    appState.isSearching = false;
    appState.searchMode = false;
    appState.searchQuery = '';
    appState.searchResults = [];
    appState.searchOptions = null;
    appState._savedEntries = null;
    setSearchControlsVisible();
    clearSearchResultsHeader(document.querySelector('.search-results-header'));
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (input) input.value = '';
  }
