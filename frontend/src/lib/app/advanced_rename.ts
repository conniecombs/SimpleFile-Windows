
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
import { extensionForPath } from "./archive.js";
import {
  closeAdvancedRenameUi,
  formChecked,
  formString,
  isAdvancedRenameVisible,
  openAdvancedRenameUi,
  setAdvancedRenamePreview,
  setAdvancedRenameSummary,
} from './advancedRenameUi.svelte';
import { refreshCurrentDirectory, showHtmlDialog, escapeHtml, refreshSecondaryPane, selectedFileEntries, runWithOperationLog } from "./core.js";

  type AdvancedRenameTarget = {
    entry: FileEntry;
    index: number;
    parentPath: PathString;
  };

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
    const applyPart = formString('applyPart', 'full');
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
    const start = Number(formString('numberStart', '1')) || 1;
    const step = Number(formString('numberStep', '1')) || 1;
    const width = Math.max(1, Number(formString('numberPad', '3')) || 3);
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
    if (!formChecked('filterEnabled')) return true;

    const filterText = formString('filterText').trim();
    const extensions = formString('filterExtensions')
      .split(',')
      .map((value) => value.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean);

    let matchesName = true;
    if (filterText) {
      if (formChecked('filterRegex')) {
        const flags = formChecked('filterCase') ? '' : 'i';
        matchesName = new RegExp(filterText, flags).test(entry.name);
      } else if (formChecked('filterCase')) {
        matchesName = entry.name.includes(filterText);
      } else {
        matchesName = entry.name.toLowerCase().includes(filterText.toLowerCase());
      }
    }

    if (formChecked('filterInvert')) {
      matchesName = !matchesName;
    }

    if (extensions.length > 0) {
      matchesName = matchesName && extensions.includes(extensionForPath(entry.name).replace('tar.gz', 'gz'));
    }

    return matchesName;
  }

  export function buildAdvancedName(entry: FileEntry, index: number) {
    let name = entry.name;

    if (formChecked('templateEnabled')) {
      const rendered = templateName(formString('templatePattern', '{base}_{n}'), entry, index);
      const keepExtension = formChecked('templateKeepExt');
      const { ext } = splitFileName(entry.name);
      name = keepExtension && ext && !rendered.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
        ? joinFileName(rendered, ext)
        : rendered;
    }

    if (formChecked('removeEnabled')) {
      name = transformNamePart(name, (value) => replaceWithOptions(
        value,
        formString('removeString'),
        '',
        formChecked('removeRegex'),
        formChecked('removeCase'),
      ));
    }

    if (formChecked('replaceEnabled')) {
      name = transformNamePart(name, (value) => replaceWithOptions(
        value,
        formString('replaceFind'),
        formString('replaceWith'),
        formChecked('replaceRegex'),
        formChecked('replaceCase'),
      ));
    }

    if (formChecked('trimEnabled')) {
      const mode = formString('trimMode', 'both');
      name = transformNamePart(name, (value) => {
        let next = value;
        if (mode === 'start' || mode === 'both') next = next.replace(/^\s+/, '');
        if (mode === 'end' || mode === 'both') next = next.replace(/\s+$/, '');
        if (formChecked('trimCollapse')) next = next.replace(/\s+/g, ' ');
        return next;
      });
    }

    if (formChecked('addEnabled')) {
      name = insertValue(
        name,
        formString('addString'),
        formString('addPosition', 'prefix'),
        Number(formString('addIndex', '0')) || 0,
      );
    }

    if (formChecked('capitalizeEnabled')) {
      name = transformNamePart(name, (value) => capitalizeValue(value, formString('capitalizeMode', 'first')));
    }

    if (formChecked('separatorEnabled')) {
      const mode = formString('separatorMode', 'spaces-to-dashes');
      name = transformNamePart(name, (value) => {
        let next = value;
        if (mode === 'spaces-to-dashes') next = next.replace(/\s+/g, '-');
        if (mode === 'spaces-to-underscores') next = next.replace(/\s+/g, '_');
        if (mode === 'underscores-to-spaces') next = next.replace(/_+/g, ' ');
        if (mode === 'dashes-to-spaces') next = next.replace(/-+/g, ' ');
        if (mode === 'dots-to-spaces') next = next.replace(/\.+/g, ' ');
        if (formChecked('separatorCollapse')) {
          next = next.replace(/([ _.-])\1+/g, '$1');
        }
        return next;
      });
    }

    if (formChecked('numberEnabled')) {
      const start = Number(formString('numberStart', '1')) || 1;
      const step = Number(formString('numberStep', '1')) || 1;
      const width = Math.max(1, Number(formString('numberPad', '3')) || 3);
      const numberText = String(start + index * step).padStart(width, '0');
      name = numberedValue(
        name,
        numberText,
        formString('numberPosition', 'suffix'),
        formString('numberSeparator', '_'),
      );
    }

    if (formChecked('extensionEnabled')) {
      const { base, ext } = splitFileName(name);
      const mode = formString('extensionMode', 'lower');
      if (mode === 'lower') name = joinFileName(base, ext.toLowerCase());
      if (mode === 'upper') name = joinFileName(base, ext.toUpperCase());
      if (mode === 'set') name = joinFileName(base, formString('extensionCustom').replace(/^\./, ''));
      if (mode === 'remove') name = base;
    }

    if (formChecked('sanitizeEnabled')) {
      name = sanitizeFileName(name, formString('sanitizeReplacement', '_'));
    }

    return name;
  }

  export async function collectAdvancedRenameTargets() {
    const selectedEntries = selectedFileEntries();
    const includeRecursive = formChecked('scopeRecursive');
    const includeHidden = formChecked('scopeHidden');
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
    if (!isAdvancedRenameVisible()) return;

    setAdvancedRenamePreview({
      message: 'Building preview…',
      mode: 'loading',
      rows: [],
    });
    setAdvancedRenameSummary('Building preview…');

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

      setAdvancedRenamePreview({
        extraCount: Math.max(0, localState.advancedRenamePlans.length - rows.length),
        limit: 500,
        message: localState.advancedRenamePlans.length === 0 ? 'No matching files.' : '',
        mode: localState.advancedRenamePlans.length === 0 ? 'empty' : 'rows',
        rows,
        totalRows: localState.advancedRenamePlans.length,
      });

      setAdvancedRenameSummary(
        `${localState.advancedRenamePlans.length} target${localState.advancedRenamePlans.length === 1 ? '' : 's'} ready.`,
      );
    } catch (error) {
      setAdvancedRenamePreview({
        message: error instanceof Error ? error.message : String(error),
        mode: 'error',
        rows: [],
      });
      setAdvancedRenameSummary('Preview failed.');
    }
  }

  /** Kept for setup wiring; op-enabled classes are now reactive on the form. */
  export function updateAdvancedRenameOperationClasses() {
    // no-op: AdvancedRenameModal binds class:op-enabled from form state
  }

  export async function showAdvancedRenameFlow() {
    if (selectedFileEntries().length === 0) {
      showError('Select one or more items to rename.');
      return;
    }

    openAdvancedRenameUi();
    await Promise.resolve();
    document.getElementById('adv-rename-close')?.focus();
    await refreshAdvancedRenamePreview();
  }

  export function closeAdvancedRenameFlow() {
    closeAdvancedRenameUi();
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

    const changedPlans = localState.advancedRenamePlans.filter((plan) => plan.changed);
    const previewRows = changedPlans.slice(0, 8).map((plan) => `
      <li class="preflight-rename-row">
        <span title="${escapeHtml(plan.oldName)}">${escapeHtml(plan.oldName)}</span>
        <strong title="${escapeHtml(plan.newName)}">${escapeHtml(plan.newName)}</strong>
      </li>
    `).join('');
    const extraRows = changedPlans.length > 8
      ? `<p class="settings-section-hint">And ${changedPlans.length - 8} more rename${changedPlans.length - 8 === 1 ? '' : 's'}.</p>`
      : '';

    const confirmed = await showHtmlDialog({
      bodyHtml: `
        <div class="preflight-summary">
          <dl class="preflight-detail-list">
            <div><dt>Action</dt><dd>Rename</dd></div>
            <div><dt>Items</dt><dd>${requests.length}</dd></div>
          </dl>
          <ul class="preflight-item-list preflight-rename-list">${previewRows}</ul>
          ${extraRows}
        </div>
      `,
      confirmText: 'Rename',
      title: `Rename ${requests.length} Items`,
    });
    if (confirmed === false) return;

    try {
      await runWithOperationLog({
        action: 'advanced-rename',
        item: `${requests.length} item${requests.length === 1 ? '' : 's'}`,
        itemCount: requests.length,
        retry: {
          kind: 'advanced-rename',
          requests: requests.map((request) => ({ ...request })),
        },
        title: 'Renaming Items',
      }, async () => {
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
