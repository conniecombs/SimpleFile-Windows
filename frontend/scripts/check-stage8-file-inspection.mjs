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

assertContains('frontend/src/lib/app/search.ts', [
  'computeChecksum',
  'getEntryInfo',
  'getImageMetadata',
  'getFileMetadata',
  'function documentKindForExtension',
  'function copyablePropertyValue',
  "copyablePropertyValue('prop-md5'",
  "copyablePropertyValue('prop-sha256'",
  'id="prop-dimensions"',
  'id="prop-file-metadata"',
  'Git State',
  'Document',
  'prop-copy-btn',
  'className = \'exif-grid\'',
], 'Stage 8 properties inspection wiring');

assertContains('frontend/src/lib/app/localState.svelte.ts', [
  'previewPaneToken: 0',
], 'Stage 8 preview token state');

assertContains('frontend/src/lib/app/core.ts', [
  'function closePreviewPaneFlow',
  'currentQuickLookPath !== quickLookPath',
  '<thead>',
  "diff-${escapeHtml(row.kind)}",
], 'Stage 8 preview and comparison wiring');

assertContains('frontend/src/lib/app/setup.ts', [
  "document.addEventListener('simplefile:quick-look', handleQuickLook);",
  "document.addEventListener('simplefile:preview-close', handlePreviewClose);",
  "addShortcut('quickLook.toggle', 'Space'",
], 'Stage 8 setup inspection events');

assertContains('frontend/src/lib/components/layout-shell/CommandPalette.svelte', [
  "id: 'quick-look'",
  "simplefile:quick-look",
], 'Stage 8 command palette Quick Look');

assertContains('frontend/src/lib/components/layout-shell/ContentShell.svelte', [
  "simplefile:preview-close",
], 'Stage 8 preview close event');

assertContains('frontend/src/lib/tauri.ts', [
  "devTextFileEntry('notes.txt'",
  'function devChecksums',
  'function devImageMetadata',
  'function devFileMetadata',
  'function devCompareFiles',
  "case 'get_entry_info':",
  "case 'compute_checksum':",
  "case 'get_image_metadata':",
  "case 'get_file_metadata':",
], 'Stage 8 browser dev inspection fallbacks');

assertContains('frontend/src/css/modules/modal.css', [
  '.comparison-table',
  '.diff-added',
  '.diff-removed',
  '.diff-modified',
  '.exif-grid',
  '.prop-value-row',
  '.prop-copy-btn',
], 'Stage 8 comparison/properties styles');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 8 file inspection wiring.');
