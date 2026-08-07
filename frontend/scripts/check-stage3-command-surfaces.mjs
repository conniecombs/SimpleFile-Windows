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

assertContains('frontend/src/lib/components/layout-shell/AppShell.svelte', [
  "import TabsBar from '../tabs/TabsBar.svelte';",
  '<TabsBar tabs={appState.tabs} activeTabId={appState.activeTabId} />',
], 'live tabs bar');

assertContains('frontend/src/lib/components/layout-shell/CommandPalette.svelte', [
  'simplefile:toolbar-command',
  "dispatchToolbarCommand('copy')",
  "dispatchToolbarCommand('paste')",
  "document.dispatchEvent(new CustomEvent('simplefile:open-settings'))",
  "document.dispatchEvent(new CustomEvent('simplefile:focus-search'))",
], 'live command palette command');

assertContains('frontend/src/lib/app/search.ts', [
  'export async function runSearch',
  'export async function openAdvancedSearchFlow',
  'export async function showPropertiesFlow',
], 'Stage 3 search workflow wiring');

assertContains('frontend/src/lib/app/core.ts', [
  'function showContextMenuAt',
  'async function handleContextMenuCommand',
  'export async function openNewTab',
  'export async function switchToTab',
  'export async function closeTab',
], 'Stage 3 core workflow wiring');

assertContains('frontend/src/lib/app/setup.ts', [
  "document.addEventListener('simplefile:search-submit', handleSearchSubmit);",
  "document.addEventListener('simplefile:tab-new', handleTabNew);",
  "document.addEventListener('simplefile:properties', handleProperties);",
  "document.addEventListener('contextmenu', handleFileListContextMenu);",
  'appState.commandPaletteVisible = true;',
], 'Stage 3 event listener wiring');

assertContains('frontend/src/lib/components/context-menus/ContextMenu.svelte', [
  "id: 'ctx-open'",
  "id: 'ctx-preview'",
  "id: 'ctx-rename'",
  "id: 'ctx-copy'",
  "id: 'ctx-paste'",
  "id: 'ctx-delete'",
  "id: 'ctx-info'",
  'disabled={entry.disabled}',
], 'professional context menu');

assertNotContains('frontend/src/lib/components/context-menus/ContextMenu.svelte', [
  'DEBUG',
  'console.log',
], 'dead or debug context menu item');

assertContains('frontend/src/lib/components/search-chrome/SearchResultsHeader.svelte', [
  '{#if showSave}',
], 'conditional save-search action');

assertContains('frontend/src/lib/tauri.ts', [
  'function devSearchFiles',
  "case 'search_files':",
  "case 'cancel_search':",
], 'browser dev search fallback');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 3 command-surface wiring.');
