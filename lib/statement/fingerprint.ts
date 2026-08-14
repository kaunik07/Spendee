// Statement import — recognizing a transaction you already imported.
//
// The problem this solves: statement periods overlap, people re-download the
// same file, and a spending report covers the same days as the statement. All
// three produce rows that are already in the database, and expense ids are
// generated fresh client-side, so nothing about the row itself collides.
//
// The naive fix — hash (date, amount, merchant) — is wrong in a way that
// matters. Two identical $5 coffees on the same day are a real, common thing;
// hashing content alone silently drops the second one. Losing a genuine
// transaction is worse than duplicating one, because a duplicate is visible in
// the review table and a missing row is not.
//
// So the hash includes an ORDINAL: the row's index within its
// (date, merchant, amount) group. Two same-day coffees get 0 and 1 and both
// import. Re-importing an overlapping period regenerates the same ordinals for
// the same days — the group is scoped to a single date, and both documents
// list the same transactions for it — so the fingerprints match and the
// overlap is caught.

export interface FingerprintInput {
  date:        string;   // YYYY-MM-DD
  merchantKey: string;
  amount:      number;
}

/**
 * Integer cents. Money arrives as a float from parsing, and 6.25 * 100 is
 * 624.9999999999999 on some paths — rounding here keeps the hash stable across
 * two runs that reached the same amount by different arithmetic.
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Index of each row within its (date, merchantKey, cents) group, in document
 * order. Returned as a parallel array so callers keep their own row objects.
 */
export function assignOrdinals(rows: FingerprintInput[]): number[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const groupKey = `${r.date}|${toCents(r.amount)}|${r.merchantKey}`;
    const n = seen.get(groupKey) ?? 0;
    seen.set(groupKey, n + 1);
    return n;
  });
}

async function sha256Hex(input: ArrayBuffer | Uint8Array): Promise<string> {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  // Copy into a plain ArrayBuffer — a Uint8Array view over a larger buffer
  // would otherwise hash the whole backing store.
  const buf = view.byteLength === view.buffer.byteLength && view.byteOffset === 0
    ? view.buffer
    : view.slice().buffer;
  const digest = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable identity for one imported transaction. */
export function fingerprint(row: FingerprintInput, ordinal: number): Promise<string> {
  const canonical = `${row.date}|${toCents(row.amount)}|${row.merchantKey}|${ordinal}`;
  return sha256Hex(new TextEncoder().encode(canonical));
}

/** Fingerprints for a whole parsed document, ordinals included. */
export async function fingerprintAll(rows: FingerprintInput[]): Promise<string[]> {
  const ordinals = assignOrdinals(rows);
  return Promise.all(rows.map((r, i) => fingerprint(r, ordinals[i])));
}

/**
 * Hash of the uploaded file itself, so a repeat upload can say "you imported
 * this exact file on <date>" before spending any time parsing it.
 */
export function fileSha256(bytes: Uint8Array): Promise<string> {
  return sha256Hex(bytes);
}
