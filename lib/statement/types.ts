// Statement import — the contracts every other file in this folder is written
// against.
//
// Two independent axes:
//
//   StatementParser  — how bytes become positioned text ('pdf', later 'csv')
//   BankProfile      — how positioned text becomes transactions, per
//                      bank × product × document type
//
// Everything downstream (merchant normalization, categorization, fingerprinting,
// the review UI) consumes RawTxn[] and is blind to both. Adding Bank of America
// is one new profile file; adding CSV is one new parser file.

/** One run of text with its position on the page. */
export interface PositionedItem {
  str:  string;
  x:    number;   // left edge, PDF user space (points)
  /**
   * Baseline. PDF user space grows UPWARD, so reading order is *descending* y —
   * the single most common source of bugs when working with this data.
   */
  y:    number;
  w:    number;
  h:    number;
  page: number;   // 1-based
}

export type StatementFormat = 'pdf';                       // 'csv' later
export type DocType         = 'statement' | 'spending_report';
export type BankId          = 'chase' | 'bofa';
export type SourceKind      = 'credit_card' | 'bank_account';
export type Direction       = 'debit' | 'credit';

export type ProfileId =
  | 'chase_cc_statement'
  | 'chase_cc_spending_report'
  | 'bofa_cc_statement';

/**
 * A parsed transaction, before merchant normalization or categorization.
 * `amount` is always positive; `direction` carries the sign.
 */
export interface RawTxn {
  date:        string;      // YYYY-MM-DD
  description: string;      // continuation lines already joined
  amount:      number;      // always > 0
  direction:   Direction;
  section:     string;      // SectionRule.id it was found under — provenance
  page:        number;
  row:         number;      // row index within the page, for stable ordering
}

// ── Bank profile ────────────────────────────────────────────

/**
 * A labelled block of transactions. Chase card statements are organised into
 * these ("PURCHASE", "PAYMENTS AND OTHER CREDITS", …), which is what lets
 * direction be *read* rather than inferred, and what lets a fee be categorized
 * as a bill instead of as merchant spend.
 */
export interface SectionRule {
  id:        string;
  /** Matched against a row's joined text to open the block. */
  opens:     RegExp;
  direction: Direction;
  /** Forced category for rows here, when they aren't merchant spend (fees, interest). */
  forceCategory?: string;
  /**
   * Finds the section's printed total, e.g. /total fees charged/i. Present
   * means the parse can be checked against the bank's own arithmetic — by far
   * the strongest correctness signal available, so prefer profiles that have it.
   */
  totalLabel?: RegExp;
}

export type ColumnRole =
  | 'date' | 'description' | 'amount'
  | 'debit' | 'credit' | 'balance' | 'ignore';

export interface ColumnRule {
  role:   ColumnRole;
  /** Header label identifying this column. */
  header: RegExp;
}

export type DateFormat =
  | 'MM/DD' | 'MM/DD/YY' | 'MM/DD/YYYY'
  | 'DD/MM/YY' | 'DD/MM/YYYY'
  | 'YYYY-MM-DD' | 'DD-MMM-YYYY' | 'MMM DD' | 'MMM DD, YYYY';

/** How to decide whether a row is money out or money in. */
export type SignRule =
  /** From the section it sits in. No arithmetic, no guessing. */
  | { type: 'section' }
  /** Separate debit and credit columns, identified by their headers. */
  | { type: 'named_columns' }
  /** One column whose sign is carried by '-', parentheses, or a DR/CR suffix. */
  | { type: 'signed' };

export interface BankProfile {
  id:      ProfileId;
  bank:    BankId;
  label:   string;                 // shown in the picker, e.g. 'Chase — Credit Card'
  status:  'live' | 'in_development';
  kind:    SourceKind;
  docType: DocType;

  /**
   * Proof the document is actually from this bank. Picking the wrong card is
   * the likeliest user error — the bank comes from the card record, so nothing
   * else catches it — and failing here is much better than parsing a BofA
   * statement with Chase's column rules and importing plausible nonsense.
   */
  identifiers: RegExp[];

