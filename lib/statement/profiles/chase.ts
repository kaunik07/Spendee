// Chase profiles — NOT YET CALIBRATED.
//
// Both entries below are `status: 'in_development'`, which means
// registry.ts's resolveProfile() never returns them as 'live' and the import
// screen's dropzone stays disabled for them (see the UI's profile-gate).
// Nothing here can produce a wrong import — there is no path that reaches
// pdf-parser.ts's parse() with an in_development profile.
//
// The shape below exists so the rest of the pipeline (table.ts, confidence.ts,
// the UI) has something concrete to compile and test against, and so that
// calibrating a real profile later is "fill in these fields against a real
// statement", not "invent the plumbing". The field VALUES are placeholders —
// none of them have been checked against an actual Chase document. Flip
// `status` to 'live' only once they have been.

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

export const CHASE_CC_SPENDING_REPORT: BankProfile = {
  ...CHASE_CC_STATEMENT,
  id: 'chase_cc_spending_report',
  label: 'Chase — Credit Card Spending Report',
  docType: 'spending_report',
  // TODO(calibrate): the spending report is a different layout from the
  // statement — real section headings, columns and date format all need
  // establishing from an actual report before this is anything but a copy
  // of the statement profile's placeholders.
};

export const CHASE_PROFILES: BankProfile[] = [CHASE_CC_STATEMENT, CHASE_CC_SPENDING_REPORT];
