// Statement import — the PDF StatementParser: wires pdf.ts (extraction) +
// layout.ts (rows/columns) + table.ts (profile-driven assembly) +
// confidence.ts (the gate) into the interface registry.ts dispatches to.
//
// This is the full pipeline, genuinely run end to end — nothing here is
// Chase-specific. What's still pending is a *live* Chase profile to hand it;
// every profile shipped today is `status: 'in_development'`, so the registry
// refuses to reach this file's `parse()` for them at all (see registry.ts's
// resolveProfile and the UI's dropzone gate). Once a calibrated profile
// exists, this file needs no changes.

import { extractPdfItems } from './pdf';
import { groupRows } from './layout';
import { assembleTransactions } from './table';
import { buildDiagnostics, evaluateGate, reconciliationFor } from './confidence';
import { headOf, looksLikePdf } from './detect';
import { parseDateWith } from './fields';
import type {
  BankProfile, DateFormat, ParseOptions, ParseResult, StatementParser,
} from './types';

/**
 * The pattern's `start`/`end` capture groups are RAW text as printed, not
 * ISO — a real period header reads "Jan 01, 2026 to Aug 14, 2026", never
 * "2026-01-01". They're parsed against the profile's own declared
 * dateFormats, in order, so a bank whose period header uses the same format
 * as its transaction dates (the common case) needs nothing beyond the
 * capture groups; a profile without periodPattern just skips automatic
 * period extraction and dates fall back to "now" for year inference.
 *
 * `start` is optional — a `start`-less pattern (just `end`) covers a
 * document that only prints a single closing/statement date and no
 * explicit range, which is a real, common case (a Chase card statement
 * prints "Statement Date: 07/15/26" but no "opening to closing" line on the
 * pages carrying the transaction table). `yearFor()` only ever reads
 * `period.end`'s month/year, so treating `start` as equal to `end` here
 * gets year-less transaction dates rolled back correctly across a December
 * without inventing a start date nobody printed.
 */
function extractPeriod(text: string, profile: BankProfile): { start: string; end: string } | null {
  if (!profile.periodPattern) return null;
  const m = profile.periodPattern.exec(text);
  if (!m?.groups?.end) return null;
  const startRaw = m.groups.start ?? m.groups.end;

  for (const format of profile.dateFormats) {
    const start = parseDateWith(startRaw, format);
    const end = parseDateWith(m.groups.end, format);
    if (start && end) return { start, end };
  }
  return null;
}

async function parse(bytes: Uint8Array, profile: BankProfile, opts: ParseOptions = {}): Promise<ParseResult> {
  const extraction = await extractPdfItems(bytes, opts);
  if (!extraction.ok) {
    return { ok: false, code: extraction.code, message: extraction.message, diagnostics: extraction.diagnostics };
  }

  const skipPages = profile.skipPages ?? 0;
  // Drop cover-material pages before any row/column work, not just before
  // building the transaction table — otherwise a title page's prose or an
  // account-summary table on page 1-2 can still land in `rows` and get
  // treated as candidate section/header text. Original page numbers are
  // preserved on the surviving items (RawTxn.page stays meaningful against
  // the actual PDF the user is looking at), and both `pages` and
  // `glyphsPerPage` below are computed from what's LEFT, so a legitimately
  // dense statement doesn't read as sparse just because its cover pages
  // were removed.
  const items = skipPages > 0 ? extraction.items.filter((it) => it.page > skipPages) : extraction.items;
  const pages = Math.max(0, extraction.pages - skipPages);
  const glyphsPerPage = pages > 0 ? items.length / pages : 0;

  const rows = groupRows(items);

  const fullText = rows.map((r) => r.text).join('\n');
  const period = extractPeriod(fullText, profile);

  const dateFormatOverride: DateFormat | undefined = opts.dateFormat;
  const assembled = assembleTransactions(rows, profile, period, dateFormatOverride);

  const gateInput = { pages, items: items.length, columnCount: assembled.columnCount, assembled, profile };
  const failure = evaluateGate(gateInput, glyphsPerPage);
  const diagnostics = buildDiagnostics(gateInput, glyphsPerPage, reconciliationFor(gateInput));

  if (failure) {
    return { ok: false, code: failure.code, message: failure.message, diagnostics };
  }

  return {
    ok: true,
    format: 'pdf',
    profileId: profile.id,
    txns: assembled.txns,
    period,
    currency: null, // left for a future profile field once a non-USD statement needs it
    dateFormatAmbiguous: assembled.dateFormatAmbiguous,
    diagnostics,
  };
}

export const pdfParser: StatementParser = {
  id: 'pdf',
  detect(head) {
    return looksLikePdf(headOf(head));
  },
  parse,
};
