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

function assertNotContains(file, values, label = 'retired value') {
  const source = read(file);
  for (const value of values) {
    if (source.includes(value)) {
      fail(`${file} still contains ${label}: ${value}`);
    }
  }
}

assertContains('frontend/src/lib/app/core.ts', [
  'function syncSettingsControls',
  'function saveSettingsFromControls',
  'async function updateToolStatus',
  'async function showAboutFlow',
  'async function checkForUpdatesFlow',
  'async function installUpdateFlow',
], 'Stage 4 settings helper');

assertContains('frontend/src/lib/app/setup.ts', [
  'selectDirectory,',
  'checkRarInstalled,',
  'installRar,',
  "case 'settings-custom-path-browse':",
  "case 'rar-install-btn':",
  "case 'update-check-btn':",
  "case 'update-install-btn':",
  "case 'btn-about':",
  'removeBookmark(bookmarkRow.dataset.id)',
  "document.addEventListener('click', handleSettingsClick);",
  "document.addEventListener('click', handleSettingsListClick);",
  "document.removeEventListener('click', handleSettingsClick);",
  "document.removeEventListener('click', handleSettingsListClick);",
], 'Stage 4 settings command');

assertContains('frontend/src/lib/components/settings-body/SettingsBody.svelte', [
  'id="settings-theme"',
  'id="settings-default-view"',
  'id="settings-icon-size"',
  'id="settings-start-location"',
  'id="settings-custom-path-browse"',
  'id="rar-install-btn"',
  'id="update-check-btn"',
  'id="update-install-btn"',
  'id="btn-about"',
], 'Stage 4 settings control id');

assertNotContains('frontend/src/lib/components/settings-body/SettingsBody.svelte', [
  `btn-${'remote'}-${'drives'}`,
  `${'r'}${'clone'}-install-btn`,
  `${'win'}${'fsp'}-install-btn`,
], 'retired settings control id');

assertContains('frontend/src/lib/tauri.ts', [
  "case 'select_directory':",
  "case 'check_rar_installed':",
  "case 'install_rar':",
  "case 'get_app_about_info':",
  "case 'check_for_update':",
  "case 'install_update':",
], 'Stage 4 browser dev fallback');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Stage 4 settings/tools wiring.');
