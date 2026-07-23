import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`Windows asset check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
}

function assertMissing(path) {
  if (existsSync(resolve(repoRoot, path))) {
    fail(`${path} should not be tracked in the Windows-only package surface.`);
  }
}

for (const path of [
  'src-tauri/icons/icon.icns',
  'src-tauri/icons/android',
  'src-tauri/icons/ios',
  'src-tauri/gen/schemas/linux-schema.json',
]) {
  assertMissing(path);
}

const tauriConfig = readJson('src-tauri/tauri.conf.json');
const icons = tauriConfig.bundle?.icon ?? [];
const forbiddenIconFragments = [
  'icon.icns',
  'icons/android/',
  'icons/ios/',
];

for (const icon of icons) {
  const normalized = String(icon).replaceAll('\\', '/');
  for (const fragment of forbiddenIconFragments) {
    if (normalized.includes(fragment)) {
      fail(`src-tauri/tauri.conf.json bundle.icon should not include ${icon}.`);
    }
  }
}

const targets = tauriConfig.bundle?.targets ?? [];
const expectedTargets = ['nsis', 'msi'];
const unexpectedTargets = targets.filter((target) => !expectedTargets.includes(target));
const missingTargets = expectedTargets.filter((target) => !targets.includes(target));

if (unexpectedTargets.length) {
  fail(`src-tauri/tauri.conf.json has non-Windows bundle targets: ${unexpectedTargets.join(', ')}.`);
}

if (missingTargets.length) {
  fail(`src-tauri/tauri.conf.json is missing Windows bundle targets: ${missingTargets.join(', ')}.`);
}

if (!process.exitCode) {
  console.log('Windows packaging assets are scoped to NSIS/MSI.');
}
