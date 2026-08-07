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
  "id: 'operation-history'",
], 'Stage 5 command palette action');

assertContains('frontend/src/lib/app/archive.ts', [
  'renderArchiveContents',
  'renderArchiveInfo',
  'renderCreateArchiveBody',
  'renderExtractArchivePreflight',
  'unsafeEntries: info.unsafe_entries || []',
  'unsafe name',
  'runWithOperationLog',
  'async function showArchiveContentsFlow',
  'async function showCreateArchiveFlow',
], 'Stage 5 archive flow wiring');

assertContains('frontend/src/lib/components/archive-surfaces/ArchiveInfo.svelte', [
  'unsafeEntries = []',
  'archive-info-warning',
  'Unsafe Names',
  'unsafeEntries.join',
], 'Stage 5 archive unsafe-entry warning');

assertContains('frontend/src/lib/app/advanced_rename.ts', [
  'setAdvancedRenamePreview',
  'openAdvancedRenameUi',
  'async function showAdvancedRenameFlow',
  'async function applyAdvancedRenameFlow',
  'preflight-rename-row',
  'runWithOperationLog',
], 'Stage 5 advanced rename wiring');

assertContains('frontend/src/lib/app/core.ts', [
  'openQuickLookUi',
  'closeQuickLookUi',
  'async function showQuickLookFlow',
  'showOperationHistoryFlow',
  'function showKeyboardHelpFlow',
  'openKeyboardHelpUi',
  'closeKeyboardHelpUi',
  'openAboutUi',
  'setAboutInfo',
  'function showProgressFlow',
  'showProgressUi',
  'Calculating Folder Metrics',
], 'Stage 5 core overlay wiring');

assertContains('frontend/src/lib/app/progressUi.svelte.ts', [
  'export function showProgressUi',
  'export function updateProgressUi',
  'export function hideProgressUi',
], 'Stage 5 progress UI state module');

assertContains('frontend/src/lib/app/setup.ts', [
  'const handleStage5OverlayClick',
  "document.addEventListener('simplefile:create-archive', handleCreateArchive);",
  "document.addEventListener('simplefile:archive-extract', handleArchiveExtract);",
  "document.addEventListener('simplefile:create-archive-confirm', handleCreateArchiveConfirm);",
  "document.addEventListener('simplefile:advanced-rename', handleAdvancedRename);",
  "document.addEventListener('simplefile:advanced-rename-confirm', handleAdvancedRenameConfirm);",
  "document.addEventListener('simplefile:quick-look-open', handleQuickLookOpen);",
  "document.addEventListener('simplefile:keyboard-help', handleKeyboardHelp);",
  "document.addEventListener('simplefile:operation-history', handleOperationHistory);",
  "document.addEventListener('click', handleStage5OverlayClick);",
], 'Stage 5 setup event wiring');

assertContains('frontend/src/lib/app/archive.ts', [
  'showArchiveViewer',
  'openCreateArchiveUi',
  'confirmCreateArchiveFlow',
], 'Stage 5 archive component-owned flows');

assertContains('frontend/src/lib/app/advanced_rename.ts', [
  'openAdvancedRenameUi',
  'closeAdvancedRenameUi',
  'setAdvancedRenamePreview',
  'formChecked',
  'formString',
], 'Stage 5 advanced rename component-owned flow');

assertContains('frontend/src/lib/app/core.ts', [
  'openQuickLookUi',
  'closeQuickLookUi',
], 'Stage 5 quick look component-owned flow');

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
  'unsafe_entries: []',
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
