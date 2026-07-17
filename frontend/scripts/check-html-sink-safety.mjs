import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

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

function toPosix(path) {
  return path.replaceAll('\\', '/');
}

function collectFiles(directory, extensions) {
  const resolved = absolute(directory);
  if (!existsSync(resolved)) return [];

  return readdirSync(resolved, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(resolved, entry.name);
    const relativePath = toPosix(relative(root, absolutePath));

    if (entry.isDirectory()) {
      if (relativePath === 'frontend/src/vanilla-js/generated-svelte') {
        return [];
      }
      return collectFiles(relativePath, extensions);
    }

    return entry.isFile() && extensions.has(extname(entry.name)) ? [relativePath] : [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function assertMissing(source, file, value, label) {
  if (source.includes(value)) {
    fail(`${file} must not contain ${label}: ${value}`);
  }
}

const allowedHtmlSinks = new Map([
  [
    'frontend/src/App.svelte',
    new Set([
      '{@html legacyOverlayMarkup}',
    ]),
  ],
  [
    'frontend/src/lib/app/core.ts',
    new Set([
      'body.innerHTML = bodyHtml;',
    ]),
  ],
  [
    'frontend/src/lib/components/legacy-overlays.ts',
    new Set([
      'template.innerHTML = legacyBodyMatch[1];',
      'export const legacyOverlayMarkup = template.innerHTML.trim();',
    ]),
  ],
  [
    'frontend/src/lib/components/modal-body/ModalBody.svelte',
    new Set([
      '{@html bodyHtml}',
    ]),
  ],
  [
    'frontend/src/lib/components/preview-pane/PreviewContent.svelte',
    new Set([
      '{@html renderedMarkdown}',
      '{@html codeHtml}',
    ]),
  ],
]);

const activeFiles = collectFiles('frontend/src', new Set(['.svelte', '.ts', '.js', '.mjs']));
const htmlBlockPattern = /\{@html\s+[^}]+\}/g;

for (const file of activeFiles) {
  const source = read(file);
  const allowedSinks = allowedHtmlSinks.get(file) ?? new Set();

  const lines = source.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    if (line.includes('innerHTML')) {
      const value = line.trim();
      if (!allowedSinks.has(value)) {
        fail(`${file}:${lineIndex + 1} has unreviewed HTML sink: ${value}`);
      }
    }
  }

  for (const match of source.matchAll(htmlBlockPattern)) {
    const value = match[0];
    if (!allowedSinks.has(value)) {
      fail(`${file}:${lineNumber(source, match.index ?? 0)} has unreviewed HTML sink: ${value}`);
    }
  }
}

const quickLookModal = read('frontend/src/lib/components/quick-look/QuickLookModal.svelte');
const quickLookWrapper = read('frontend/src/lib/components/quick-look.ts');

for (const [file, source] of [
  ['frontend/src/lib/components/quick-look/QuickLookModal.svelte', quickLookModal],
  ['frontend/src/lib/components/quick-look.ts', quickLookWrapper],
]) {
  assertMissing(source, file, 'legacyContent', 'legacy QuickLook content API');
  assertMissing(source, file, 'innerHTML', 'raw HTML injection');
}

if (process.exitCode) {
  process.exit();
}

console.log('Checked active frontend HTML sink allowlist.');
