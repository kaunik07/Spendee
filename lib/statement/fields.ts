// Statement import — reading dates and amounts out of cell text.
//
// Deliberately strict. A loose amount pattern matches page numbers, years,
// account-number fragments and phone numbers, and every one of those becomes a
// fake transaction that the user has to spot in the review table. It is far
// better to fail a row — and trip the confidence gate — than to invent one.

import type { DateFormat } from './types';

// ── Amounts ─────────────────────────────────────────────────

export interface ParsedAmount {
  /** Always positive; the sign lives in `credit`. */
  value: number;
  /**
   * The printed form carried a credit marker: a leading or trailing '-',
   * parentheses, or a CR suffix. What that MEANS is the sign rule's business,
   * not this function's.
   */
  credit: boolean;
}

/**
 * Requires two decimal places, or a currency symbol.
 *
 * This is the single most important guard in the parser. Statements print
 * money with cents; "2026", "Page 4 of 7" and the last four digits of a card
 * do not have them. Accepting bare integers as amounts turns every stray
 * number on the page into a candidate transaction.
 */
const MONEY = /^\d{1,3}(?:,\d{3})*\.\d{2}$|^\d+\.\d{2}$/;
const CURRENCY = /^[$€£₹]\s*/;

export function parseAmount(raw: string): ParsedAmount | null {
  let t = raw.trim();
  if (!t) return null;

  let credit = false;

  // (45.00) — accounting negatives
  if (t.startsWith('(') && t.endsWith(')')) {
    credit = true;
    t = t.slice(1, -1).trim();
  }

  // Trailing CR / DR
  const suffix = t.match(/(CR|DR)$/i);
  if (suffix) {
    if (suffix[1].toUpperCase() === 'CR') credit = true;
    t = t.slice(0, -2).trim();
  }

  // Trailing sign — common on statements printed from mainframe systems
  if (t.endsWith('-')) { credit = true; t = t.slice(0, -1).trim(); }
  else if (t.endsWith('+')) { t = t.slice(0, -1).trim(); }

  // Leading sign
  if (t.startsWith('-')) { credit = true; t = t.slice(1).trim(); }
  else if (t.startsWith('+')) { t = t.slice(1).trim(); }

  const hadCurrency = CURRENCY.test(t);
  t = t.replace(CURRENCY, '');

  if (!MONEY.test(t)) {
    // A currency symbol is proof enough for a whole-unit amount like "$25".
    if (!(hadCurrency && /^\d{1,3}(?:,\d{3})*$|^\d+$/.test(t))) return null;
  }

  const value = Number(t.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;

  return { value, credit };
}

export function isAmountLike(s: string): boolean {
  return parseAmount(s) !== null;
}

// ── Dates ───────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DATE_RES: Record<DateFormat, RegExp> = {
  'MM/DD':       /^(\d{1,2})[/-](\d{1,2})$/,
  'MM/DD/YY':    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/,
  'MM/DD/YYYY':  /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/,
  'DD/MM/YY':    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/,
  'DD/MM/YYYY':  /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/,
  'YYYY-MM-DD':  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  'DD-MMM-YYYY': /^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})$/,
  'MMM DD':      /^([A-Za-z]{3,})\s+(\d{1,2})$/,
};

/**
 * Calendar-validating. Rejecting 02/30 and 13/05 is what lets an ambiguous
 * DD/MM vs MM/DD statement resolve itself: usually one of the two orderings
 * produces an impossible date somewhere in the document.
 */
function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface StatementPeriod { start: string; end: string }

/**
 * Supplies the year to a year-less date (Chase card statements print MM/DD).
 *
 * A statement period can straddle New Year, so a December transaction on a
 * statement closing in January belongs to the PREVIOUS year. Anchoring on the
 * period end and rolling back when the month is later gets both cases right.
 */
function yearFor(month: number, period: StatementPeriod | null): number {
  if (!period) return new Date().getUTCFullYear();
  const endYear  = Number(period.end.slice(0, 4));
  const endMonth = Number(period.end.slice(5, 7));
  if (!Number.isFinite(endYear) || !Number.isFinite(endMonth)) return new Date().getUTCFullYear();
  return month > endMonth ? endYear - 1 : endYear;
}

/** Two-digit years: statements are recent, so 70-99 is last century. */
function expandYear(yy: number): number {
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

export function parseDateWith(
  raw: string,
  format: DateFormat,
  period: StatementPeriod | null = null,
): string | null {
  const m = DATE_RES[format].exec(raw.trim());
  if (!m) return null;

  switch (format) {
    case 'MM/DD': {
      const mo = +m[1], d = +m[2];
      return isoDate(yearFor(mo, period), mo, d);
    }
    case 'MM/DD/YY':   return isoDate(expandYear(+m[3]), +m[1], +m[2]);
    case 'MM/DD/YYYY': return isoDate(+m[3], +m[1], +m[2]);
    case 'DD/MM/YY':   return isoDate(expandYear(+m[3]), +m[2], +m[1]);
    case 'DD/MM/YYYY': return isoDate(+m[3], +m[2], +m[1]);
    case 'YYYY-MM-DD': return isoDate(+m[1], +m[2], +m[3]);
    case 'DD-MMM-YYYY': {
      const mo = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()];
      return mo ? isoDate(+m[3], mo, +m[1]) : null;
    }
    case 'MMM DD': {
      const mo = MONTH_NAMES[m[1].slice(0, 3).toLowerCase()];
      return mo ? isoDate(yearFor(mo, period), mo, +m[2]) : null;
    }
  }
}

/** Cheap "could this cell be a date at all" test, for finding candidate rows. */
export function isDateLike(s: string): boolean {
  const t = s.trim();
  for (const re of Object.values(DATE_RES)) if (re.test(t)) return true;
  return false;
}

export interface DateFormatChoice {
  format: DateFormat | null;
  /** More than one declared format parsed every sample cleanly. */
  ambiguous: boolean;
  /** Fraction of samples the chosen format parsed. */
  parseRate: number;
}

/**
 * Pick the one format that reads every date on the document.
 *
 * When two survive — which happens only when every day-of-month is 12 or lower,
 * so DD/MM and MM/DD are genuinely indistinguishable — the profile's first
 * declared format wins and `ambiguous` is set so the UI can offer a toggle.
 * Rejecting an otherwise perfectly readable statement over that would be
 * needlessly hostile.
 */
export function pickDateFormat(
  samples: string[],
  allowed: DateFormat[],
  period: StatementPeriod | null = null,
): DateFormatChoice {
  if (!samples.length || !allowed.length) return { format: null, ambiguous: false, parseRate: 0 };

  const scored = allowed.map((format) => {
    const ok = samples.filter((s) => parseDateWith(s, format, period) !== null).length;
    return { format, rate: ok / samples.length };
  });

  const best = Math.max(...scored.map((s) => s.rate));
  if (best === 0) return { format: null, ambiguous: false, parseRate: 0 };

  const winners = scored.filter((s) => s.rate === best);
  return {
    format: winners[0].format,          // declaration order breaks the tie
    ambiguous: winners.length > 1 && best === 1,
    parseRate: best,
  };
}
