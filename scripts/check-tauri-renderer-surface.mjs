import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const frontendSrc = join(repoRoot, 'frontend', 'src');
const tauriWrapper = 'frontend/src/lib/tauri.ts';

function fail(message) {
  console.error(`Tauri renderer surface check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
}

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: lines.at(-1).length + 1,
  };
}

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.svelte-kit'].includes(entry.name)) {
          return [];
        }
        return collectSourceFiles(path);
      }

      return entry.isFile() && ['.svelte', '.ts', '.js', '.mjs'].includes(extname(entry.name))
        ? [path]
        : [];
    })
    .sort();
}

const tauriConfig = readJson('src-tauri/tauri.conf.json');
if (tauriConfig.app?.withGlobalTauri !== false) {
  fail('src-tauri/tauri.conf.json must set app.withGlobalTauri to false.');
}

const globalTauriPattern = /(?<![A-Za-z0-9_])__TAURI__(?![A-Za-z0-9_])/g;
const directTauriImportPattern =
  /(?:from\s+['"]@tauri-apps\/api\/[^'"]+['"]|import\s*\(\s*['"]@tauri-apps\/api\/[^'"]+['"]\s*\))/g;

for (const file of collectSourceFiles(frontendSrc)) {
  const source = readFileSync(file, 'utf8');
  const rel = toPosix(relative(repoRoot, file));

  for (const match of source.matchAll(globalTauriPattern)) {
    const location = lineAndColumn(source, match.index);
    fail(`${rel}:${location.line}:${location.column} must not use the global __TAURI__ API.`);
  }

  if (rel === tauriWrapper) continue;

  for (const match of source.matchAll(directTauriImportPattern)) {
    const location = lineAndColumn(source, match.index);
    fail(`${rel}:${location.line}:${location.column} must import Tauri access through ${tauriWrapper}.`);
  }
}

if (!process.exitCode) {
  console.log('Tauri renderer surface is scoped to the typed local wrapper.');
}
