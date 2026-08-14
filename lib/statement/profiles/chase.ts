// Chase profiles.
//
// CHASE_CC_STATEMENT is still NOT calibrated — `status: 'in_development'`,
// so registry.ts's resolveProfile() never returns it as 'live' and the
// import screen's dropzone stays disabled for it. Its field values are
// placeholders that exist so the pipeline has something concrete to compile
// and test against; none of them have been checked against a real Chase
// card statement (a different document from the spending report below —
// grouped by transaction type, not by spending category).
//
// CHASE_CC_SPENDING_REPORT is calibrated against a real Chase spending
// report (11 pages, 12 categories, ~250 transactions) and is `status:
// 'live'`. See the comments on each field for what was actually observed —
// this isn't a guess written from general Chase knowledge, it's read off
// the document. Calibrating it surfaced four real bugs in the pipeline
// itself (now fixed, each with its own commit): parseAmount didn't handle a
// leading sign printed AFTER the currency symbol ("$-51.30", how this
// document prints a refund); candidate-row detection assumed a date was one
// whitespace token, but "Mar 29, 2026" is three; findPrintedTotal searched
// the whole document instead of one section's row range, so every section
// would have reconciled against the summary table's grand total instead of
// its own; and signConvention was declared but never actually consulted —
// every direction was hardcoded to the section's, which is wrong for a
// document where refunds are printed as negative amounts INSIDE an
// otherwise all-debit category section, not sectioned off on their own.

import type { BankProfile } from '../types';

export const CHASE_CC_STATEMENT: BankProfile = {
  id: 'chase_cc_statement',
  bank: 'chase',
  label: 'Chase — Credit Card Statement',
  status: 'in_development',
  kind: 'credit_card',
  docType: 'statement',

  // TODO(calibrate): confirm against a real statement. This is a guess at
  // wording Chase statements commonly carry, not a verified match.
  identifiers: [/chase/i, /jpmorgan/i],

  // TODO(calibrate): real Chase card statements are commonly organized into
  // blocks like these, but the exact headings, punctuation and ordering need
  // confirming against an actual document before this can go live.
  sections: [
    { id: 'purchases', opens: /^purchase(s)?\b/i, direction: 'debit', totalLabel: /total\s+purchases/i },
    { id: 'payments', opens: /payments?\s+and\s+other\s+credits/i, direction: 'credit', totalLabel: /total\s+payments/i },
    { id: 'fees', opens: /fees?\s+charged/i, direction: 'debit', forceCategory: 'bills', totalLabel: /total\s+fees/i },
    { id: 'interest', opens: /interest\s+charged/i, direction: 'debit', forceCategory: 'bills', totalLabel: /total\s+interest/i },
  ],

  // TODO(calibrate): header row wording is a guess.
  columns: [
    { role: 'date', header: /^date\s+of\s+transaction$/i },
    { role: 'description', header: /^merchant\s+name|description$/i },
    { role: 'amount', header: /^amount$/i },
  ],

  // TODO(calibrate): Chase card statements are believed to print MM/DD with
  // no year, but this needs confirming.
  dateFormats: ['MM/DD'],
  signConvention: { type: 'section' },

  // TODO(calibrate): no periodPattern yet — the exact period-header wording
  // is unverified, so it's omitted entirely rather than guessed. Without it
  // the parser falls back to "now" for year inference; do not ship 'live'
  // without filling this in first.
};

/**
 * Chase's own category buckets, mapped to Spendee's 15 categories
 * (constants/theme.ts). Chase has already done the categorization work —
 * every transaction arrives inside a section that names its category — so
 * this profile sets `forceCategory` per section rather than leaning on
 * merchant-name lookup or the Gemini categorizer at all. That's a real
 * accuracy win over the statement profile, and it means most imports from a
 * spending report never need a Worker round trip.
 *
 * Two buckets don't map cleanly and were judgment calls, left here rather
 * than silently made:
 *   - HEALTH_AND_WELLNESS also catches gym memberships ("24 Hour Fitness"
 *     appeared in this section, not under a separate fitness bucket) —
 *     mapped to 'health' since that's Chase's own grouping; a user can
 *     recategorize a specific row to 'fitness' in review.
 *   - PROFESSIONAL_SERVICES and EDUCATION have no matching Spendee category
 *     (insurance, tax prep, parking-rental services; tutoring) — mapped to
 *     'other' rather than guessing a closer fit that would be wrong as
 *     often as right.
 */
