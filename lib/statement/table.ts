// Statement import — assembling RawTxn[] from rows and a BankProfile.
// Generic: every rule here comes from the profile parameter, not from any
// bank's specifics, which is what makes this file testable against a
// synthetic profile and reusable unchanged once a real Chase profile exists.

import { isAmountLike, isDateLike, isDateLikePrefix, parseAmount, parseDateWith, pickDateFormat, StatementPeriod } from './fields';
import { cellsOf, Column, inferColumns, Row } from './layout';
import type { BankProfile, ColumnRole, DateFormat, Direction, RawTxn, SectionRule } from './types';

export interface AssembleResult {
  txns: RawTxn[];
  sectionsMatched: string[];
  bodyRows: number;
  columnCount: number;
  dateParseRate: number;
  amountParseRate: number;
  continuationRatio: number;
  dateFormatAmbiguous: boolean;
  period: StatementPeriod | null;
  /** Parsed total per section, keyed by SectionRule.id, when a matching totalLabel row was found. */
  printedTotals: Record<string, number>;
}

/**
 * A loose, column-free filter: does this row's text READ like a transaction
 * — a date-shaped opening, and an amount-shaped token somewhere in it?
 *
 * This runs BEFORE column inference and is why it has to work off raw text
 * rather than cells. Running inferColumns over every row on the page —
 * header lines, the address block, footer disclaimers — was the original
 * bug here: a wide line of footer prose spans the exact x-range that would
 * otherwise be the gutter between the date and description columns, so
 * inferColumns saw no gap there and merged the two into one column. Feeding
 * it only rows that already look like transactions is what layout.ts's own
 * inferColumns docstring warns is required, and what this function supplies.
 *
 * The date check uses the row's leading TEXT, not its first whitespace
 * token — a real gap this had until tested against a document whose dates
 * are three tokens ("Mar 29, 2026"): `isDateLike(tokens[0])` tests only
 * "Mar" against patterns that all expect a complete date, so it never
 * matched and every row in the document was silently rejected as a
 * candidate. isDateLikePrefix checks whether the row's text OPENS with a
 * date shape, regardless of how many tokens that shape spans.
 */
function looksLikeTransactionRow(row: Row): boolean {
  const tokens = row.text.trim().split(/\s+/);
  if (!tokens.length) return false;
  return isDateLikePrefix(row.text) && tokens.some((t) => isAmountLike(t));
}

/**
 * Assigns each grid column a role by matching the header row's cells against
 * the profile's declared column headers. Falls back to position (first
 * column is the date, last is treated as an amount candidate) when no header
 * row is found — the case a header-less signed-column statement needs.
 *
 * A real bug lived here until tested against a document with an explicitly
 * IGNORED middle column: Chase's spending report has Posted Date between
 * Transaction Date and Description, and the profile correctly matches it to
 * role 'ignore'. But the positional-fallback pass below couldn't tell
 * "still the untouched default, header matching found nothing for this
 * column" apart from "the header matched, and what it matched to WAS
 * ignore" — both look identical as `roles[i] === 'ignore'`. So the fallback
 * treated Posted Date's column as unresolved and overwrote it with
 * 'description', and every transaction's description field silently became
 * its posted date instead of its actual merchant text. `matched[]` tracks
 * which columns a header rule actually touched, so the fallback only ever
 * applies to genuinely unmatched columns.
 */
function assignRoles(headerRow: Row | null, columns: Column[], profile: BankProfile): ColumnRole[] {
  const roles: ColumnRole[] = columns.map(() => 'ignore');
  const matched: boolean[] = columns.map(() => false);
  if (headerRow) {
    const headerCells = cellsOf(headerRow, columns);
    for (let i = 0; i < headerCells.length; i++) {
      const match = profile.columns.find((c) => c.header.test(headerCells[i]));
      if (match) { roles[i] = match.role; matched[i] = true; }
    }
  }
  // Positional fallback ONLY for columns a header rule never touched.
  if (!matched[0]) roles[0] = 'date';
  const lastIdx = roles.length - 1;
  if (lastIdx > 0 && !matched[lastIdx]) roles[lastIdx] = 'amount';
  for (let i = 1; i < lastIdx; i++) if (!matched[i]) roles[i] = 'description';
  return roles;
}

