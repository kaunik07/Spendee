// Statement import — what kind of file is this?
//
// Sniffed from the bytes, never from the extension or the browser-supplied MIME
// type. Both are trivially wrong: a statement saved as "statement.pdf.txt", a
// drag-and-drop that reports application/octet-stream, a CSV renamed to .pdf.
// Guessing wrong here means the parser reads garbage and reports a layout
// error, which sends you looking in entirely the wrong place.

import type { StatementFormat } from './types';

/** Enough to cover the PDF spec's allowance for junk ahead of the header. */
export const SNIFF_BYTES = 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // '%PDF-'

function indexOfMagic(head: Uint8Array, magic: number[]): number {
  outer: for (let i = 0; i + magic.length <= head.length; i++) {
    for (let j = 0; j < magic.length; j++) {
      if (head[i + j] !== magic[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * A PDF's header is normally at offset 0, but the spec tolerates leading bytes
 * and plenty of real-world files (anything that's been through an email gateway
 * or a re-wrapper) have them, so scan rather than compare the first five bytes.
 */
export function looksLikePdf(head: Uint8Array): boolean {
  return indexOfMagic(head.subarray(0, SNIFF_BYTES), PDF_MAGIC) !== -1;
}

/**
 * Returns the format, or null when nothing recognizes the bytes — which the
 * caller surfaces as `unsupported_format`.
 */
export function sniffFormat(head: Uint8Array): StatementFormat | null {
  if (looksLikePdf(head)) return 'pdf';
  return null;
}

/** First `SNIFF_BYTES` of a buffer, for handing to the sniffers. */
export function headOf(bytes: Uint8Array, n: number = SNIFF_BYTES): Uint8Array {
  return bytes.subarray(0, Math.min(n, bytes.length));
}
