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

assertContains('frontend/src/lib/components/context-menus/ContextMenu.svelte', [
  "id: 'ctx-open-with'",
  "id: 'ctx-compare'",
  "id: 'ctx-powershell-admin'",
  "id: 'ctx-advanced-rename'",
  "id: 'ctx-copy-to-pane'",
  "id: 'ctx-move-to-pane'",
  "id: 'ctx-pack'",
  "id: 'ctx-unpack'",
  "id: 'ctx-compress'",
  "id: 'ctx-extract'",
  "id: 'ctx-extract-to'",
], 'Stage 5 context menu item');

assertContains('frontend/src/lib/components/layout-shell/CommandPalette.svelte', [
  "simplefile:advanced-rename",
  "simplefile:create-archive",
  "simplefile:keyboard-help",
], 'Stage 5 command palette action');

assertContains('frontend/src/lib/app/archive.ts', [
  'renderArchiveContents',
  'renderArchiveInfo',
  'renderCreateArchiveBody',
  'async function showArchiveContentsFlow',
  'async function showCreateArchiveFlow',
], 'Stage 5 archive flow wiring');

assertContains('frontend/src/lib/app/advanced_rename.ts', [
  'renderAdvancedRenamePreview',
  'async function showAdvancedRenameFlow',
  'async function applyAdvancedRenameFlow',
], 'Stage 5 advanced rename wiring');

assertContains('frontend/src/lib/app/core.ts', [
  'renderQuickLook',
  'async function showQuickLookFlow',
  'function showKeyboardHelpFlow',
  'function showProgressFlow',
], 'Stage 5 core overlay wiring');

assertContains('frontend/src/lib/app/setup.ts', [
  'const handleStage5OverlayClick',
  "document.addEventListener('simplefile:create-archive', handleCreateArchive);",
  "document.addEventListener('simplefile:advanced-rename', handleAdvancedRename);",
  "document.addEventListener('simplefile:keyboard-help', handleKeyboardHelp);",
  "document.addEventListener('click', handleStage5OverlayClick);",
], 'Stage 5 setup event wiring');

assertContains('frontend/src/lib/app/core.ts', [
  "commandId === 'ctx-open-with'",
  "commandId === 'ctx-preview'",
  "commandId === 'ctx-compare'",
  "commandId === 'ctx-powershell-admin'",
  "commandId === 'ctx-advanced-rename'",
  "commandId === 'ctx-copy-to-pane'",
  "commandId === 'ctx-move-to-pane'",
  "commandId === 'ctx-pack'",
  "commandId === 'ctx-unpack'",
  "commandId === 'ctx-compress'",
  "commandId === 'ctx-extract'",
  "commandId === 'ctx-extract-to'",
], 'Stage 5 context command handler');

assertContains('frontend/src/lib/tauri.ts', [
  'const devArchives = new Map<string, ArchiveInfo>();',
  "case 'batch_rename':",
  "case 'list_archive':",
  "case 'create_archive':",
  "case 'extract_archive':",
  "case 'open_powershell_admin':",
  "case 'open_file_with':",
  "case 'cancel_operation':",
  "case 'compare_files':",
], 'Stage 5 browser dev fallback');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 5 menu and overlay wiring.');