/** Searched across ALL rows (not just candidates) — a header row itself isn't transaction-shaped. */
function findHeaderRow(rows: Row[], columns: Column[], profile: BankProfile): Row | null {
  for (const r of rows) {
    const cells = cellsOf(r, columns);
    const hits = cells.filter((c) => profile.columns.some((rule) => rule.header.test(c))).length;
    if (hits >= 2) return r;
  }
  return null;
}

/**
 * Finds the printed total for one OCCURRENCE of a section, searching only
 * the row range that occurrence spans — never the whole document.
 *
 * This scoping is load-bearing, not defensive. A real Chase spending report
 * prints a "Total $X.XX" line after every one of its 12 categories, using
 * the exact same wording each time — so a totalLabel pattern generic enough
 * to match all of them (`/^Total\b/i`) also matches all twelve if the search
 * isn't scoped. An earlier version searched the whole document unconditionally
 * and returned whichever "Total" line came first for every section — which,
 * on that document, is the *grand total* line in the summary table, since it
 * sits before any category heading. Every section reconciled against $12,122.05
 * instead of its own total, which would have failed every real import.
 */
function findPrintedTotal(rows: Row[], rule: SectionRule, range: { start: number; end: number }): number | null {
  if (!rule.totalLabel) return null;
  for (let i = range.start; i < range.end; i++) {
    const r = rows[i];
    if (!rule.totalLabel.test(r.text)) continue;
    // The amount is whichever token in the row parses as money — search from
    // the end, since a label like "Total Purchases $31.73" has the number last.
    const tokens = r.text.split(/\s+/);
    for (let j = tokens.length - 1; j >= 0; j--) {
      const amt = parseAmount(tokens[j]);
      if (amt) return amt.value;
    }
  }
  return null;
}

/**
 * Direction per profile.signConvention. 'section' (the default, and the only
 * mode a prior version supported) trusts the section's own direction
 * unconditionally — right for a document organized by transaction TYPE
 * (purchases vs. payments), wrong for one organized by spending CATEGORY.
 * A Chase spending report is the latter: every category section is a mix of
 * ordinary debits and the occasional refund, printed as a negative amount
 * inline in the SAME section — so direction has to come from the row's own
 * sign, not from which section it's in. That's `signed`: it reads straight
 * off `ParsedAmount.credit`, which already carries exactly this information.
 */
function resolveDirection(profile: BankProfile, section: SectionRule, amountRole: ColumnRole, credit: boolean): Direction {
  switch (profile.signConvention.type) {
    case 'signed':
      return credit ? 'credit' : 'debit';
    case 'named_columns':
      if (amountRole === 'credit') return 'credit';
      if (amountRole === 'debit') return 'debit';
      return section.direction; // header matching didn't land on a debit/credit column — fall back
    case 'section':
    default:
      return section.direction;
  }
}

