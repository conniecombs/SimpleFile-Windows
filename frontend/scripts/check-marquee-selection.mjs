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

function assertEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

// ── Pure geometry (mirrors marqueeSelection.ts) ────────────────────────────

function normalizeRect(x1, y1, x2, y2) {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function indicesInListMarquee(rect, itemCount, rowHeight, contentWidth) {
  if (itemCount <= 0 || rowHeight <= 0 || contentWidth <= 0) return [];
  if (rect.right <= 0 || rect.left >= contentWidth) return [];
  const first = Math.max(0, Math.floor(rect.top / rowHeight));
  const last = Math.min(itemCount - 1, Math.floor((rect.bottom - Number.EPSILON) / rowHeight));
  if (last < first) return [];
  const indices = [];
  for (let i = first; i <= last; i += 1) indices.push(i);
  return indices;
}

function indicesInGridMarquee(rect, itemCount, columns, itemWidth, itemHeight, gap) {
  if (itemCount <= 0 || columns <= 0 || itemWidth <= 0 || itemHeight <= 0) return [];
  const pitchX = itemWidth + gap;
  const pitchY = itemHeight + gap;
  const totalRows = Math.ceil(itemCount / columns);
  const firstCol = Math.max(0, Math.floor(rect.left / pitchX));
  const lastCol = Math.min(columns - 1, Math.floor((rect.right - Number.EPSILON) / pitchX));
  const firstRow = Math.max(0, Math.floor(rect.top / pitchY));
  const lastRow = Math.min(totalRows - 1, Math.floor((rect.bottom - Number.EPSILON) / pitchY));
  if (lastCol < firstCol || lastRow < firstRow) return [];
  const indices = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = firstCol; col <= lastCol; col += 1) {
      const index = row * columns + col;
      if (index >= itemCount) continue;
      const itemRect = {
        left: col * pitchX,
        top: row * pitchY,
        right: col * pitchX + itemWidth,
        bottom: row * pitchY + itemHeight,
      };
      if (rectsIntersect(rect, itemRect)) indices.push(index);
    }
  }
  return indices;
}

function mergeMarqueeSelection(basePaths, hitPaths, additive) {
  if (!additive) return [...hitPaths];
  const next = new Set(basePaths);
  for (const path of hitPaths) next.add(path);
  return [...next];
}

// List: rows 0..4 height 36, width 400 — marquee covers rows 1-2
assertEqual(
  indicesInListMarquee(normalizeRect(10, 40, 100, 100), 5, 36, 400),
  [1, 2],
  'list marquee rows 1-2',
);

// List: no horizontal overlap
assertEqual(
  indicesInListMarquee(normalizeRect(500, 0, 600, 100), 5, 36, 400),
  [],
  'list marquee outside content width',
);

// Grid: 3 columns, 100x100 tiles, 12 gap — marquee over (0,0) and (1,0)
assertEqual(
  indicesInGridMarquee(normalizeRect(10, 10, 150, 50), 8, 3, 100, 100, 12),
  [0, 1],
  'grid marquee first two tiles',
);

// Grid: pure gap should not select
assertEqual(
  indicesInGridMarquee(normalizeRect(101, 10, 110, 50), 8, 3, 100, 100, 12),
  [],
  'grid marquee pure gap',
);

// Additive merge
assertEqual(
  mergeMarqueeSelection(['a', 'b'], ['b', 'c'], true).sort(),
  ['a', 'b', 'c'],
  'additive merge',
);
assertEqual(
  mergeMarqueeSelection(['a', 'b'], ['c'], false),
  ['c'],
  'replace merge',
);

assertContains('frontend/src/lib/marqueeSelection.ts', [
  'export function indicesInMarquee',
  'export function mergeMarqueeSelection',
  'export function exceededMarqueeThreshold',
  'MARQUEE_AUTO_SCROLL_EDGE_PX',
], 'marquee selection helpers');

assertContains('frontend/src/lib/components/file-list/FileList.svelte', [
  'handleMarqueePointerDown',
  'onpointerdown={handleMarqueePointerDown}',
  'indicesInMarquee',
  'mergeMarqueeSelection',
  'selection-rect',
  'marquee-selecting',
  'clearActiveSelection',
], 'file list marquee wiring');

assertContains('frontend/src/css/modules/interactions.css', [
  '.selection-rect',
  'body.marquee-selecting',
  '.file-list.marquee-selecting',
], 'marquee selection styles');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('check-marquee-selection: ok');
