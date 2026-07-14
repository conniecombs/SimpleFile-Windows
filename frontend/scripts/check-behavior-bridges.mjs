import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const generatedRoot = 'frontend/src/vanilla-js/generated-svelte';

function absolute(path) {
  return resolve(root, path);
}

function read(path) {
  const resolved = absolute(path);
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
    generated: `${generatedRoot}/breadcrumb.js`,
    events: [
      'simplefile:breadcrumb-focus',
      'simplefile:breadcrumb-navigate',
    ],
  },
  {
    name: 'file-list item interactions',
    source: 'frontend/src/lib/components/file-list/FileListItems.svelte',
    generated: `${generatedRoot}/file-list.js`,
    events: [
      'simplefile:file-list-item-click',
      'simplefile:file-list-item-open',
    ],
  },


  {
    name: 'quick filter',
    source: 'frontend/src/lib/components/search-chrome/QuickFilterBar.svelte',
    generated: `${generatedRoot}/search-chrome.js`,
    events: [
      'simplefile:quick-filter-clear',
      'simplefile:quick-filter-input',
    ],
  },
  {
    name: 'search results header',
    source: 'frontend/src/lib/components/search-chrome/SearchResultsHeader.svelte',
    generated: `${generatedRoot}/search-chrome.js`,
    events: [
      'simplefile:search-results-clear',
    ],
  },
  {
    name: 'tabs',
    source: 'frontend/src/lib/components/tabs/TabsBar.svelte',
    generated: `${generatedRoot}/tabs.js`,
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
    generated: `${generatedRoot}/tree-view.js`,
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
    generated: `${generatedRoot}/layout-shell.js`,
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
  assertContains(contract.generated, contract.events, `${contract.name} generated event`);
}

assertContains('frontend/src/lib/components/file-list/FileListItems.svelte', [
  'draggable="true"',
  'data-path={item.path}',
  'data-is-dir={item.isDir}',
], 'file-list drag/drop source contract');

assertContains(`${generatedRoot}/file-list.js`, [
  'draggable="true"',
  '"data-path"',
  '"data-is-dir"',
], 'file-list drag/drop generated contract');

assertContains('frontend/src/App.svelte', [
  "import { renderLayoutShell } from './lib/components/layout-shell';",
  'class="app-container"',
  '{@html legacyOverlayMarkup}',
], 'Svelte app shell owner');

assertContains('frontend/src/lib/components/legacy-overlays.ts', [
  '#settings-overlay',
], 'retired legacy settings overlay removal');

assertNoReferences([
  'frontend/src/lib/components/legacy-shell-template.html',
], [
  'id="settings-overlay"',
  'settings-modal',
], 'retired legacy settings overlay source');

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

assertNoReferences([
  'frontend/src/lib/components/legacy-shell-template.html',
], [
  'src="js/app.js"',
  'js/theme-preload.js',
  'js/startup-guard.js',
], 'retired legacy script reference');

assertContains('frontend/src/vanilla-js/runtime/state.svelte.js', [
  'export const state',
  'export function subscribe',
  'export function uniqueId',
  'smartFolders: []',
], 'plain JavaScript runtime state');

assertContains('frontend/src/vanilla-js/runtime/startup-location.js', [
  'export function resolveStartupLocation',
  "mode === 'custom'",
  "mode === 'last'",
], 'startup-location runtime helper');

assertContains('frontend/src/vanilla-js/README.md', [
  'runtime/',
  'generated-svelte/',
], 'vanilla JavaScript folder documentation');

assertContains('README.md', [
  'frontend/src/vanilla-js/runtime/',
  'frontend/src/vanilla-js/generated-svelte/',
], 'README vanilla JavaScript documentation');

const generatedFiles = readdirSync(absolute(generatedRoot)).filter((file) => extname(file) === '.js');
if (generatedFiles.length < bridgeContracts.length) {
  fail(`${generatedRoot} should contain generated Svelte JavaScript bundles`);
}

assertMissing('frontend/js', 'retired vanilla JavaScript runtime folder');
assertMissing('frontend/src/lib/state.svelte.js', 'retired state runtime location');
assertMissing('frontend/src/lib/components/js', 'retired legacy bridge JavaScript folder');

const activeReferenceFiles = [
  ...collectFiles('frontend/src', new Set(['.svelte', '.ts', '.js', '.mjs', '.md'])),
  ...collectFiles('frontend/scripts', new Set(['.js', '.mjs'])),
  ...collectFiles('scripts', new Set(['.js', '.mjs'])),
  'README.md',
  'docs/CONTRIBUTING.md',
  'package.json',
  'frontend/package.json',
].filter((file) => file !== 'frontend\\scripts\\check-behavior-bridges.mjs'
  && file !== 'frontend/scripts/check-behavior-bridges.mjs'
  && file !== 'frontend\\scripts\\check-migration-complete.mjs'
  && file !== 'frontend/scripts/check-migration-complete.mjs');

assertNoReferences(activeReferenceFiles, [
  'frontend/js/',
  'frontend\\js\\',
  'frontend/src/lib/state.svelte.js',
  'frontend/src/lib/components/js/svelte',
  './lib/state.svelte.js',
  '../../state.svelte.js',
], 'retired vanilla JavaScript path');

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
    return !normalized.startsWith(`${generatedRoot}/`)
      && normalized !== 'frontend/src/lib/tauri.ts'
      && normalized !== 'frontend/src/lib/components/preview-pane/PreviewContent.svelte';
  });

assertNoReferences(liveSvelteSourceFiles, [
  '@tauri-apps/api/core',
  'invoke("get_license_status"',
  'invoke("verify_license"',
], 'raw Tauri invoke bypass');

if (process.exitCode) {
  process.exit();
}

console.log('Checked current Svelte behavior bridges and vanilla JavaScript folder boundaries.');