export function assembleTransactions(
  rows: Row[],
  profile: BankProfile,
  period: StatementPeriod | null,
  dateFormatOverride?: DateFormat,
): AssembleResult {
  const candidateRows = rows.filter(looksLikeTransactionRow);
  const columns = inferColumns(candidateRows);

  const headerRow = findHeaderRow(rows, columns, profile);
  const roles = assignRoles(headerRow, columns, profile);

  // Which section, if any, each row falls under — tracked as we walk the
  // document in order, since a section runs from its opening heading to the
  // next one (or the next section's heading, or end of document). Also
  // records each occurrence's row RANGE (open index -> close index), which
  // findPrintedTotal needs to avoid matching a different section's total —
  // see its docstring for why an unscoped search is a real bug, not a
  // hypothetical one.
  let currentSection: SectionRule | null = null;
  let currentRangeStart = -1;
  const sectionRowIndices = new Map<string, number[]>();
  const sectionRanges: { id: string; start: number; end: number }[] = [];

  const closeRange = (end: number) => {
    if (currentSection && currentRangeStart >= 0) {
      sectionRanges.push({ id: currentSection.id, start: currentRangeStart, end });
    }
  };

  const candidateDates: string[] = [];
  const bodyRowIdx: number[] = [];

  rows.forEach((row, i) => {
    const opened = profile.sections.find((s) => s.opens.test(row.text));
    if (opened) {
      closeRange(i);
      currentSection = opened;
      currentRangeStart = i + 1; // the heading row itself carries no data
      return;
    }
    if (!currentSection) return;

    const cells = cellsOf(row, columns);
    const dateCellIdx = roles.indexOf('date');
    const dateCell = dateCellIdx >= 0 ? cells[dateCellIdx] : '';
    const hasAmount = cells.some((c, idx) => (roles[idx] === 'amount' || roles[idx] === 'debit' || roles[idx] === 'credit') && isAmountLike(c));

    if (isDateLike(dateCell) && hasAmount) {
      bodyRowIdx.push(i);
      candidateDates.push(dateCell);
      const list = sectionRowIndices.get(currentSection.id) ?? [];
      list.push(i);
      sectionRowIndices.set(currentSection.id, list);
    }
  });
  closeRange(rows.length); // the last section runs to end of document

  const dateChoice = dateFormatOverride
    ? { format: dateFormatOverride, ambiguous: false, parseRate: 1 }
    : pickDateFormat(candidateDates, profile.dateFormats, period);

  const txns: RawTxn[] = [];
  let dateOk = 0;
  let amountOk = 0;
  let continuations = 0;

  for (const [sectionId, indices] of sectionRowIndices) {
    const section = profile.sections.find((s) => s.id === sectionId)!;

    for (const idx of indices) {
      const row = rows[idx];
      const cells = cellsOf(row, columns);
      const dateCellIdx = roles.indexOf('date');
      const descIdx = roles.indexOf('description');
      const amountIdx = roles.findIndex((r) => r === 'amount' || r === 'debit' || r === 'credit');

      const isoDate = dateChoice.format ? parseDateWith(cells[dateCellIdx], dateChoice.format, period) : null;
      const amt = amountIdx >= 0 ? parseAmount(cells[amountIdx]) : null;
      if (isoDate) dateOk++;
      if (amt) amountOk++;
      if (!isoDate || !amt) continue;

      // Join wrapped description lines: rows after this one, before the next
      // body row, with no date/amount of their own and only description-role
      // content, are continuations of this transaction.
      let description = cells[descIdx] ?? '';
      let next = idx + 1;
      let joined = 0;
      while (next < rows.length && joined < 3 && !bodyRowIdx.includes(next)) {
        const opensNewSection = profile.sections.some((s) => s.opens.test(rows[next].text));
        if (opensNewSection) break;
        const nextCells = cellsOf(rows[next], columns);
        const nextHasDate = isDateLike(nextCells[dateCellIdx] ?? '');
        const nextHasAmount = nextCells.some((c, i) => (roles[i] === 'amount' || roles[i] === 'debit' || roles[i] === 'credit') && isAmountLike(c));
        if (nextHasDate || nextHasAmount) break;
        const extra = (nextCells[descIdx] ?? '').trim();
        if (extra) { description = `${description} ${extra}`.trim(); joined++; continuations++; }
        next++;
      }

      txns.push({
        date: isoDate,
        description,
        amount: amt.value,
        direction: resolveDirection(profile, section, roles[amountIdx], amt.credit),
        section: section.id,
        page: row.page,
        row: idx,
      });
    }
  }

  const printedTotals: Record<string, number> = {};
  for (const range of sectionRanges) {
    const section = profile.sections.find((s) => s.id === range.id);
    if (!section?.totalLabel) continue;
    const total = findPrintedTotal(rows, section, range);
    if (total != null) printedTotals[section.id] = total;
  }

  return {
    txns,
    sectionsMatched: [...sectionRowIndices.keys()],
    bodyRows: bodyRowIdx.length,
    columnCount: columns.length,
    dateParseRate: bodyRowIdx.length ? dateOk / bodyRowIdx.length : 0,
    amountParseRate: bodyRowIdx.length ? amountOk / bodyRowIdx.length : 0,
    continuationRatio: txns.length ? continuations / txns.length : 0,
    dateFormatAmbiguous: dateChoice.ambiguous,
    period,
    printedTotals,
  };
}
