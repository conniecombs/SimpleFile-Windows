import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderSafeMarkdown } from '../src/lib/markdownPreviewSecurity.mjs';

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

function assertIncludes(source, value, label) {
  if (!source.includes(value)) {
    fail(`${label} is missing expected value: ${value}`);
  }
}

function assertExcludes(source, value, label) {
  if (source.includes(value)) {
    fail(`${label} still contains unsafe value: ${value}`);
  }
}

const unsafeMarkdown = [
  '# Heading',
  '',
  '**Bold** [safe link](https://example.com)',
  '',
  '<script>alert("script")</script>',
  '<img src="x" onerror="alert(1)">',
  '<a href="javascript:alert(1)" onclick="alert(2)">unsafe link</a>',
  '<div style="position:fixed;inset:0">layout injection</div>',
].join('\n');

const rendered = renderSafeMarkdown(unsafeMarkdown);

assertIncludes(rendered, '<h1>Heading</h1>', 'sanitized markdown render');
assertIncludes(rendered, '<strong>Bold</strong>', 'sanitized markdown render');
assertIncludes(rendered, '<a href="https://example.com">safe link</a>', 'sanitized markdown render');

for (const unsafeValue of [
  '<script',
  '</script',
  '<img',
  'onerror',
  'onclick',
  'javascript:',
  '<div',
  'style=',
]) {
  assertExcludes(rendered.toLowerCase(), unsafeValue, 'sanitized markdown render');
}

const previewComponent = read('frontend/src/lib/components/preview-pane/PreviewContent.svelte');
assertIncludes(
  previewComponent,
  "import { renderSafeMarkdown } from '../../markdownPreviewSecurity.mjs';",
  'PreviewContent markdown safety wiring',
);
assertIncludes(
  previewComponent,
  'renderedMarkdown = renderSafeMarkdown(preview.content);',
  'PreviewContent markdown safety wiring',
);
assertExcludes(previewComponent, 'marked.parse(preview.content)', 'PreviewContent markdown safety wiring');
assertExcludes(previewComponent, "import { marked } from 'marked';", 'PreviewContent markdown safety wiring');

if (process.exitCode) {
  process.exit();
}

console.log('Checked Markdown preview sanitization.');
