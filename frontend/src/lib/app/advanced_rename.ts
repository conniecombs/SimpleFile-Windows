
import { onMount } from 'svelte';
  // @ts-ignore
  import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, removeBookmark, saveSettings, saveTabs, state as appState } from '../../vanilla-js/runtime/state.svelte.js';
  // @ts-ignore
  import { resolveStartupLocation } from '../../vanilla-js/runtime/startup-location.js';
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

  import { legacyOverlayMarkup } from '../components/legacy-overlays';
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
import { extensionForPath } from "./archive.js";
import { setElementText, setOverlayVisible, runWithProgress, refreshCurrentDirectory, applyPersistedViewSettings, showDialog, overlayById, refreshSecondaryPane, selectedFileEntries } from "./core.js";

  type AdvancedRenameTarget = {
    entry: FileEntry;
    index: number;
    parentPath: PathString;
  };

  export function inputChecked(id: string) {
    return Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
  }

  export function inputString(id: string, fallback = '') {
    return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? fallback;
  }

  export function splitFileName(name: string) {
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex <= 0) {
      return { base: name, ext: '' };
    }

    return {
      base: name.slice(0, dotIndex),
      ext: name.slice(dotIndex + 1),
    };
  }

  export function joinFileName(base: string, ext: string) {
    return ext ? `${base}.${ext.replace(/^\./, '')}` : base;
  }

  export function transformNamePart(name: string, transform: (value: string) => string) {
    const applyPart = inputString('adv-apply-part', 'full');
    const { base, ext } = splitFileName(name);

    if (applyPart === 'base') {
      return joinFileName(transform(base), ext);
    }

    if (applyPart === 'extension') {
      return joinFileName(base, transform(ext).replace(/^\./, ''));
    }

    return transform(name);
  }

  export function replaceWithOptions(value: string, find: string, replacement: string, regex: boolean, caseSensitive: boolean) {
    if (!find) return value;

    if (regex) {
      const flags = caseSensitive ? 'g' : 'gi';
      return value.replace(new RegExp(find, flags), replacement);
    }

    if (caseSensitive) {
      return value.split(find).join(replacement);
    }

    return value.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replacement);
  }

  export function capitalizeValue(value: string, mode: string) {
    if (mode === 'upper') return value.toUpperCase();
    if (mode === 'lower') return value.toLowerCase();
    if (mode === 'words' || mode === 'title') {
      return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
    }
    if (mode === 'sentence') {
      const lower = value.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  export function insertValue(name: string, value: string, position: string, indexValue: number) {
    if (!value) return name;
    const { base, ext } = splitFileName(name);

    if (position === 'prefix') return `${value}${name}`;
    if (position === 'suffix') return `${name}${value}`;
    if (position === 'before-ext') return joinFileName(`${base}${value}`, ext);

    const index = Math.max(0, Math.min(name.length, indexValue));
    return `${name.slice(0, index)}${value}${name.slice(index)}`;
  }

  export function numberedValue(name: string, numberText: string, position: string, separator: string) {
    const { base, ext } = splitFileName(name);
    if (position === 'replace') return joinFileName(numberText, ext);
    if (position === 'prefix') return `${numberText}${separator}${name}`;
    if (position === 'suffix') return `${name}${separator}${numberText}`;
    return joinFileName(`${base}${separator}${numberText}`, ext);
  }

  export function sanitizeFileName(name: string, replacement: string) {
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, replacement || '_').trim();
  }

  export function templateName(pattern: string, entry: FileEntry, index: number) {
    const { base, ext } = splitFileName(entry.name);
    const parent = basename(getParentPath(entry.path) || '');
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const start = Number(inputString('adv-number-start', '1')) || 1;
    const step = Number(inputString('adv-number-step', '1')) || 1;
    const width = Math.max(1, Number(inputString('adv-number-pad', '3')) || 3);
    const n = String(start + index * step).padStart(width, '0');

    return [
      ['{base}', base],
      ['{ext}', ext],
      ['{name}', entry.name],
      ['{parent}', parent],
      ['{n}', n],
      ['{yyyy}', String(now.getFullYear())],
      ['{mm}', pad(now.getMonth() + 1)],
      ['{dd}', pad(now.getDate())],
      ['{hh}', pad(now.getHours())],
      ['{min}', pad(now.getMinutes())],
      ['{ss}', pad(now.getSeconds())],
      ['{date}', `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`],
      ['{time}', `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`],
    ].reduce((next, [token, value]) => next.split(token).join(value), pattern);
  }

  export function passesAdvancedFilter(entry: FileEntry) {
    if (!inputChecked('adv-filter-enabled')) return true;

    const filterText = inputString('adv-filter-text').trim();
    const extensions = inputString('adv-filter-extensions')
      .split(',')
      .map((value) => value.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean);

    let matchesName = true;
    if (filterText) {
      if (inputChecked('adv-filter-regex')) {
        const flags = inputChecked('adv-filter-case') ? '' : 'i';
        matchesName = new RegExp(filterText, flags).test(entry.name);
      } else if (inputChecked('adv-filter-case')) {
        matchesName = entry.name.includes(filterText);
      } else {
        matchesName = entry.name.toLowerCase().includes(filterText.toLowerCase());
      }
    }

    if (inputChecked('adv-filter-invert')) {
      matchesName = !matchesName;
    }

    if (extensions.length > 0) {
      matchesName = matchesName && extensions.includes(extensionForPath(entry.name).replace('tar.gz', 'gz'));
    }

    return matchesName;
  }

  export function buildAdvancedName(entry: FileEntry, index: number) {
    let name = entry.name;

    if (inputChecked('adv-template-enabled')) {
      const rendered = templateName(inputString('adv-template-pattern', '{base}_{n}'), entry, index);
      const keepExtension = inputChecked('adv-template-keep-ext');
      const { ext } = splitFileName(entry.name);
      name = keepExtension && ext && !rendered.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
        ? joinFileName(rendered, ext)
        : rendered;
    }

    if (inputChecked('adv-remove-enabled')) {
      name = transformNamePart(name, (value) => replaceWithOptions(
        value,
        inputString('adv-remove-string'),
        '',
        inputChecked('adv-remove-regex'),
        inputChecked('adv-remove-case'),
      ));
    }

    if (inputChecked('adv-replace-enabled')) {
      name = transformNamePart(name, (value) => replaceWithOptions(
        value,
        inputString('adv-replace-find'),
        inputString('adv-replace-with'),
        inputChecked('adv-replace-regex'),
        inputChecked('adv-replace-case'),
      ));
    }

    if (inputChecked('adv-trim-enabled')) {
      const mode = inputString('adv-trim-mode', 'both');
      name = transformNamePart(name, (value) => {
        let next = value;
        if (mode === 'start' || mode === 'both') next = next.replace(/^\s+/, '');
        if (mode === 'end' || mode === 'both') next = next.replace(/\s+$/, '');
        if (inputChecked('adv-trim-collapse')) next = next.replace(/\s+/g, ' ');
        return next;
      });
    }

    if (inputChecked('adv-add-enabled')) {
      name = insertValue(
        name,
        inputString('adv-add-string'),
        inputString('adv-add-position', 'prefix'),
        Number(inputString('adv-add-index', '0')) || 0,
      );
    }

    if (inputChecked('adv-capitalize-enabled')) {
      name = transformNamePart(name, (value) => capitalizeValue(value, inputString('adv-capitalize-mode', 'first')));
    }

    if (inputChecked('adv-separator-enabled')) {
      const mode = inputString('adv-separator-mode', 'spaces-to-dashes');
      name = transformNamePart(name, (value) => {
        let next = value;
        if (mode === 'spaces-to-dashes') next = next.replace(/\s+/g, '-');
        if (mode === 'spaces-to-underscores') next = next.replace(/\s+/g, '_');
        if (mode === 'underscores-to-spaces') next = next.replace(/_+/g, ' ');
        if (mode === 'dashes-to-spaces') next = next.replace(/-+/g, ' ');
        if (mode === 'dots-to-spaces') next = next.replace(/\.+/g, ' ');
        if (inputChecked('adv-separator-collapse')) {
          next = next.replace(/([ _.-])\1+/g, '$1');
        }
        return next;
      });
    }

    if (inputChecked('adv-number-enabled')) {
      const start = Number(inputString('adv-number-start', '1')) || 1;
      const step = Number(inputString('adv-number-step', '1')) || 1;
      const width = Math.max(1, Number(inputString('adv-number-pad', '3')) || 3);
      const numberText = String(start + index * step).padStart(width, '0');
      name = numberedValue(
        name,
        numberText,
        inputString('adv-number-position', 'suffix'),
        inputString('adv-number-separator', '_'),
      );
    }

    if (inputChecked('adv-extension-enabled')) {
      const { base, ext } = splitFileName(name);
      const mode = inputString('adv-extension-mode', 'lower');
      if (mode === 'lower') name = joinFileName(base, ext.toLowerCase());
      if (mode === 'upper') name = joinFileName(base, ext.toUpperCase());
      if (mode === 'set') name = joinFileName(base, inputString('adv-extension-custom').replace(/^\./, ''));
      if (mode === 'remove') name = base;
    }

    if (inputChecked('adv-sanitize-enabled')) {
      name = sanitizeFileName(name, inputString('adv-sanitize-replacement', '_'));
    }

    return name;
  }

  export async function collectAdvancedRenameTargets() {
    const selectedEntries = selectedFileEntries();
    const includeRecursive = inputChecked('adv-scope-recursive');
    const includeHidden = inputChecked('adv-scope-hidden');
    const targets: AdvancedRenameTarget[] = [];
    const seen = new Set<PathString>();

    async function addEntry(entry: FileEntry, index: number) {
      if (seen.has(entry.path)) return;
      if (!includeHidden && entry.name.startsWith('.')) return;
      seen.add(entry.path);
      targets.push({
        entry,
        index,
        parentPath: getParentPath(entry.path) || appState.currentPath,
      });

      if (includeRecursive && entry.is_dir) {
        try {
          const listing = await listDirectory(entry.path);
          for (const child of listing.entries) {
            await addEntry(child, targets.length);
          }
        } catch {
          // Keep the dialog usable even when one subtree cannot be read.
        }
      }
    }

    for (const entry of selectedEntries) {
      await addEntry(entry, targets.length);
    }

    return targets;
  }

  export async function refreshAdvancedRenamePreview() {
    const preview = document.getElementById('adv-rename-preview');
    const overlay = overlayById('advanced-rename-overlay');
    if (!preview || !overlay?.classList.contains('visible')) return;

    renderAdvancedRenamePreview(preview, {
      message: 'Building preview...',
      mode: 'loading',
    });

    try {
      localState.advancedRenameTargets = await collectAdvancedRenameTargets();
      const duplicateKeys = new Map<string, number>();
      localState.advancedRenamePlans = localState.advancedRenameTargets
        .filter(({ entry }) => passesAdvancedFilter(entry))
        .map(({ entry, index, parentPath }) => {
          const newName = buildAdvancedName(entry, index);
          const key = `${parentPath.toLowerCase()}\0${newName.toLowerCase()}`;
          duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
          return {
            changed: newName !== entry.name,
            detail: parentPath,
            newName,
            oldName: entry.name,
            parentPath,
            path: entry.path,
          };
        })
        .map((plan) => {
          const key = `${plan.parentPath.toLowerCase()}\0${plan.newName.toLowerCase()}`;
          let error: string | null = null;
          if (!plan.newName || plan.newName === '.' || plan.newName === '..') {
            error = 'Invalid empty file name';
          } else if (!isValidFileName(plan.newName)) {
            error = 'Invalid file name';
          } else if ((duplicateKeys.get(key) || 0) > 1) {
            error = 'Duplicate target name';
          }
          return { ...plan, error };
        });

      const rows = localState.advancedRenamePlans.slice(0, 500).map((plan) => ({
        changed: plan.changed,
        detail: plan.detail,
        error: plan.error,
        newName: plan.newName,
        oldName: plan.oldName,
      }));

      renderAdvancedRenamePreview(preview, {
        extraCount: Math.max(0, localState.advancedRenamePlans.length - rows.length),
        limit: 500,
        message: localState.advancedRenamePlans.length === 0 ? 'No matching files.' : '',
        mode: localState.advancedRenamePlans.length === 0 ? 'empty' : 'rows',
        rows,
        totalRows: localState.advancedRenamePlans.length,
      });

      setElementText('adv-rename-summary', `${localState.advancedRenamePlans.length} target${localState.advancedRenamePlans.length === 1 ? '' : 's'} ready.`);
    } catch (error) {
      renderAdvancedRenamePreview(preview, {
        message: error instanceof Error ? error.message : String(error),
        mode: 'error',
      });
    }
  }

  export function updateAdvancedRenameOperationClasses() {
    for (const element of document.querySelectorAll<HTMLElement>('.adv-rename-op')) {
      const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"][id$="-enabled"]');
      element.classList.toggle('op-enabled', Boolean(checkbox?.checked));
    }
  }

  export async function showAdvancedRenameFlow() {
    if (selectedFileEntries().length === 0) {
      showError('Select one or more items to rename.');
      return;
    }

    const overlay = overlayById('advanced-rename-overlay');
    if (!overlay) {
      showError('Advanced Rename is unavailable.');
      return;
    }

    overlay.classList.add('visible');
    updateAdvancedRenameOperationClasses();
    overlay.querySelector<HTMLElement>('#adv-rename-close')?.focus();
    await refreshAdvancedRenamePreview();
  }

  export function closeAdvancedRenameFlow() {
    setOverlayVisible('advanced-rename-overlay', false);
    localState.advancedRenamePlans = [];
    localState.advancedRenameTargets = [];
  }

  export async function applyAdvancedRenameFlow() {
    await refreshAdvancedRenamePreview();
    const invalid = localState.advancedRenamePlans.find((plan) => plan.error);
    if (invalid) {
      showError(invalid.error || 'Resolve invalid rename targets before applying.');
      return;
    }

    const requests: RenameRequest[] = localState.advancedRenamePlans
      .filter((plan) => plan.changed)
      .map((plan) => ({
        new_name: plan.newName,
        path: plan.path,
      }));

    if (requests.length === 0) {
      showError('No names would change.');
      return;
    }

    try {
      await runWithProgress('Renaming Items', `${requests.length} item${requests.length === 1 ? '' : 's'}`, async () => {
        await batchRename(requests);
      });
      showSuccess(`Renamed ${requests.length} item${requests.length === 1 ? '' : 's'}`);
      closeAdvancedRenameFlow();
      if (appState.activePane === 'secondary') await refreshSecondaryPane();
      else await refreshCurrentDirectory();
    } catch (error) {
      showError(error);
    }
  }

