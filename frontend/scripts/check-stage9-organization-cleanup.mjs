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

function assertCount(file, pattern, expected, label = 'value') {
  const source = read(file);
  const count = [...source.matchAll(pattern)].length;
  if (count !== expected) {
    fail(`${file} has ${count} ${label}; expected ${expected}`);
  }
}

function assertFileMissing(path) {
  const resolved = resolve(root, path);
  if (existsSync(resolved)) {
    fail(`${path} should not exist; frontend/src/css/styles.css is the canonical stylesheet entry.`);
  }
}

assertContains('frontend/src/lib/app/core.ts', [
  'calculateFolderSize',
  'countFolderItems',
  'diskCleanup',
  'duplicateCheck',
  'getAllTags',
  'getAllFileTags',
  'createTag',
  'setTagsForPath',
  'async function loadTagsFlow',
  'async function showSetColorLabelFlow',
  'async function showFolderMetricsFlow',
  'async function showDiskCleanupFlow',
  'async function showDuplicateCheckerFlow',
  'closeQuickLookUi();',
  "commandId === 'ctx-color-label'",
  "commandId === 'ctx-folder-metrics'",
  "commandId === 'ctx-cleanup'",
  "commandId === 'ctx-duplicates'",
], 'Stage 9 organization/cleanup flow wiring');

assertContains('frontend/src/lib/app/setup.ts', [
  "document.addEventListener('simplefile:set-color-label', handleSetColorLabel);",
  "document.addEventListener('simplefile:folder-metrics', handleFolderMetrics);",
  "document.addEventListener('simplefile:disk-cleanup', handleDiskCleanup);",
  "document.addEventListener('simplefile:duplicate-checker', handleDuplicateChecker);",
  "document.addEventListener('simplefile:duplicate-checker-delete', handleDuplicateCheckerDelete);",
], 'Stage 9 organization/cleanup setup events');

assertContains('frontend/src/lib/components/context-menus/ContextMenu.svelte', [
  "id: 'ctx-color-label'",
  "id: 'ctx-folder-metrics'",
  "id: 'ctx-cleanup'",
  "id: 'ctx-duplicates'",
], 'Stage 9 context menu actions');

assertContains('frontend/src/lib/components/layout-shell/CommandPalette.svelte', [
  "id: 'color-label'",
  "simplefile:set-color-label",
  "id: 'folder-metrics'",
  "simplefile:folder-metrics",
  "id: 'disk-cleanup'",
  "simplefile:disk-cleanup",
  "id: 'duplicate-checker'",
  "simplefile:duplicate-checker",
], 'Stage 9 command palette actions');

assertContains('frontend/src/lib/components/layout-shell/ToolbarShell.svelte', [
  "'color-label'",
  "'folder-metrics'",
  "'disk-cleanup'",
  "'duplicate-checker'",
  'id="btn-color-label"',
  'id="btn-folder-metrics"',
  'id="btn-disk-cleanup"',
  'id="btn-duplicate-checker"',
], 'Stage 9 toolbar actions');

assertContains('frontend/src/lib/components/file-list/FileList.svelte', [
  'visibleColumns',
  'fileListColumns',
  'tagForPath',
  'appState.folderSizes?.get(entry.path)',
  'visibleColumns={visibleColumns}',
], 'Stage 9 file-list metadata rendering');

assertContains('frontend/src/lib/components/layout-shell/FileListHeaderCells.svelte', [
  "id: 'items'",
  'displayColumns',
  'visibleColumns.includes(column.id)',
], 'Stage 9 file-list header columns');

assertContains('frontend/src/lib/coreFileManager.ts', [
  "case 'items':",
  'itemCountValue',
], 'Stage 9 item-count sorting');

assertContains('frontend/src/lib/tauri.ts', [
  'const devTags = new Map',
  'const devPathTags = new Map',
  'function devCalculateFolderSize',
  'function devCountFolderItems',
  'function devDiskCleanup',
  'function devDuplicateCheck',
  'function createDevTag',
  "case 'calculate_folder_size':",
  "case 'count_folder_items':",
  "case 'disk_cleanup':",
  "case 'duplicate_check':",
  "case 'get_all_file_tags':",
  "case 'create_tag':",
  "case 'set_tags_for_path':",
  "devTextFileEntry('notes-copy.txt'",
], 'Stage 9 browser dev fallbacks');

assertContains('frontend/src/css/modules/file-list.css', [
  '.file-tag-badge',
], 'Stage 9 label badge styles');

assertContains('frontend/src/css/modules/modal.css', [
  '.cleanup-summary',
  '.cleanup-hash',
  '.cleanup-path-list',
  '.duplicate-checker-modal',
  '.duplicate-file-row',
  '.tags-selector',
  '.tag-option',
  '.tag-swatch',
], 'Stage 9 cleanup and tag modal styles');

assertCount('frontend/src/vanilla-js/runtime/state.svelte.ts', /fileTags:\s*\{\}/g, 1, 'fileTags declarations');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  'id="btn-secondary-edit-path"',
  'aria-label="Edit secondary path"',
  '&#9998;',
], 'secondary path edit button');

assertFileMissing('frontend/src/app.css');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 9 organization and cleanup wiring.');
