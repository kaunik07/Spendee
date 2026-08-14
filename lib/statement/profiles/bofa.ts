// Bank of America — placeholder only. See profiles/chase.ts's header comment
// for what `status: 'in_development'` guarantees and what the placeholder
// values below are and aren't.
//
// Shown in the bank picker, disabled, with an "under development" note — the
// user explicitly asked for BofA to be visible-but-not-yet-working rather
// than absent, same closed-list discipline as every other unsupported bank.

import type { BankProfile } from '../types';

export const BOFA_CC_STATEMENT: BankProfile = {
  id: 'bofa_cc_statement',
  bank: 'bofa',
  label: 'Bank of America — Credit Card Statement',
  status: 'in_development',
  kind: 'credit_card',
  docType: 'statement',
  identifiers: [/bank\s+of\s+america/i],
  // TODO(calibrate): entirely unverified placeholder — no real Bank of
  // America statement has been examined yet.
  sections: [
    { id: 'purchases', opens: /^transactions?\b/i, direction: 'debit' },
    { id: 'payments', opens: /payments?\s+and\s+credits/i, direction: 'credit' },
  ],
  columns: [
    { role: 'date', header: /^date$/i },
    { role: 'description', header: /^description$/i },
    { role: 'amount', header: /^amount$/i },
  ],
  dateFormats: ['MM/DD/YY'],
  signConvention: { type: 'section' },
};

export const BOFA_PROFILES: BankProfile[] = [BOFA_CC_STATEMENT];
