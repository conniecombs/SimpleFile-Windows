import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function read(path) {
  const resolved = resolve(root, path);
  if (!existsSync(resolved)) {
    fail(`${path} is missing`);
    return '';
  }
  return readFileSync(resolved, 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
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

assertContains('frontend/src/lib/coreFileManager.ts', [
  'export function getParentPath',
  'export function isValidFileName',
  'export function visibleEntries',
  'export function formatFileSize',
], 'core file manager helper');

assertContains('frontend/src/lib/app/core.ts', [
  'copyWithProgress,',
  'moveWithProgress,',
  'async function loadDirectory',
  "type HistoryMode = 'push' | 'replace-current' | 'none';",
  'appState.selectedEntries = new Set',
  "copySelection('copy')",
  "copySelection('cut')",
  'async function transferEntriesWithSafety',
  'selectPaths(',
], 'live core file manager wiring');

assertNotContains('frontend/src/lib/app/core.ts', [
  'selectedEntries.clear()',
  'Cannot open file yet',
], 'stale core file manager behavior');

assertContains('frontend/src/lib/components/layout-shell/ToolbarShell.svelte', [
  'disabled={appState.historyIndex <= 0}',
  'disabled={appState.historyIndex >= appState.history.length - 1}',
  'aria-pressed={appState.isGridView}',
  "id=\"btn-new-file\"",
  "id=\"btn-rename\"",
  "id=\"btn-copy\"",
  "id=\"btn-cut\"",
  "id=\"btn-paste\"",
  "id=\"btn-delete\"",
  'disabled={!hasSelection}',
  'disabled={!hasClipboard}',
  'value={appState.iconSize}',
], 'stateful toolbar controls and visible core file actions');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  'class:dual-pane={appState.dualPaneEnabled}',
  'class:visible={appState.showPreviewPane}',
  'aria-label="Close preview pane"',
], 'stateful pane visibility');

assertContains('frontend/src/lib/components/layout-shell/SidebarShell.svelte', [
  'appState.treeData?.get',
  'appState.treeExpanded?.has',
  'children.map(toTreeNode)',
], 'stateful tree expansion');

assertContains('frontend/src/lib/components/layout-shell/FileListHeaderCells.svelte', [
  "simplefile:file-list-sort",
  'onclick={(event) => emitSort(event, column)}',
  'onkeydown={(event) => handleKeydown(event, column)}',
], 'sortable file-list headers');

assertContains('frontend/src/lib/tauri.ts', [
  'const devDirectories = new Map<string, FileEntry[]>();',
  "case 'create_directory':",
  "case 'create_file':",
  "case 'rename_entry':",
  "case 'delete_entry':",
  "case 'move_to_trash':",
  "case 'copy_entry':",
  "case 'move_entry':",
  "case 'read_file_preview':",
  'function devFilePreview',
  "case 'open_file':",
  "case 'open_terminal':",
], 'browser dev core filesystem fallback');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  'value={appState.secondaryPath}',
], 'secondary pane path binding');

if (process.exitCode) {
  process.exit();
}

console.log('Checked core file manager wiring.');
