import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function absolute(path) {
  return resolve(root, path);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function read(path) {
  const resolved = absolute(path);
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

function assertMissing(path, label = 'retired path') {
  if (existsSync(absolute(path))) {
    fail(`${path} still exists as ${label}`);
  }
}

function collectFiles(directory, extensions) {
  const resolved = absolute(directory);
  if (!existsSync(resolved)) return [];

  return readdirSync(resolved, { withFileTypes: true }).flatMap((entry) => {
    const path = join(resolved, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') return [];
      return collectFiles(relative(root, path), extensions);
    }

    return entry.isFile() && extensions.has(extname(entry.name)) ? [relative(root, path)] : [];
  });
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

function assertNoReferences(files, values, label = 'retired path reference') {
  for (const file of files) {
    const source = read(file);
    for (const value of values) {
      if (source.includes(value)) {
        fail(`${file} still contains ${label}: ${value}`);
      }
    }
  }
}

const bridgeContracts = [
  {
    name: 'breadcrumb',
    source: 'frontend/src/lib/components/breadcrumb/BreadcrumbTrail.svelte',
    events: [
      'simplefile:breadcrumb-focus',
      'simplefile:breadcrumb-navigate',
    ],
  },
  {
    name: 'file-list item interactions',
    source: 'frontend/src/lib/components/file-list/FileListItems.svelte',
    events: [
      'simplefile:file-list-item-click',
      'simplefile:file-list-item-open',
    ],
  },
  {
    name: 'quick filter',
    source: 'frontend/src/lib/components/search-chrome/QuickFilterBar.svelte',
    events: [
      'simplefile:quick-filter-clear',
      'simplefile:quick-filter-input',
    ],
  },
  {
    name: 'search results header',
    source: 'frontend/src/lib/components/search-chrome/SearchResultsHeader.svelte',
    events: [
      'simplefile:search-results-clear',
    ],
  },
  {
    name: 'tabs',
    source: 'frontend/src/lib/components/tabs/TabsBar.svelte',
    events: [
      'simplefile:tab-close',
      'simplefile:tab-focus-move',
      'simplefile:tab-new',
      'simplefile:tab-switch',
    ],
  },
  {
    name: 'tree view',
    source: 'frontend/src/lib/components/tree-view/TreeView.svelte',
    events: [
      'simplefile:tree-node-focus-move',
      'simplefile:tree-node-focus-parent',
      'simplefile:tree-node-open',
      'simplefile:tree-node-toggle',
    ],
  },
  {
    name: 'toolbar and search',
    source: 'frontend/src/lib/components/layout-shell/ToolbarShell.svelte',
    events: [
      'simplefile:search-cancel',
      'simplefile:search-clear',
      'simplefile:search-open-advanced',
      'simplefile:search-submit',
      'simplefile:toolbar-command',
      'simplefile:toolbar-icon-size',
    ],
  },
];

for (const contract of bridgeContracts) {
  assertContains(contract.source, contract.events, `${contract.name} event`);
}

assertContains('frontend/src/lib/components/file-list/FileListItems.svelte', [
  'draggable="true"',
  'data-path={item.path}',
  'data-is-dir={item.isDir}',
], 'file-list drag/drop source contract');

assertContains('frontend/src/App.svelte', [
  "import OverlayShell from './lib/components/OverlayShell.svelte';",
  'class="app-container"',
  '<OverlayShell />',
], 'Svelte app shell owner');

assertContains('frontend/src/lib/components/OverlayShell.svelte', [
  'id="context-menu"',
  'GenericModal',
  'ProgressModal',
  'id="quicklook-overlay"',
  'id="quicklook-content"',
  'id="archive-overlay"',
  'id="create-archive-overlay"',
  'id="advanced-rename-overlay"',
  'id="keyboard-help-overlay"',
  'id="about-overlay"',
  'id="external-drop-overlay"',
], 'native overlay shell contract');

assertContains('frontend/src/lib/components/GenericModal.svelte', [
  'id="modal-overlay"',
  'id="modal-title"',
  'id="modal-body"',
  'modalUi',
], 'component-owned generic modal');

assertContains('frontend/src/lib/components/ProgressModal.svelte', [
  'id="progress-overlay"',
  'id="progress-cancel"',
  'progressUi',
], 'component-owned progress modal');

assertContains('frontend/scripts/migrate-components.ps1', [
  'one-shot Svelte component migration script is retired',
], 'retired migration script guard');

assertNoReferences([
  'frontend/scripts/migrate-components.ps1',
], [
  'Remove-Item',
  'Move-Item',
  'Set-Content',
  'R:\\SimpleFile-Svelte',
], 'destructive retired migration script command');

assertContains('frontend/src/vanilla-js/runtime/state.svelte.ts', [
  'satisfies SimpleFileAppState',
  'export const state',
  'export function subscribe',
  'export function uniqueId',
  'smartFolders: []',
], 'typed runtime state');

assertContains('frontend/src/vanilla-js/runtime/startup-location.ts', [
  'export function resolveStartupLocation',
  "mode === 'custom'",
  "mode === 'last'",
], 'typed startup-location runtime helper');

assertContains('frontend/src/vanilla-js/README.md', [
  'runtime/',
  'typed runtime helpers',
], 'vanilla JavaScript folder documentation');

assertContains('README.md', [
  'frontend/src/vanilla-js/runtime/',
  'typed runtime helpers',
], 'README runtime documentation');

assertMissing('frontend/js', 'retired vanilla JavaScript runtime folder');
assertMissing('frontend/src/lib/state.svelte', 'retired state runtime location');
assertMissing('frontend/src/lib/components/js', 'retired legacy bridge JavaScript folder');
assertMissing('frontend/src/lib/components/legacy-overlays.ts', 'retired legacy overlay parser');
assertMissing('frontend/src/lib/components/legacy-shell-template.html', 'retired legacy overlay template');
assertMissing('frontend/src/vanilla-js/generated-svelte', 'retired generated Svelte audit bundles');

const activeReferenceFiles = [
  ...collectFiles('frontend/src', new Set(['.svelte', '.ts', '.js', '.mjs', '.md'])),
  ...collectFiles('frontend/scripts', new Set(['.js', '.mjs'])),
  ...collectFiles('scripts', new Set(['.js', '.mjs'])),
  'README.md',
  'docs/CONTRIBUTING.md',
  'docs/SUPPORT.md',
  'docs/STARTUP_FIX_NOTES.md',
  'package.json',
  'frontend/package.json',
].filter((file) => {
  const normalized = toPosix(file);
  return normalized !== 'frontend/scripts/check-behavior-bridges.mjs'
    && normalized !== 'frontend/scripts/check-migration-complete.mjs';
});

assertNoReferences(activeReferenceFiles, [
  'frontend/js/',
  'frontend\\js\\',
  'frontend/src/lib/state.svelte',
  'frontend/src/lib/components/js/svelte',
  './lib/state.svelte',
  '../../state.svelte',
  'frontend/src/lib/components/legacy-overlays.ts',
  'frontend/src/lib/components/legacy-shell-template.html',
  'frontend/src/vanilla-js/generated-svelte/',
  'generated-svelte/',
  'legacyOverlayMarkup',
  '{@html legacyOverlayMarkup}',
], 'retired migration glue');

assertNoReferences([
  'README.md',
  'docs/CONTRIBUTING.md',
], [
  'svelte-frontend/',
  'svelte-frontend\\',
  '../svelte-frontend/dist',
], 'retired Svelte frontend path');

const liveSvelteSourceFiles = collectFiles('frontend/src', new Set(['.svelte', '.ts', '.js', '.mjs']))
  .filter((file) => {
    const normalized = toPosix(file);
    return normalized !== 'frontend/src/lib/tauri.ts'
      && normalized !== 'frontend/src/lib/components/preview-pane/PreviewContent.svelte';
  });

assertNoReferences(liveSvelteSourceFiles, [
  '@tauri-apps/api/core',
  'invoke("get_license_status"',
  'invoke("verify_license"',
  '@ts-ignore',
], 'raw Tauri invoke bypass or migration type suppression');

if (process.exitCode) {
  process.exit();
}

console.log('Checked current Svelte behavior bridges and retired migration-glue boundaries.');
