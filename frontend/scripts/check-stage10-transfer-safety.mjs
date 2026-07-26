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

function assertNotMatches(file, pattern, label = 'pattern') {
  const source = read(file);
  if (pattern.test(source)) {
    fail(`${file} still contains ${label}: ${pattern}`);
  }
}

assertContains('frontend/src/lib/app/core.ts', [
  'copyEntryResolved',
  'copyWithProgress',
  'moveEntryResolved',
  'moveWithProgress',
  'function pushUndoEntry',
  'async function undoLastFlow',
  'async function redoLastFlow',
  'async function chooseConflictAction',
  'async function transferEntriesWithSafety',
  'function safeDeletePaths',
  'name="transfer-conflict-action"',
  'name="clipboard-history-entry"',
], 'Stage 10 transfer safety flow wiring');

assertContains('frontend/src/lib/app/setup.ts', [
  'onOperationProgress',
  'onExternalFileDrop',
  "document.addEventListener('dragstart', handleDragStart);",
  "document.addEventListener('drop', handleDrop);",
], 'Stage 10 transfer event wiring');

assertNotMatches('frontend/src/lib/app/core.ts', /\bimport\s*\{[^}]*\bcopyEntry\s*,/s, 'direct copyEntry imports');
assertNotMatches('frontend/src/lib/app/core.ts', /\bimport\s*\{[^}]*\bmoveEntry\s*,/s, 'direct moveEntry imports');

assertContains('frontend/src/vanilla-js/runtime/state.svelte.ts', [
  'undoStack: []',
  'redoStack: []',
  'clipboardHistory: []',
  'draggedItems: []',
], 'Stage 10 runtime state');

assertContains('frontend/src/lib/appState.ts', [
  'export interface UndoHistoryItem',
  'undoStack: UndoHistoryItem[];',
  'redoStack: UndoHistoryItem[];',
], 'Stage 10 typed state');

assertContains('frontend/src/lib/components/layout-shell/ToolbarShell.svelte', [
  'hasUndo',
  'hasRedo',
  'disabled={!hasUndo}',
  'disabled={!hasRedo}',
], 'Stage 10 toolbar undo/redo state');

assertContains('frontend/src/lib/components/layout-shell/CommandPalette.svelte', [
  "id: 'clipboard-history'",
  "id: 'undo'",
  "id: 'redo'",
], 'Stage 10 command palette actions');

assertContains('frontend/src/lib/tauri.ts', [
  'function resolveDevDestinationPath',
  'function transferDevPaths',
  "case 'copy_entry_resolved':",
  "case 'move_entry_resolved':",
  "case 'copy_with_progress':",
  "case 'move_with_progress':",
], 'Stage 10 browser dev transfer fallbacks');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 10 transfer safety wiring.');