const CHASE_CATEGORY_MAP: Record<string, string> = {
  food_and_drink: 'food',
  groceries: 'groceries',
  shopping: 'shopping',
  travel: 'trip',
  gas: 'transport',              // Spendee has no dedicated fuel category; transport is the closest fit
  bills_and_utilities: 'bills',
  entertainment: 'entertainment',
  health_and_wellness: 'health',
  personal: 'other',
  professional_services: 'other',
  education: 'other',
  fees_and_adjustments: 'bills', // a foreign-transaction fee is a bank charge, same bucket as a statement's FEES CHARGED section
};

/**
 * Every section heading is a standalone line reading EXACTLY the category
 * name — "BILLS_AND_UTILITIES", "FOOD_AND_DRINK", etc. — confirmed by
 * extracting the real document: `groupRows` returns each heading as its own
 * row with no other content on the line. Anchored ^...$ is required, not
 * just tidy: the page-1 summary table prints these same words followed
 * immediately by a dollar amount on the SAME line ("PERSONAL $52.36
 * GROCERIES $889.81" — two categories share a row because the summary is a
 * two-column layout and both columns' entries land at the same y), and an
 * unanchored match would open every section right there before any real
 * transaction table begins.
 */
function heading(name: string): RegExp {
  return new RegExp(`^${name}$`);
}

export const CHASE_CC_SPENDING_REPORT: BankProfile = {
  id: 'chase_cc_spending_report',
  bank: 'chase',
  label: 'Chase — Credit Card Spending Report',
  status: 'live',
  kind: 'credit_card',
  docType: 'spending_report',

  identifiers: [/chase/i, /spending report/i],

  // totalLabel is the same bare "Total $X.XX" for every section — confirmed
  // by extraction; Chase does not repeat the category name in the total
  // line. That's exactly why findPrintedTotal has to be scoped to one
  // section's own row range rather than searching the whole document: a
  // pattern this generic matches all twelve sections' total lines equally.
  sections: Object.entries(CHASE_CATEGORY_MAP).map(([id, forceCategory]) => ({
    id,
    opens: heading(id.toUpperCase()),
    direction: 'debit' as const, // the default; signConvention below overrides per row
    forceCategory,
    totalLabel: /^Total\b/i,
  })),

  // Confirmed 4 columns: Transaction Date, Posted Date, Description, Amount.
  // Posted Date is real data (when the charge cleared, vs. when it happened)
  // but nothing downstream of this parser has a field for it — Expense has
  // one date, and Transaction Date is the more useful one for budgeting.
  columns: [
    { role: 'date', header: /^Transaction Date$/i },
    { role: 'ignore', header: /^Posted Date$/i },
    { role: 'description', header: /^Description$/i },
    { role: 'amount', header: /^Amount$/i },
  ],

  // Confirmed: "Mar 29, 2026" — month abbreviation, day, comma, 4-digit year.
  // Always carries its own year, so there's no MM/DD-style year-inference
  // question here at all.
  dateFormats: ['MMM DD, YYYY'],

  // Confirmed: refunds print as a negative amount INLINE within an
  // otherwise all-debit category section ("SWIMPLY* ID 2029185 $-51.30"
  // sits right after the $51.30 charge it reverses, both under
  // ENTERTAINMENT) — not carved into a separate credits section. So
  // direction has to come from each row's own printed sign, not from which
  // section it's in.
  signConvention: { type: 'signed' },

  // Confirmed: identical text on every page, "Jan 01, 2026 to Aug 14, 2026
  // Spending Report 6393" — the trailing number is the card's last 4
  // digits, not part of the period. Captures raw text; pdf-parser.ts parses
  // it against dateFormats above (MMM DD, YYYY), same format the period
  // header and every transaction date share.
  periodPattern: /(?<start>[A-Za-z]{3}\s+\d{1,2},\s+\d{4})\s+to\s+(?<end>[A-Za-z]{3}\s+\d{1,2},\s+\d{4})\s+Spending Report/,
};

export const CHASE_PROFILES: BankProfile[] = [CHASE_CC_STATEMENT, CHASE_CC_SPENDING_REPORT];
