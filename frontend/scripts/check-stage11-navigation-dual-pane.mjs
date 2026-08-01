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
  'PaneId',
  'watchDirectory',
  'unwatchDirectory',
  'function pathForPane',
  'function selectedSetForPane',
  'function recordSecondaryHistory',
  'async function loadSecondaryDirectory',
  'async function navigateSecondaryHistory',
  'function startDirectoryWatch',
  'function scheduleFileChangeRefresh',
], 'Stage 11 navigation and watcher flow wiring');

assertContains('frontend/src/lib/fileNavigation.ts', [
  'export type PaneId',
], 'Stage 11 pane type definition');

assertContains('frontend/src/lib/app/setup.ts', [
  'onFileChange',
  'loadWorkspaceLayout',
  'saveWorkspaceLayout',
  'subscribe',
  'workspaceLayoutProperties',
  'workspacePersistenceReady',
  'flushWorkspaceLayoutSave',
  'tabsLoaded || workspaceLayoutLoaded',
  'const toggleDualPane = () => {',
  "addShortcut('pane.toggleDual', 'F6', toggleDualPane);",
  'const handleSecondaryPaneCommand',
  'const handleFileChange',
  "document.addEventListener('simplefile:secondary-pane-command', handleSecondaryPaneCommand);",
  "document.removeEventListener('simplefile:secondary-pane-command', handleSecondaryPaneCommand);",
  'onFileChange(handleFileChange)',
], 'Stage 11 navigation and watcher setup events');

assertContains('frontend/src/vanilla-js/runtime/state.svelte.ts', [
  "const WORKSPACE_LAYOUT_KEY = 'simplefile-workspace-layout';",
  'export interface WorkspaceLayoutState',
  'export function currentWorkspaceLayout',
  'export function saveWorkspaceLayout',
  'export function loadWorkspaceLayout',
  'dualPaneEnabled',
  'secondaryPath',
  'previewVisible',
  'visibleColumns',
  'columnWidths',
], 'Stage 11 persisted workspace layout state');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  'secondaryPathSegments',
  'secondaryPathEditing',
  'beginSecondaryPathEdit',
  'simplefile:secondary-pane-command',
  'handleSecondaryPathKeydown',
  'class:editing={secondaryPathEditing}',
  'bind:this={secondaryPathInput}',
  'id="btn-secondary-edit-path"',
  'disabled={appState.secondaryHistoryIndex <= 0}',
  'disabled={appState.secondaryHistoryIndex >= appState.secondaryHistory.length - 1}',
  'id="secondary-breadcrumb"',
  'id="secondary-path-input"',
  'onkeydown={handleSecondaryPathKeydown}',
], 'Stage 11 secondary pane controls');

assertContains('frontend/src/css/modules/dual-pane.css', [
  '.pane-path-edit-btn',
  '.pane-path-bar.editing .pane-path-edit-btn',
], 'Stage 11 secondary path edit styles');

assertContains('frontend/src/lib/components/file-list/FileListItems.svelte', [
  "pane = 'primary'",
  "pane?: 'primary' | 'secondary'",
  'pane,',
], 'Stage 11 file-list pane events');

assertContains('frontend/src/lib/components/file-list/FileList.svelte', [
  '{pane}',
  'appState.activePane === pane',
], 'Stage 11 file-list active pane rendering');

assertContains('frontend/src/lib/components/context-menus/ContextMenu.svelte', [
  'activePane',
  'secondarySelectedEntries',
  'secondaryFilteredEntries',
], 'Stage 11 context menu active pane state');

assertContains('frontend/src/lib/components/layout-shell/ToolbarShell.svelte', [
  'activeSelection',
  'secondarySelectedEntries',
  'secondaryFilteredEntries',
  'title="Toggle Dual Pane (F6)"',
], 'Stage 11 toolbar active pane state');

assertContains('frontend/src/lib/tauri.ts', [
  "case 'watch_directory':",
  "case 'unwatch_directory':",
], 'Stage 11 browser dev watch fallbacks');

assertContains('frontend/src/lib/app/core.ts', [
  "['pane.toggleDual', 'Toggle dual pane']",
], 'Stage 11 keyboard help shortcut');

assertContains('frontend/src/lib/components/OverlayShell.svelte', [
  '<div class="shortcut-row"><kbd>F6</kbd><span>Toggle dual pane</span></div>',
], 'Stage 11 static keyboard help shortcut');

assertNotContains('frontend/src/lib/index.ts', [
  "export * from './fileNavigation';",
  "export * from './localCommandWorkflow';",
  "export * from './searchWorkflow';",
  "export * from './transferWorkflow';",
  "export * from './viewWorkflow';",
], 'retired public workflow barrel export');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 11 navigation, dual-pane, and live-refresh wiring.');
