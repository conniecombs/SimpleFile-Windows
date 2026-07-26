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

assertContains('frontend/src/lib/components/file-list/FileList.svelte', [
  'const LIST_ROW_HEIGHT',
  'let visibleRange = $derived.by',
  '.slice(visibleRange.start, visibleRange.end)',
  'mode="virtual"',
  'scrollIndexIntoView(appState.focusedIndex)',
  'virtualOffset={visibleRange.offset}',
  'virtualTotalSize={virtualTotalSize}',
], 'huge-folder virtual range wiring');

assertContains('frontend/src/lib/components/file-list/FileListItems.svelte', [
  'virtualOffset = 0',
  'virtualTotalSize = 0',
  'height: ${virtualTotalSize}px',
  'translateY(${virtualOffset}px)',
], 'virtual spacer rendering');

assertContains('frontend/src/lib/components/file-list.ts', [
  'virtualOffset?: number;',
  'virtualTotalSize?: number;',
  'virtualOffset: props.virtualOffset ?? 0',
  'virtualTotalSize: props.virtualTotalSize ?? 0',
], 'legacy mount helper virtual props');

assertContains('frontend/src/css/modules/file-list.css', [
  '--file-list-row-height',
  '--file-list-grid-item-height',
  'will-change: transform',
], 'stable virtual row dimensions');

assertContains('frontend/src/lib/app/localState.svelte.ts', [
  'folderMetricsToken: 0',
  'currentProgressCancel',
  'secondaryNavigationToken: 0',
], 'freshness tokens');

assertContains('frontend/src/lib/app/core.ts', [
  'cancelFolderMetricWork',
  'stopPreviousFolderMetricWork',
  'cancelFolderSize',
  'cancelFolderItemCount',
  'Folder ${index + 1} of ${folders.length}: ${folder.name}',
  '{ onCancel: cancelFolderMetricWork }',
  'type ProgressFlowOptions',
  'token !== localState.secondaryNavigationToken',
], 'lazy metric cancellation and freshness');

assertContains('frontend/src/lib/app/setup.ts', [
  'localState.currentProgressCancel',
  'Promise.resolve(localState.currentProgressCancel()).catch(showError)',
], 'progress cancel callback wiring');

assertContains('frontend/src/lib/fileNavigationPrimary.ts', [
  'void host.getGitFileStatuses(listing.path).then',
  'myToken !== navigationToken',
], 'lazy primary git status enrichment');

assertContains('frontend/src/lib/fileNavigationDualPane.ts', [
  'void host.getGitFileStatuses(listing.path).then',
  'myToken !== secondaryNavigationToken',
], 'lazy secondary git status enrichment');

assertNotContains('frontend/src/lib/fileNavigationPrimary.ts', [
  'await host.getGitFileStatuses',
], 'eager primary git status load');

assertNotContains('frontend/src/lib/fileNavigationDualPane.ts', [
  'await host.getGitFileStatuses',
], 'eager secondary git status load');

if (process.exitCode) {
  process.exit();
}

console.log('Checked huge-folder virtualization and stale metric guards.');
