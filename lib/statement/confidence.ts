// Statement import — the accept/reject gate.
//
// Every threshold lives here, named, so there is exactly one place to tune
// them and every rejection can point at the specific number that tripped.
// Reject rather than guess: on financial data, a confident-looking wrong
// answer is worse than an honest "couldn't read this."

import type { AssembleResult } from './table';
import type { BankProfile, Diagnostics, ParseFailure, RawTxn, SectionReconciliation, StatementErrorCode } from './types';

export const MIN_GLYPHS_PER_PAGE = 50;
export const MIN_DATE_PARSE_RATE = 0.98;
export const MIN_AMOUNT_PARSE_RATE = 0.98;
export const MAX_CONTINUATION_RATIO = 1.5;
export const MAX_TXNS = 500;
/** A section's parsed sum must land within this many cents of its printed total. */
export const RECONCILIATION_TOLERANCE_CENTS = 1;

export interface GateInput {
  pages: number;
  items: number;
  columnCount: number;
  assembled: AssembleResult;
  profile: BankProfile;
}

function reconcileSections(assembled: AssembleResult, profile: BankProfile): SectionReconciliation[] {
  return profile.sections
    .filter((s) => s.totalLabel) // only sections the profile can even check
    .map((s) => {
      const parsed = assembled.txns
        .filter((t) => t.section === s.id)
        .reduce((sum, t) => sum + t.amount, 0);
      const printed = assembled.printedTotals[s.id] ?? null;
      const ok = printed == null
        ? true // no printed total FOUND on this document — not a failure, just not checkable
        : Math.abs(Math.round(parsed * 100) - Math.round(printed * 100)) <= RECONCILIATION_TOLERANCE_CENTS;
      return { section: s.id, parsed, printed, ok };
    });
}

export function buildDiagnostics(input: GateInput, glyphsPerPage: number, reconciled: SectionReconciliation[]): Diagnostics {
  const { assembled } = input;
  return {
    pages: input.pages,
    items: input.items,
    glyphsPerPage,
    rows: assembled.bodyRows + assembled.sectionsMatched.length, // approximate — exact row count isn't preserved past assembly
    columnCount: input.columnCount,
    sectionsMatched: assembled.sectionsMatched,
    bodyRows: assembled.bodyRows,
    txns: assembled.txns.length,
    dateParseRate: assembled.dateParseRate,
    amountParseRate: assembled.amountParseRate,
    continuationRatio: assembled.continuationRatio,
    reconciled,
  };
}

/**
 * Returns the failure code + message when the parse should be rejected, or
 * null when it's confident enough to show the user. Order matters only in
 * that the first genuinely-tripped check is the one reported — a document can
 * fail more than one, and the first is usually the most informative.
 */
export function evaluateGate(input: GateInput, glyphsPerPage: number): { code: StatementErrorCode; message: string } | null {
  const { assembled } = input;

  if (glyphsPerPage < MIN_GLYPHS_PER_PAGE) {
    return { code: 'no_text_layer', message: 'This looks like a scan — there is no extractable text.' };
  }
  if (assembled.sectionsMatched.length === 0 || assembled.txns.length === 0) {
    return { code: 'wrong_bank', message: "This doesn't look like a statement from the selected bank." };
  }
  if (input.columnCount < 3 || input.columnCount > 8) {
    return { code: 'ambiguous_columns', message: "Couldn't reliably read this document's columns." };
  }
  if (assembled.dateParseRate < MIN_DATE_PARSE_RATE) {
    return { code: 'ambiguous_dates', message: "Couldn't reliably read this document's dates." };
  }
  if (assembled.amountParseRate < MIN_AMOUNT_PARSE_RATE) {
    return { code: 'ambiguous_amounts', message: "Couldn't reliably read this document's amounts." };
  }
  const reconciled = reconcileSections(assembled, input.profile);
  const failedRecon = reconciled.find((r) => !r.ok);
  if (failedRecon) {
    return {
      code: 'reconciliation_failed',
      message: "The numbers in this document don't add up as expected, so nothing was imported from it.",
    };
  }
  if (assembled.continuationRatio > MAX_CONTINUATION_RATIO) {
    return { code: 'layout_misread', message: "This document's layout couldn't be read reliably." };
  }
  if (assembled.txns.length > MAX_TXNS) {
    return { code: 'too_many_rows', message: `This document has more than ${MAX_TXNS} transactions — try a shorter period.` };
  }
  return null;
}

export function reconciliationFor(input: GateInput): SectionReconciliation[] {
  return reconcileSections(input.assembled, input.profile);
}
