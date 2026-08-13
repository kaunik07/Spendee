// Statement import — bytes to positioned text.
//
// This is the ONLY file in lib/statement that touches a runtime API. Everything
// downstream operates on the PositionedItem[] this produces, which is what lets
// the layout and profile logic be tested against committed fixture arrays with
// no PDF, no network and no keys — and what would let extraction move to a
// Worker later (for native support) without any of that logic changing.
//
// Extraction runs in the browser on purpose: the statement never leaves the
// user's machine. Only normalized merchant names are ever sent anywhere.

import type { Diagnostics, ParseOptions, PositionedItem, StatementErrorCode } from './types';

export type PdfExtraction =
  | { ok: true;  items: PositionedItem[]; pages: number; pageWidths: number[] }
  | { ok: false; code: StatementErrorCode; message: string; diagnostics: Partial<Diagnostics> };

/**
 * pdf.js ships as ~1-2MB. Importing it lazily keeps it out of the main bundle
 * so it is fetched only when someone actually opens the import screen, and
 * cached from then on.
 */
async function loadUnpdf() {
  return import('unpdf');
}

/** pdf.js signals a password-protected file by the error's `name`, not its type. */
function isPasswordError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const msg  = (err as { message?: string })?.message ?? '';
  return name === 'PasswordException' || /password/i.test(msg);
}

export async function extractPdfItems(
  bytes: Uint8Array,
  opts: ParseOptions = {},
): Promise<PdfExtraction> {
  let doc: Awaited<ReturnType<Awaited<ReturnType<typeof loadUnpdf>>['getDocumentProxy']>>;

  try {
    const { getDocumentProxy } = await loadUnpdf();
    // pdf.js transfers ownership of the buffer it is given and leaves the
    // original detached. Callers reuse these bytes (to hash the file for the
    // duplicate check, or to retry with a password), so hand over a copy.
    doc = await getDocumentProxy(new Uint8Array(bytes), {
      password: opts.password,
      // We only ever read text geometry, never render, so building font faces
      // is pure overhead here.
      disableFontFace: true,
    });
  } catch (err) {
    if (isPasswordError(err)) {
      return {
        ok: false,
        code: 'encrypted_pdf',
        message: 'This PDF is password-protected.',
        diagnostics: {},
      };
    }
    return {
      ok: false,
      code: 'parse_failed',
      message: 'This file could not be opened as a PDF.',
      diagnostics: {},
    };
  }

  const items: PositionedItem[] = [];
  const pageWidths: number[] = [];

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      pageWidths.push(page.getViewport({ scale: 1 }).width);

      const content = await page.getTextContent();
      for (const item of content.items) {
        // getTextContent also yields TextMarkedContent nodes (structure tags,
        // no geometry). Only the runs with a `str` are text.
        if (!('str' in item)) continue;
        const str = item.str;
        if (!str || !str.trim()) continue;

        // transform is [a, b, c, d, e, f]; e/f are the translation, i.e. the
        // run's origin. y is a baseline in PDF user space, which grows UPWARD.
        const [, , , , x, y] = item.transform as number[];
        items.push({
          str,
          x,
          y,
          w: item.width,
          h: item.height,
          page: pageNum,
        });
      }
    }
  } catch {
    return {
      ok: false,
      code: 'parse_failed',
      message: 'This PDF could not be read.',
      diagnostics: { pages: doc.numPages, items: items.length },
    };
  }

  return { ok: true, items, pages: doc.numPages, pageWidths };
}