  sections:       SectionRule[];
  columns:        ColumnRule[];
  dateFormats:    DateFormat[];
  signConvention: SignRule;

  /** Finds the statement period; supplies the year to year-less dates. */
  periodPattern?: RegExp;
  /** Bank-specific descriptor junk to strip beyond the generic rules. */
  descriptorHints?: RegExp[];
  /**
   * Drop items from the first N pages before any row/column work happens.
   * For a genuine full Chase credit-card statement, pages 1-2 are cover
   * material (offers, account summary, a legal/notices page) with no
   * transaction table — `skipPages: 2` starts parsing at page 3, where
   * ACCOUNT ACTIVITY actually begins. Not needed for an excerpt that
   * already starts at the right page (an upload beginning exactly at the
   * activity table has nothing to skip).
   */
  skipPages?: number;
}

// ── Parse results ───────────────────────────────────────────

export type StatementErrorCode =
  | 'unsupported_format'    // not a PDF (or, later, a CSV)
  | 'unsupported_profile'   // no live profile for this bank × kind × doc type
  | 'encrypted_pdf'         // password-protected; most emailed statements are
  | 'no_text_layer'         // a scan — nothing to read without OCR, which we don't do
  | 'wrong_bank'            // none of the profile's identifiers matched
  | 'no_table'              // no transaction section found
  | 'ambiguous_columns'
  | 'ambiguous_dates'
  | 'ambiguous_amounts'
  | 'ambiguous_direction'
  | 'reconciliation_failed' // rows don't sum to the bank's own printed total
  | 'layout_misread'
  | 'too_many_rows'
  | 'parse_failed';         // anything unexpected, with the cause in `message`

/**
 * The numbers behind the accept/reject decision. Always returned, on success
 * and failure alike, so a rejection can say *which* check tripped and by how
 * much rather than just "couldn't read it".
 */
export interface Diagnostics {
  pages:              number;
  items:              number;
  glyphsPerPage:      number;
  rows:               number;
  columnCount:        number;
  sectionsMatched:    string[];
  bodyRows:           number;
  txns:               number;
  dateParseRate:      number;   // 0..1
  amountParseRate:    number;   // 0..1
  continuationRatio:  number;   // continuation lines / txns
  reconciled:         SectionReconciliation[];
}

export interface SectionReconciliation {
  section: string;
  parsed:  number;
  printed: number | null;   // null when the profile declares no total for it
  ok:      boolean;
}

export interface ParseSuccess {
  ok:        true;
  format:    StatementFormat;
  profileId: ProfileId;
  txns:      RawTxn[];
  period:    { start: string; end: string } | null;
  currency:  string | null;
  /** Two date formats both parsed cleanly; the UI offers a toggle. */
  dateFormatAmbiguous: boolean;
  diagnostics: Diagnostics;
}

export interface ParseFailure {
  ok:      false;
  code:    StatementErrorCode;
  message: string;                  // user-facing; carries no statement content
  diagnostics: Partial<Diagnostics>;
}

export type ParseResult = ParseSuccess | ParseFailure;

export interface ParseOptions {
  /** For encrypted PDFs. */
  password?: string;
  /** Overrides inference when the user flips the DD/MM ⇄ MM/DD toggle. */
  dateFormat?: DateFormat;
}

export interface StatementParser {
  id: StatementFormat;
  /**
   * Byte sniff rather than an extension check — a .pdf that isn't one, or a
   * PDF saved as .txt, must fail cleanly instead of half-parsing.
   */
  detect(head: Uint8Array, contentType: string, filename: string): boolean;
  parse(bytes: Uint8Array, profile: BankProfile, opts?: ParseOptions): Promise<ParseResult>;
}

/** Narrowing helper, so callers don't hand-write the discriminant check. */
export function isParseSuccess(r: ParseResult): r is ParseSuccess {
  return r.ok;
}
