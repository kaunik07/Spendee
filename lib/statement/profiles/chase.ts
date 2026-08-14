// Chase profiles.
//
// CHASE_CC_STATEMENT is calibrated against a real 2-page excerpt of a Chase
// Sapphire Reserve ACCOUNT ACTIVITY table (statement date 07/15/26, pages 2
// and 3 of a 3-page statement) and is `status: 'live'`. See the comments on
// each field for what was actually observed. The real document overturned
// two assumptions the old placeholder guessed at:
//
//   - There is no "PURCHASE" / "PAYMENTS AND OTHER CREDITS" section split
//     anywhere in the transaction table on these pages — it's one
//     continuous list, direction read off each row's own printed sign
//     (a plain "-18.08", not a separate credits block). See `sections` and
//     `signConvention` below.
//   - The column header spans two visual lines ("Date of" / "Transaction
//     Merchant Name or Transaction Description $ Amount"), and only the
//     second resolves into cells — see `columns` below.
//
// CHASE_CC_SPENDING_REPORT is also calibrated (against a different, real
// document — a Chase spending report, 11 pages, 12 categories, ~250
// transactions) but is deliberately `status: 'in_development'` right now —
// **paused, not broken or abandoned.** The statement profile above covers
// the immediate need (every transaction goes through the same
// merchant-lookup + AI categorization pipeline regardless of document
// type, since a statement carries no Chase-assigned category to lean on
// anyway), and revisiting the spending report's category mapping — how its
// TRAVEL section should split against the app's own transport/trip
// subcategories — is explicitly on hold pending direction. See
// worker/README.md's "Supported documents" section and the
// `spending-report-paused` memory note for the same status recorded
// outside this file. Calibrating it earlier surfaced four real bugs in the
// pipeline itself (now fixed, each with its own commit): parseAmount didn't
// handle a leading sign printed AFTER the currency symbol ("$-51.30", how
// that document prints a refund); candidate-row detection assumed a date
// was one whitespace token, but "Mar 29, 2026" is three; findPrintedTotal
// searched the whole document instead of one section's row range, so every
// section would have reconciled against the summary table's grand total
// instead of its own; and signConvention was declared but never actually
// consulted — every direction was hardcoded to the section's, which is
// wrong for a document where refunds are printed as negative amounts
// INSIDE an otherwise all-debit category section, not sectioned off on
// their own. (That last fix is what CHASE_CC_STATEMENT's own
// `signConvention: { type: 'signed' }` below reuses directly.)

import type { BankProfile } from '../types';

