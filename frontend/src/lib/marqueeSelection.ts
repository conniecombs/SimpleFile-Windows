/**
 * Pure geometry helpers for rubber-band (marquee) multi-select.
 * Coordinates are in file-list content space (after padding, including scroll).
 */

export type MarqueeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MarqueeListLayout = {
  mode: 'list';
  itemCount: number;
  rowHeight: number;
  contentWidth: number;
};

export type MarqueeGridLayout = {
  mode: 'grid';
  itemCount: number;
  columns: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
};

export type MarqueeLayout = MarqueeListLayout | MarqueeGridLayout;

/** Minimum pointer movement (px) before a press becomes a marquee drag. */
export const MARQUEE_DRAG_THRESHOLD_PX = 4;

/** Edge band (px) that triggers auto-scroll during marquee. */
export const MARQUEE_AUTO_SCROLL_EDGE_PX = 28;

/** Pixels scrolled per animation frame while pointer is in the edge band. */
export const MARQUEE_AUTO_SCROLL_SPEED_PX = 18;

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): MarqueeRect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

export function rectsIntersect(a: MarqueeRect, b: MarqueeRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function clientPointToContent(
  clientX: number,
  clientY: number,
  listRect: DOMRect,
  scrollLeft: number,
  scrollTop: number,
  paddingLeft: number,
  paddingTop: number,
): { x: number; y: number } {
  return {
    x: clientX - listRect.left - paddingLeft + scrollLeft,
    y: clientY - listRect.top - paddingTop + scrollTop,
  };
}

/** True when the event landed on the scrollbar track/thumb rather than content. */
export function isPointOnScrollbar(
  clientX: number,
  clientY: number,
  listRect: DOMRect,
  clientWidth: number,
  clientHeight: number,
): boolean {
  return (
    clientX > listRect.left + clientWidth
    || clientY > listRect.top + clientHeight
  );
}

export function indicesInListMarquee(
  rect: MarqueeRect,
  itemCount: number,
  rowHeight: number,
  contentWidth: number,
): number[] {
  if (itemCount <= 0 || rowHeight <= 0 || contentWidth <= 0) {
    return [];
  }

  // Full-width rows: require horizontal overlap with the content column.
  if (rect.right <= 0 || rect.left >= contentWidth) {
    return [];
  }

  const first = Math.max(0, Math.floor(rect.top / rowHeight));
  const last = Math.min(itemCount - 1, Math.floor((rect.bottom - Number.EPSILON) / rowHeight));
  if (last < first) {
    return [];
  }

  const indices: number[] = [];
  for (let i = first; i <= last; i += 1) {
    indices.push(i);
  }
  return indices;
}

export function indicesInGridMarquee(
  rect: MarqueeRect,
  itemCount: number,
  columns: number,
  itemWidth: number,
  itemHeight: number,
  gap: number,
): number[] {
  if (
    itemCount <= 0
    || columns <= 0
    || itemWidth <= 0
    || itemHeight <= 0
  ) {
    return [];
  }

  const pitchX = itemWidth + gap;
  const pitchY = itemHeight + gap;
  const totalRows = Math.ceil(itemCount / columns);

  const firstCol = Math.max(0, Math.floor(rect.left / pitchX));
  const lastCol = Math.min(columns - 1, Math.floor((rect.right - Number.EPSILON) / pitchX));
  const firstRow = Math.max(0, Math.floor(rect.top / pitchY));
  const lastRow = Math.min(totalRows - 1, Math.floor((rect.bottom - Number.EPSILON) / pitchY));

  if (lastCol < firstCol || lastRow < firstRow) {
    return [];
  }

  const indices: number[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = firstCol; col <= lastCol; col += 1) {
      const index = row * columns + col;
      if (index >= itemCount) {
        continue;
      }

      const itemRect: MarqueeRect = {
        left: col * pitchX,
        top: row * pitchY,
        right: col * pitchX + itemWidth,
        bottom: row * pitchY + itemHeight,
      };

      // Skip pure gap cells (marquee only covers the gutter, not the tile).
      if (rectsIntersect(rect, itemRect)) {
        indices.push(index);
      }
    }
  }

  return indices;
}

export function indicesInMarquee(rect: MarqueeRect, layout: MarqueeLayout): number[] {
  if (layout.mode === 'list') {
    return indicesInListMarquee(rect, layout.itemCount, layout.rowHeight, layout.contentWidth);
  }

  return indicesInGridMarquee(
    rect,
    layout.itemCount,
    layout.columns,
    layout.itemWidth,
    layout.itemHeight,
    layout.gap,
  );
}

/**
 * Merge marquee hits with the selection that existed at drag start.
 * - replace: selection becomes only the hit set
 * - additive (Ctrl/Meta): union of base selection and hits
 */
export function mergeMarqueeSelection(
  basePaths: Iterable<string>,
  hitPaths: Iterable<string>,
  additive: boolean,
): string[] {
  if (!additive) {
    return [...hitPaths];
  }

  const next = new Set(basePaths);
  for (const path of hitPaths) {
    next.add(path);
  }
  return [...next];
}

export function exceededMarqueeThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = MARQUEE_DRAG_THRESHOLD_PX,
): boolean {
  const dx = currentX - startX;
  const dy = currentY - startY;
  return (dx * dx) + (dy * dy) >= threshold * threshold;
}
