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
import type {
  BankProfile, DateFormat, ParseOptions, ParseResult, StatementParser,
} from './types';

function extractPeriod(text: string, profile: BankProfile): { start: string; end: string } | null {
  if (!profile.periodPattern) return null;
  const m = profile.periodPattern.exec(text);
  // The pattern's own named groups decide the shape; a profile without them
  // just doesn't get automatic period extraction — dates fall back to "now".
  if (!m?.groups?.start || !m?.groups?.end) return null;
  return { start: m.groups.start, end: m.groups.end };
}

async function parse(bytes: Uint8Array, profile: BankProfile, opts: ParseOptions = {}): Promise<ParseResult> {
  const extraction = await extractPdfItems(bytes, opts);
  if (!extraction.ok) {
    return { ok: false, code: extraction.code, message: extraction.message, diagnostics: extraction.diagnostics };
  }

  const { items, pages } = extraction;
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
