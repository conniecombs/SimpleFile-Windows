import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function read(path) {
  const resolved = resolve(root, path);
  if (!existsSync(resolved)) {
    fail(`${path} is missing`);
    return '';
  }
  return readFileSync(resolved, 'utf8');
}

function assertContains(file, values, label = 'value') {
  const source = read(file);
  for (const value of values) {
    if (!source.includes(value)) {
      fail(`${file} is missing ${label}: ${value}`);
    }
  }
}

function assertNotContains(file, values, label = 'retired value') {
  const source = read(file);
  for (const value of values) {
    if (source.includes(value)) {
      fail(`${file} still contains ${label}: ${value}`);
    }
  }
}

assertContains('frontend/src/lib/app/core.ts', [
  'function syncSettingsControls',
  'function saveSettingsFromControls',
  'function renderShortcutSettingsControls',
  'function saveShortcutSettingFromInput',
  'function resetShortcutSetting',
  'function resetAllShortcutSettings',
  'async function confirmDeleteSelection',
  'const shouldConfirmDelete = appState.settings?.confirmDelete !== false;',
  'if (!shouldConfirmDelete) return true;',
  'async function confirmPermanentDeleteFallback',
  'const confirmed = await confirmDeleteSelection(paths, useTrash);',
  'async function updateToolStatus',
  'async function showAboutFlow',
  'async function checkForUpdatesFlow',
  'async function installUpdateFlow',
], 'Stage 4 settings helper');

const coreSource = read('frontend/src/lib/app/core.ts');
const deleteFlowStart = coreSource.indexOf('export async function deleteSelectedFlow');
const deleteFlowEnd = coreSource.indexOf('  export function copySelection', deleteFlowStart);
if (deleteFlowStart === -1 || deleteFlowEnd === -1) {
  fail('frontend/src/lib/app/core.ts is missing the active deleteSelectedFlow boundary.');
} else {
  const deleteFlow = coreSource.slice(deleteFlowStart, deleteFlowEnd);
  if (deleteFlow.includes('showDialog(')) {
    fail('deleteSelectedFlow must route confirmations through the delete confirmation policy helpers.');
  }
  if (!deleteFlow.includes('deletePathsWithOperationLog(paths, useTrash)')) {
    fail('deleteSelectedFlow must route delete execution through the operation-log helper.');
  }
  if (!deleteFlow.includes('TRASH_UNAVAILABLE')) {
    fail('deleteSelectedFlow must keep trash fallback behavior visible.');
  }
}

assertContains('frontend/src/lib/app/setup.ts', [
  'selectDirectory,',
  'checkRarInstalled,',
  'installRarFlow,',
  'previewShortcutSettingInput,',
  'saveShortcutSettingFromInput',
  'resetShortcutSetting',
  'resetAllShortcutSettings',
  "case 'settings-custom-path-browse':",
  "case 'settings-shortcuts-reset-all':",
  "case 'rar-install-btn':",
  "case 'update-check-btn':",
  "case 'update-install-btn':",
  "case 'btn-about':",
  'removeBookmark(bookmarkRow.dataset.id)',
  "document.addEventListener('click', handleSettingsClick);",
  "document.addEventListener('click', handleSettingsListClick);",
  "document.removeEventListener('click', handleSettingsClick);",
  "document.removeEventListener('click', handleSettingsListClick);",
], 'Stage 4 settings command');

assertContains('frontend/src/lib/keyboardShortcuts.ts', [
  'defaultCombo: string;',
  'normalizedDefaultCombo: string;',
  'function updateShortcutCombo',
  'function resetShortcutCombo',
  'function findShortcutConflict',
  'function getShortcutDefinitions',
  'export function isEditableTarget',
], 'Stage 4 customizable shortcut registry');

assertContains('frontend/src/lib/app/setup.ts', [
  'registerShortcut(id, defaultCombo, handler, options)',
  'updateShortcutCombo(id, normalizedOverride)',
  "addShortcut('selection.up', 'Up'",
  "addShortcut('selection.down', 'Down'",
  "addShortcut('selection.first', 'Home'",
  "addShortcut('selection.last', 'End'",
  'handleActiveTypeAhead',
  'moveActiveListFocus',
  'focusActiveListEdge',
  'clearActiveSelection',
  'handleDocumentKeyDown',
], 'Stage 4 shortcut defaults + list keyboard navigation');

assertContains('frontend/src/lib/components/settings-body/SettingsBody.svelte', [
  'class="settings-layout"',
  'class="settings-sidebar"',
  'class="settings-search"',
  'id="settings-search"',
  'aria-orientation={tabsOrientation}',
  'class="settings-tabs-shell"',
  'class="settings-empty-state"',
  "id: 'appearance'",
  "id: 'file-list'",
  "id: 'navigation'",
  "id: 'behavior'",
  "id: 'shortcuts'",
  "id: 'about'",
  "searchText: 'appearance theme dark light default view list grid default icon size icons display'",
  'id="settings-theme"',
  'id="settings-default-view"',
  'id="settings-icon-size"',
  'id="settings-start-location"',
  'id="settings-use-trash"',
  'id="settings-shortcuts-reset-all"',
  'id="settings-shortcut-list"',
  'id="settings-custom-path-browse"',
  'id="rar-install-btn"',
  'id="update-check-btn"',
  'id="update-install-btn"',
  'id="btn-about"',
], 'Stage 4 settings control id');

assertNotContains('frontend/src/lib/components/settings-body/SettingsBody.svelte', [
  `btn-${'remote'}-${'drives'}`,
  `${'r'}${'clone'}-install-btn`,
  `${'win'}${'fsp'}-install-btn`,
], 'retired settings control id');

assertContains('frontend/src/lib/tauri.ts', [
  "case 'select_directory':",
  "case 'check_rar_installed':",
  "case 'prepare_rar_install':",
  "case 'discard_rar_install':",
  "case 'install_rar':",
  "case 'get_app_about_info':",
  "case 'check_for_update':",
  "case 'install_update':",
], 'Stage 4 browser dev fallback');

assertContains('frontend/src/css/modules/settings.css', [
  '.settings-search',
  '.settings-layout',
  '.settings-sidebar',
  '.settings-tabs-shell::after',
  '.settings-switch',
  '.settings-section-grid',
  '.shortcut-settings-list',
  '.shortcut-settings-row',
  'scroll-snap-type: x proximity;',
], 'Stage 4 settings sidebar layout styles');

assertContains('frontend/scripts/smoke-settings-ui.mjs', [
  'createServer',
  'remote-debugging-port',
  'Settings UI smoke passed.',
  '#settings-search',
  'Move Deleted Items to Trash',
  'data-shortcut-input="directory.refresh"',
  'scrollSnapType.includes',
], 'Stage 4 settings UI smoke');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 4 settings/tools wiring.');
