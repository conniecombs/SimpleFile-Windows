import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { sanitizeModalHtml } from '../src/lib/modalHtmlSecurity.mjs';

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
    'frontend/src/lib/app/core.ts',
    new Set([
      'body.innerHTML = sanitizeModalHtml(bodyHtml);',
    ]),
  ],
  [
    'frontend/src/lib/components/modal-body/ModalBody.svelte',
    new Set([
      '{@html sanitizedBodyHtml}',
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
const modalCore = read('frontend/src/lib/app/core.ts');
const modalBody = read('frontend/src/lib/components/modal-body/ModalBody.svelte');
const modalBodyWrapper = read('frontend/src/lib/components/modal-body.ts');

for (const [file, source] of [
  ['frontend/src/lib/components/quick-look/QuickLookModal.svelte', quickLookModal],
  ['frontend/src/lib/components/quick-look.ts', quickLookWrapper],
]) {
  assertMissing(source, file, 'legacyContent', 'legacy QuickLook content API');
  assertMissing(source, file, 'innerHTML', 'raw HTML injection');
}

for (const [file, source] of [
  ['frontend/src/lib/app/core.ts', modalCore],
  ['frontend/src/lib/components/modal-body/ModalBody.svelte', modalBody],
  ['frontend/src/lib/components/modal-body.ts', modalBodyWrapper],
]) {
  if (!source.includes('sanitizeModalHtml')) {
    fail(`${file} must route modal HTML through sanitizeModalHtml.`);
  }
}

const sanitized = sanitizeModalHtml(`
  <script>alert(1)</script>
  <img src=x onerror=alert(1)>
  <a href="javascript:alert(1)">bad link</a>
  <div id="safe-modal" class="modal-test" onclick="alert(1)" data-index="2">
    <label style="display:flex;gap:8px;cursor:pointer;background-image:url(javascript:alert(1))">
      <input id="safe-input" type="radio" name="choice" value="safe" checked onchange="alert(1)">
      <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background-color:#22c55e"></span>
      Safe option
    </label>
    <table><tbody><tr><td colspan="4">safe cell</td></tr></tbody></table>
  </div>
`);

for (const forbidden of [
  '<script',
  '<img',
  '<a',
  'onerror',
  'onclick',
  'onchange',
  'javascript:',
  'background-image',
  'url(',
]) {
  assertMissing(sanitized, 'sanitizeModalHtml(sample)', forbidden, 'unsafe modal HTML');
}

for (const required of [
  'id="safe-modal"',
  'class="modal-test"',
  'data-index="2"',
  'style="display:flex;gap:8px;cursor:pointer"',
  'id="safe-input"',
  'type="radio"',
  'name="choice"',
  'value="safe"',
  'checked',
  'background-color:#22c55e',
  'colspan="4"',
]) {
  if (!sanitized.includes(required)) {
    fail(`sanitizeModalHtml(sample) should preserve reviewed modal markup: ${required}`);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log('Checked active frontend HTML sink allowlist.');
