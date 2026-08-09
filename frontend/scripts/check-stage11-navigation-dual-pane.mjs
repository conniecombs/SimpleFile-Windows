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
  "addShortcut('pane.switch', 'Tab'",
  "addShortcut('pane.focusPrimary', 'Alt+1'",
  "addShortcut('pane.focusSecondary', 'Alt+2'",
  "addShortcut('pane.copyToOther', 'Ctrl+Alt+C'",
  "addShortcut('pane.moveToOther', 'Ctrl+Alt+M'",
  'switchActivePane',
  'activatePane',
  'copyOrMoveToOtherPane',
  "document.addEventListener('simplefile:activate-pane', handleActivatePane);",
  'const handlePaneCommand',
  'const handleFileChange',
  "document.addEventListener('simplefile:pane-command', handlePaneCommand);",
  "document.removeEventListener('simplefile:pane-command', handlePaneCommand);",
  'onFileChange(handleFileChange)',
  "window.addEventListener('pagehide', handlePageHideFlush)",
  "window.addEventListener('beforeunload', handlePageHideFlush)",
], 'Stage 11 navigation and watcher setup events');

assertContains('frontend/src/vanilla-js/runtime/state.svelte.ts', [
  "const WORKSPACE_LAYOUT_KEY = 'simplefile-workspace-layout';",
  'export interface WorkspaceLayoutState',
  'export function currentWorkspaceLayout',
  'export function saveWorkspaceLayout',
  'export function loadWorkspaceLayout',
  'export function saveTabs',
  'export function loadTabs',
  'clearLegacyTabKeys',
  'LEGACY_TABS_KEY',
  'dualPaneEnabled',
  'secondaryActiveTabId',
  'secondaryPath',
  'secondaryTabs',
  'previewVisible',
  'visibleColumns',
  'columnWidths',
], 'Stage 11 persisted workspace layout state');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  'primaryPathSegments',
  'secondaryPathSegments',
  'editingPathPane',
  'beginPanePathEdit',
  'simplefile:pane-command',
  'handlePanePathKeydown',
  'id="primary-tab-bar"',
  'id="secondary-tab-bar"',
  'id="primary-path-bar"',
  'id="primary-path-input"',
  'class:editing={editingPathPane === \'primary\'}',
  'class:editing={editingPathPane === \'secondary\'}',
  'bind:this={secondaryPathInput}',
  'id="btn-primary-edit-path"',
  'id="btn-secondary-edit-path"',
  "disabled={paneHistoryIndex('primary') <= 0}",
  "disabled={paneHistoryIndex('secondary') <= 0}",
  'pane="primary"',
  'pane="secondary"',
  'appState.secondaryTabs',
  'id="secondary-breadcrumb"',
  'id="secondary-path-input"',
  "onkeydown={(event) => handlePanePathKeydown(event, 'secondary')}",
], 'Stage 11 pane-local tab and path controls');

assertContains('frontend/src/css/modules/dual-pane.css', [
  '.pane-path-edit-btn',
  '.pane-path-bar.editing .pane-path-edit-btn',
], 'Stage 11 pane path edit styles');

assertContains('frontend/src/css/modules/tabs.css', [
  '.pane-tab-bar',
], 'Stage 11 pane tab bar styles');

assertContains('frontend/src/lib/components/tabs/TabsBar.svelte', [
  "pane = 'primary'",
  'data-tab-pane={pane}',
  'detail: {',
  'pane,',
], 'Stage 11 pane-aware tab events');

assertContains('frontend/src/lib/components/layout-shell/SidebarShell.svelte', [
  'sidebarTargetPane',
  'sidebar-target-switch',
  "setSidebarTargetPane('primary')",
  "setSidebarTargetPane('secondary')",
  'pane={sidebarTargetPane}',
], 'Stage 11 sidebar pane target controls');

assertContains('frontend/src/lib/components/tree-view/TreeView.svelte', [
  "pane = 'primary'",
  'pane?: \'primary\' | \'secondary\'',
  'pane,',
], 'Stage 11 tree pane target events');

assertContains('frontend/src/lib/components/places/QuickAccessList.svelte', [
  "pane = 'primary'",
  'command: location.action, pane',
  'isDir: true, pane, path: location.path',
], 'Stage 11 quick access pane target events');

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
  "['pane.switch', 'Switch active pane']",
  "['pane.copyToOther', 'Copy selection to other pane']",
  "['pane.moveToOther', 'Move selection to other pane']",
  'export function activatePane',
  'export function switchActivePane',
  'export function activePaneLabel',
  'export async function copyOrMoveToOtherPane',
], 'Stage 11 keyboard help shortcut');

assertContains('frontend/src/lib/components/KeyboardHelpModal.svelte', [
  'id="keyboard-help-overlay"',
  'keyboardHelpUi',
  'keyboardHelpUi.sections',
], 'Stage 11 component-owned keyboard help');

assertContains('frontend/src/lib/app/core.ts', [
  'openKeyboardHelpUi(buildKeyboardHelpSections())',
  "title: 'Dual Pane'",
], 'Stage 11 keyboard help dual-pane sections');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  "class:active={appState.dualPaneEnabled && appState.activePane === 'primary'}",
  "class:active={appState.dualPaneEnabled && appState.activePane === 'secondary'}",
  "simplefile:activate-pane",
], 'Stage 11 active pane chrome');

assertContains('frontend/src/lib/components/status-bar/StatusBar.svelte', [
  'activePaneLabel',
  'status-active-pane',
], 'Stage 11 status bar active pane indicator');

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
