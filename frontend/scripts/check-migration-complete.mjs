import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
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

const rootPackage = readJson('package.json');
const sveltePackage = readJson('frontend/package.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');

assertEqual(
  tauriConfig.build?.frontendDist,
  '../frontend/dist',
  'Tauri frontendDist',
);

assertEqual(
  tauriConfig.build?.beforeDevCommand,
  'npm --prefix frontend run build',
  'Tauri beforeDevCommand',
);

assertEqual(
  tauriConfig.build?.beforeBuildCommand,
  'npm --prefix frontend run build',
  'Tauri beforeBuildCommand',
);

assertEqual(
  rootPackage.scripts?.['check:migration'],
  'npm --prefix frontend run check:migration',
  'root check:migration script',
);

assertEqual(
  sveltePackage.scripts?.['check:migration'],
  'node scripts/check-migration-complete.mjs',
  'Svelte check:migration script',
);

assertContains('frontend/package.json', [
  'npm run check:migration && npm run check:api-parity',
], 'migration check in Svelte gate');

assertContains('frontend/src/main.ts', [
  "import App from './App.svelte';",
  'mount(App, { target: document.body });',
], 'shipping Svelte bootstrap');

assertContains('frontend/src/App.svelte', [
  "import { renderLayoutShell } from './lib/components/layout-shell';",
  'class="app-container"',
], 'Svelte app bridge owner');

assertContains('docs/svelte-migration-plan.md', [
  'frontend/src/main.ts',
  '../frontend/dist',
  'frontend/src/vanilla-js/runtime/',
  'frontend/src/vanilla-js/generated-svelte/',
  '3. File navigation workflow retirement. Done:',
  '4. Dialog and command workflow retirement. Done:',
  '5. Search and transfer workflow retirement. Done:',
  '6. Legacy event and DOM bridge removal. Done:',
  '7. Final cleanup and release verification. Done:',
  'The Svelte migration is complete for the shipping frontend.',
], 'completed migration plan');

assertNotContains('docs/svelte-migration-plan.md', [
  'In progress:',
], 'unfinished migration status');

assertContains('frontend/scripts/migrate-components.ps1', [
  'one-shot Svelte component migration script is retired',
  'frontend/src/vanilla-js',
  'check:migration',
], 'retired migration script guard');

assertNotContains('frontend/scripts/migrate-components.ps1', [
  'Remove-Item',
  'Move-Item',
  'Set-Content',
  'R:\\SimpleFile-Svelte',
], 'destructive retired migration script command');

assertContains('README.md', [
  'frontend/src/main.ts',
  'frontend/src/vanilla-js/runtime/',
  'frontend/src/vanilla-js/generated-svelte/',
], 'current README frontend layout');

assertNotContains('README.md', [
  'svelte-frontend/dist',
  'svelte-frontend/',
  'frontend/js/',
], 'retired README frontend layout');

assertContains('docs/CONTRIBUTING.md', [
  'frontend/src/main.ts',
  'frontend/src/lib/components/',
  'frontend/src/vanilla-js/runtime/',
  'frontend/src/vanilla-js/generated-svelte/',
], 'current contributor frontend layout');

assertNotContains('docs/CONTRIBUTING.md', [
  'svelte-frontend/',
  'frontend/js/',
], 'retired contributor frontend layout');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Svelte migration completion gates.');
