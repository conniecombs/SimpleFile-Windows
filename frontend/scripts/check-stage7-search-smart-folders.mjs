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

function assertNotContains(file, values, label = 'value') {
  const source = read(file);
  for (const value of values) {
    if (source.includes(value)) {
      fail(`${file} still contains ${label}: ${value}`);
    }
  }
}

assertContains('frontend/src/lib/app/search.ts', [
  'loadSmartFolders',
  'saveSmartFolder',
  'deleteSmartFolder',
  'function searchOptionsToWorkflowOptions',
  'function currentSearchOptionsForSmartFolder',
  'async function loadSmartFoldersFlow',
  'async function saveCurrentSearchAsSmartFolderFlow',
  'async function openSmartFolderFlow',
  'async function deleteSmartFolderFlow',
  "onSave: () => {",
  "saveLabel: 'Save Search'",
], 'Stage 7 search smart-folder wiring');

assertContains('frontend/src/lib/app/setup.ts', [
  'void loadSmartFoldersFlow();',
  "document.addEventListener('simplefile:search-results-save', handleSearchResultsSave);",
  "document.addEventListener('simplefile:smart-folder-open', handleSmartFolderOpen);",
  "document.addEventListener('simplefile:smart-folder-delete', handleSmartFolderDelete);",
  "document.addEventListener('simplefile:smart-folders-changed', handleSmartFoldersChanged);",
], 'Stage 7 setup smart-folder events');

assertContains('frontend/src/lib/components/layout-shell/SidebarShell.svelte', [
  'onRemove={(id) => {',
  "simplefile:smart-folder-delete",
], 'Stage 7 sidebar removal wiring');

assertContains('frontend/src/lib/components/search-chrome/SearchResultsHeader.svelte', [
  'SEARCH_RESULTS_SAVE_EVENT',
  'detail: { handled: Boolean(onSave) }',
], 'Stage 7 search header save event');

assertContains('frontend/src/lib/tauri.ts', [
  'const devSmartFolders = new Map',
  'function cloneDevSmartFolder',
  "case 'load_smart_folders':",
  "case 'save_smart_folder':",
  "case 'delete_smart_folder':",
], 'Stage 7 browser dev smart-folder fallback');

assertNotContains('frontend/src/lib/components/settings-body/SettingsBody.svelte', [
  'alert(',
], 'blocking alert');

assertContains('frontend/src/css/modules/settings.css', [
  '.settings-status',
  '.settings-status--success',
  '.settings-status--error',
  '.settings-status--pending',
  'input[type="password"]',
], 'Stage 7 settings status styles');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 7 search and smart-folder wiring.');