export const CHASE_CC_STATEMENT: BankProfile = {
  id: 'chase_cc_statement',
  bank: 'chase',
  label: 'Chase — Credit Card Statement',
  status: 'live',
  kind: 'credit_card',
  docType: 'statement',

  // Unverified against this specific excerpt — the 2 pages calibrated
  // against are ACCOUNT ACTIVITY only (pages 2-3 of 3) and don't carry the
  // "JPMorgan Chase Bank, N.A." boilerplate a real page 1 almost certainly
  // has. Not currently consulted by the pipeline (registry.ts resolves a
  // profile purely from the card's own `bank` field, set once on the
  // card/account record — see resolveProfile), so this has no effect on
  // parsing today; left as the same reasonable-not-guessed value as before
  // in case a future wrong_bank check is wired up.
  identifiers: [/chase/i, /jpmorgan/i],

  // For a genuine full 3-page Chase card statement, the transaction table
  // starts on page 3 — pages 1-2 are the summary/offers front matter. Not
  // exercised by this excerpt (it already starts at the activity table),
  // but real uploads will have all 3 pages, so this is load-bearing there.
  skipPages: 2,

  // Confirmed: no "PURCHASE" / "PAYMENTS AND OTHER CREDITS" heading appears
  // anywhere on either page — a payment ("Payment Thank You-Mobile
  // -1,500.00") and an ordinary purchase ("AMAZON MKTPLACE PMTS ...
  // -28.14" if refunded, "EXPEDIA ... 135.70" if not) sit in the exact same
  // list with no dividing heading. `sections` still needs one entry so the
  // row-walk in table.ts has something to open on — it opens on the column
  // header line itself (repeats identically at the top of every page) and
  // never closes, so the whole document after the first header is in
  // scope. `direction: 'debit'` here is unused; `signConvention: 'signed'`
  // below is what actually decides each row.
  //
  // No `forceCategory` and no `totalLabel` on this section — confirmed
  // there is no Chase-assigned category on a statement (unlike the
  // spending report's per-category sections) and no printed section total
  // to reconcile against on these two pages. A real page 1 likely carries
  // an ACCOUNT SUMMARY with Purchases/Payments/Fees/Interest totals that
  // COULD reconcile the whole table, but that page wasn't part of what was
  // calibrated against — left unset rather than guessed at.
  //
  // `page_footer` and `ytd_totals` exist purely to bound continuation-joining
  // — table.ts's join loop already stops as soon as the NEXT row's text
  // matches ANY profile section's `opens` (checked against every entry, not
  // just the currently-open one), so a section here doesn't need to
  // accumulate transactions to be useful. This is a real fix, not a
  // defensive guess: running the pipeline against the actual document
  // before these existed produced two visibly wrong rows — the account-
  // holder/barcode line printed at the bottom of every page
  // ("KAUNIK KAMILA Page 2 of 3 Statement Date: 07/15/26", then the
  // barcode line beneath it) got joined onto CRICKET CAFE, the last
  // transaction before that footer, and the "2026 Totals Year-to-Date /
  // Total fees charged.../Total interest charged..." block at the true end
  // of the activity table got joined onto the very last transaction, UBER
  // *EATS. Both are legitimate continuation CANDIDATES by the existing
  // rule (no date, no amount, sits right after a body row) — nothing but
  // an explicit boundary distinguishes them from a real wrapped
  // description like a flight's itinerary lines, which need to keep
  // joining exactly as before.
  sections: [
    {
      id: 'activity',
      opens: /^Transaction\s+Merchant Name or Transaction Description\s+\$\s*Amount$/i,
      direction: 'debit',
    },
    { id: 'page_footer', opens: /Page\s+\d+\s+of\s+\d+/i, direction: 'debit' },
    { id: 'ytd_totals', opens: /Totals\s+Year-to-Date/i, direction: 'debit' },
  ],

  // Confirmed 3 columns — no Posted Date, unlike the spending report's 4.
  // The printed header spans two visual lines ("Date of" on its own, then
  // "Transaction Merchant Name or Transaction Description $ Amount"), and
  // only the second resolves into 3 cells once split against the
  // gutter-inferred columns: "Transaction" / "Merchant Name or Transaction
  // Description" / "$ Amount". "Date of" sits above those columns as its
  // own row and never lands in any single cell, so the date column's
  // header rule matches on "Transaction" alone rather than the full "Date
  // of Transaction" label the placeholder guessed at.
  columns: [
    { role: 'date', header: /^Transaction$/i },
    { role: 'description', header: /merchant\s+name/i },
    { role: 'amount', header: /amount/i },
  ],

  // Confirmed: "06/18", "07/06" — no year, exactly what the placeholder
  // guessed, now verified against real rows. MM/DD/YY is declared too, not
  // for transaction rows but so periodPattern below (a 2-digit-year
  // "Statement Date: 07/15/26") has a format that can parse itself;
  // pickDateFormat still picks MM/DD for the actual transaction dates,
  // since MM/DD/YY scores 0 against year-less samples and MM/DD wins
  // outright.
  dateFormats: ['MM/DD', 'MM/DD/YY'],

  // Confirmed: both refunds and payments print as a plain negative amount
  // inline in the same list as ordinary purchases — "RECREATION.GOV
  // ALBUQUERQUE NM -18.08", "Trip.com 646-3628606 DE -177.46" (refunding a
  // booking that reappears, repurchased, as a positive amount five rows
  // later), "Payment Thank You-Mobile -1,500.00". With no separate credits
  // section to key off of, direction has to come from each row's own
  // printed sign — the same mechanism the spending report profile uses.
  signConvention: { type: 'signed' },

  // Confirmed: neither page prints an explicit "opening to closing" range —
  // only a single closing "Statement Date: 07/15/26" (once, in the page
  // footer) and a separate, unrelated "30 Days in Billing Period" line. No
  // guessed range is invented here: this single-anchor capture (no `start`
  // group) is enough on its own, since extractPeriod treats a `start`-less
  // match as start==end, and yearFor() only ever reads period.end's
  // month/year to decide whether a year-less transaction date rolls back a
  // year. A real full statement's page 1 may print an actual open/close
  // range — unverified, since that page wasn't part of this excerpt.
  periodPattern: /Statement Date:\s*(?<end>\d{1,2}\/\d{1,2}\/\d{2})/i,
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
  // Paused, not broken — see the file-level comment above CHASE_CC_STATEMENT
  // for why, and worker/README.md's "Supported documents" section /
  // memory's `spending-report-paused` note for the same status recorded
  // outside this file. Every field below is still fully calibrated against
  // a real document (unlike CHASE_CC_STATEMENT before this session); only
  // `status` moved, so re-enabling this later is a one-line flip back to
  // 'live', not a recalibration.
  status: 'in_development',
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
