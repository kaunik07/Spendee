// Statement import — positioned text to a row/column grid.
//
// Pure geometry: no dates, no amounts, no bank knowledge. Given
// PositionedItem[] it answers two questions — which runs share a line, and
// where the column boundaries are — and nothing else. That keeps it testable
// against hand-written fixtures and reusable by every bank profile.

import type { PositionedItem } from './types';

/**
 * A run joins the current line while its baseline is within this fraction of
 * the median glyph height. 0.6 of a ~10pt line is ~6pt: comfortably more than
 * the sub-point jitter of a normal line, comfortably less than a line gap.
 */
export const Y_TOLERANCE_FACTOR = 0.6;

/**
 * Whitespace narrower than this is inter-word spacing, not a column boundary.
 * At statement font sizes a real gutter is 10pt or more, while the widest
 * inter-word gap is ~4pt.
 */
export const MIN_GUTTER_PT = 6;

export interface Row {
  page:  number;
  index: number;            // position in document order
  y:     number;            // median baseline of the row's runs
  items: PositionedItem[];  // sorted left to right
  text:  string;            // runs joined by single spaces — for heading matching
}

export interface Column {
  start: number;
  end:   number;
}

function median(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Cluster runs into lines.
 *
 * Grouped per page, because y is only comparable within a page, and walked in
 * descending y since PDF user space grows upward.
 *
 * Each candidate is compared against the row's RUNNING MEDIAN baseline rather
 * than its first run. Comparing against the first run lets one outlier — a
 * superscript, a larger font in the amount column — drag the anchor far enough
 * that the rest of the line no longer matches and a single row splits in two.
 */
export function groupRows(items: PositionedItem[]): Row[] {
  if (!items.length) return [];

  const heights = items.map((i) => i.h).filter((h) => h > 0);
  const yTol = (median(heights) || 10) * Y_TOLERANCE_FACTOR;

  const byPage = new Map<number, PositionedItem[]>();
  for (const it of items) {
    const bucket = byPage.get(it.page);
    if (bucket) bucket.push(it);
    else byPage.set(it.page, [it]);
  }

  const rows: Row[] = [];

  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = [...byPage.get(page)!].sort((a, b) => (b.y - a.y) || (a.x - b.x));

    let current: PositionedItem[] = [];

    const flush = () => {
      if (!current.length) return;
      const ordered = [...current].sort((a, b) => a.x - b.x);
      rows.push({
        page,
        index: rows.length,
        y: median(ordered.map((i) => i.y)),
        items: ordered,
        text: normalizeSpaces(ordered.map((i) => i.str).join(' ')),
      });
      current = [];
    };

    for (const it of pageItems) {
      if (!current.length) { current.push(it); continue; }
      if (Math.abs(it.y - median(current.map((i) => i.y))) <= yTol) current.push(it);
      else { flush(); current.push(it); }
    }
    flush();
  }

  return rows;
}

/**
 * Find column boundaries from the whitespace between runs.
 *
 * The obvious approach — histogram the left edges and call the peaks columns —
 * fails on money, which is right-aligned: "6.25" and "1,204.00" start at
 * different x and would look like two columns. Instead this projects every
 * run's horizontal extent onto the x-axis, merges the overlaps, and treats the
 * GAPS between the resulting blocks as the boundaries. One mechanism then
 * handles left-aligned descriptions and right-aligned amounts alike.
 *
 * Pass only the rows that look like transactions. Feeding it every row on the
 * page unions the address block, the marketing footer and the summary table
 * into one continuous span, leaving no gutters at all.
 */
export function inferColumns(rows: Row[]): Column[] {
  const spans: [number, number][] = [];
  for (const r of rows) {
    for (const i of r.items) spans.push([i.x, i.x + i.w]);
  }
  if (!spans.length) return [];

  spans.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (spans[i][0] <= last[1]) last[1] = Math.max(last[1], spans[i][1]);
    else merged.push([...spans[i]]);
  }

  const columns: Column[] = [];
  let start = merged[0][0];
  for (let i = 1; i < merged.length; i++) {
    if (merged[i][0] - merged[i - 1][1] >= MIN_GUTTER_PT) {
      columns.push({ start, end: merged[i - 1][1] });
      start = merged[i][0];
    }
  }
  columns.push({ start, end: merged[merged.length - 1][1] });

  return columns;
}

/**
 * Which column a run belongs to, or -1 if there are no columns.
 *
 * Midpoint first, since that is right for the overwhelming majority. A run
 * whose midpoint lands in a gutter goes to whichever column it overlaps most —
 * the case that matters is a long description spilling toward the amount
 * column, which should stay a description.
 */
export function columnOf(item: PositionedItem, columns: Column[]): number {
  if (!columns.length) return -1;

  const mid = item.x + item.w / 2;
  for (let i = 0; i < columns.length; i++) {
    if (mid >= columns[i].start && mid <= columns[i].end) return i;
  }

  let best = -1;
  let bestOverlap = 0;
  for (let i = 0; i < columns.length; i++) {
    const overlap = Math.min(item.x + item.w, columns[i].end) - Math.max(item.x, columns[i].start);
    if (overlap > bestOverlap) { bestOverlap = overlap; best = i; }
  }
  if (best !== -1) return best;

  // Entirely outside every column — a stray mark, or a run on a page whose
  // layout differs from the transaction rows the columns were inferred from.
  let nearest = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const dist = mid < columns[i].start ? columns[i].start - mid
               : mid > columns[i].end   ? mid - columns[i].end
               : 0;
    if (dist < nearestDist) { nearestDist = dist; nearest = i; }
  }
  return nearest;
}

/** The row's text bucketed by column. Always `columns.length` entries. */
export function cellsOf(row: Row, columns: Column[]): string[] {
  const buckets: string[][] = columns.map(() => []);
  for (const it of row.items) {
    const c = columnOf(it, columns);
    if (c >= 0) buckets[c].push(it.str);
  }
  return buckets.map((b) => normalizeSpaces(b.join(' ')));
}
