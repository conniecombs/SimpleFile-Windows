import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const roots = [
  join(repoRoot, 'scripts'),
  join(repoRoot, 'frontend', 'scripts'),
  join(repoRoot, 'frontend', 'src'),
];
const extensions = new Set(['.js', '.mjs']);

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

function collectJavaScriptFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') return [];
        return collectJavaScriptFiles(path);
      }
      return entry.isFile() && extensions.has(extensionOf(entry.name)) ? [path] : [];
    })
    .sort();
}

const files = [...new Set(roots.flatMap((root) => collectJavaScriptFiles(root)))].sort();
let failed = false;

for (const file of files) {
  console.log(`Checking ${relative(repoRoot, file)}`);
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Checked ${files.length} JavaScript module files.`);
