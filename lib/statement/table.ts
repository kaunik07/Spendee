// Statement import — assembling RawTxn[] from rows and a BankProfile.
// Generic: every rule here comes from the profile parameter, not from any
// bank's specifics, which is what makes this file testable against a
// synthetic profile and reusable unchanged once a real Chase profile exists.

import { isAmountLike, isDateLike, parseAmount, parseDateWith, pickDateFormat, StatementPeriod } from './fields';
import { cellsOf, Column, inferColumns, Row } from './layout';
import type { BankProfile, ColumnRole, DateFormat, RawTxn, SectionRule } from './types';

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
 * — a date-shaped leading token, and an amount-shaped token somewhere in it?
 *
 * This runs BEFORE column inference and is why it has to work off raw text
 * rather than cells. Running inferColumns over every row on the page —
 * header lines, the address block, footer disclaimers — was the original
 * bug here: a wide line of footer prose spans the exact x-range that would
 * otherwise be the gutter between the date and description columns, so
 * inferColumns saw no gap there and merged the two into one column. Feeding
 * it only rows that already look like transactions is what layout.ts's own
 * inferColumns docstring warns is required, and what this function supplies.
 */
function looksLikeTransactionRow(row: Row): boolean {
  const tokens = row.text.trim().split(/\s+/);
  if (!tokens.length) return false;
  return isDateLike(tokens[0]) && tokens.some((t) => isAmountLike(t));
}

/**
 * Assigns each grid column a role by matching the header row's cells against
 * the profile's declared column headers. Falls back to position (first
 * column is the date, last is treated as an amount candidate) when no header
 * row is found — the case a header-less signed-column statement needs.
 */
function assignRoles(headerRow: Row | null, columns: Column[], profile: BankProfile): ColumnRole[] {
  const roles: ColumnRole[] = columns.map(() => 'ignore');
  if (headerRow) {
    const headerCells = cellsOf(headerRow, columns);
    for (let i = 0; i < headerCells.length; i++) {
      const match = profile.columns.find((c) => c.header.test(headerCells[i]));
      if (match) roles[i] = match.role;
    }
  }
  // Positional fallback for anything a header pass didn't resolve.
  if (roles[0] === 'ignore') roles[0] = 'date';
  const lastIdx = roles.length - 1;
  if (lastIdx > 0 && roles[lastIdx] === 'ignore') roles[lastIdx] = 'amount';
  for (let i = 1; i < lastIdx; i++) if (roles[i] === 'ignore') roles[i] = 'description';
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

/** Finds the printed total for a section, e.g. matching /total fees charged/i against row text. */
function findPrintedTotal(rows: Row[], rule: SectionRule): number | null {
  if (!rule.totalLabel) return null;
  for (const r of rows) {
    if (!rule.totalLabel.test(r.text)) continue;
    // The amount is whichever token in the row parses as money — search from
    // the end, since a label like "Total Purchases $31.73" has the number last.
    const tokens = r.text.split(/\s+/);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const amt = parseAmount(tokens[i]);
      if (amt) return amt.value;
    }
  }
  return null;
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
  // next one (or the next section's heading, or end of document).
  let currentSection: SectionRule | null = null;
  const sectionRowIndices = new Map<string, number[]>();

  const candidateDates: string[] = [];
  const bodyRowIdx: number[] = [];

  rows.forEach((row, i) => {
    const opened = profile.sections.find((s) => s.opens.test(row.text));
    if (opened) { currentSection = opened; return; } // the heading row itself carries no data
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
        direction: section.direction,
        section: section.id,
        page: row.page,
        row: idx,
      });
    }
  }

  const printedTotals: Record<string, number> = {};
  for (const section of profile.sections) {
    if (!section.totalLabel) continue;
    const total = findPrintedTotal(rows, section);
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
