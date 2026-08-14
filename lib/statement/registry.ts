// Statement import — dispatch, on both axes.
//
// Format detection picks a StatementParser from raw bytes (§ detect.ts already
// does the byte-sniffing; this just holds the list). Profile resolution picks
// a BankProfile from (bank, kind, docType) — the three things the import
// screen already knows before a file is even chosen, since the user picked
// the card/account first.

import { sniffFormat } from './detect';
import { pdfParser } from './pdf-parser';
import { CHASE_PROFILES } from './profiles/chase';
import { BOFA_PROFILES } from './profiles/bofa';
import type {
  BankId, BankProfile, DocType, SourceKind, StatementParser,
} from './types';

export const PARSERS: StatementParser[] = [pdfParser];

/** Every profile this build knows about, live or not. Adding a bank is adding to this list. */
export const PROFILES: BankProfile[] = [...CHASE_PROFILES, ...BOFA_PROFILES];

export function detectParser(head: Uint8Array): StatementParser | null {
  const format = sniffFormat(head);
  if (!format) return null;
  return PARSERS.find((p) => p.id === format) ?? null;
}

export type ProfileLookup =
  | { status: 'live'; profile: BankProfile }
  | { status: 'in_development'; profile: BankProfile }
  | { status: 'unsupported' };

/**
 * `unsupported` and `in_development` are deliberately distinct — the picker
 * needs to know whether a bank exists in the closed list at all (so it can
 * even be shown, disabled, with an "under development" note) versus a
 * combination that was never on the list (which is just absent).
 */
export function resolveProfile(bank: BankId, kind: SourceKind, docType: DocType): ProfileLookup {
  const profile = PROFILES.find((p) => p.bank === bank && p.kind === kind && p.docType === docType);
  if (!profile) return { status: 'unsupported' };
  return profile.status === 'live' ? { status: 'live', profile } : { status: 'in_development', profile };
}

/** Every profile declared for a given bank, for the "which doc types does this bank support" picker. */
export function profilesForBank(bank: BankId): BankProfile[] {
  return PROFILES.filter((p) => p.bank === bank);
}
