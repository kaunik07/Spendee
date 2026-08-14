// Statement import — the Worker client.
//
// Everything this file sends is normalized merchant name strings (from
// lib/statement/merchant.ts) — never the statement, never an amount, date,
// or account number. See worker/README.md for what the Worker does with them.
//
// Modeled on Trip Planner's lib/place-insights.ts: same "not configured"
// guard shape, same client-side timeout above the Worker's own upstream
// timeout so a stalled request doesn't spin the review screen forever.

import { supabase } from '@/lib/supabase';
import type { StatementErrorCode } from '@/lib/statement/types';

const STATEMENTS_URL = process.env.EXPO_PUBLIC_STATEMENTS_URL;

const TIMEOUT_MS = 30_000;

export function isStatementsConfigured(): boolean {
  return !!STATEMENTS_URL;
}

export class StatementApiError extends Error {
  /** Present when the Worker responded with a structured {error:{code,message}} body. */
  code?: StatementErrorCode | 'unauthorized' | 'quota_exceeded' | 'invalid_request' | 'not_found' | 'method_not_allowed';
  constructor(message: string, code?: StatementApiError['code']) {
    super(message);
    this.code = code;
  }
}

async function authHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new StatementApiError('Please sign in again.', 'unauthorized');
  }
  return `Bearer ${session.access_token}`;
}

async function callWorker<T>(path: string, body: unknown): Promise<T> {
  if (!STATEMENTS_URL) {
    throw new StatementApiError(
      'Statement import is not set up yet. Deploy worker/ and set EXPO_PUBLIC_STATEMENTS_URL.',
    );
  }

  const bearer = await authHeader();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${STATEMENTS_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: bearer },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      throw new StatementApiError('That took too long. Please try again.');
    }
    throw new StatementApiError('Could not reach the categorizer. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new StatementApiError('The categorizer returned an unreadable response.');
  }

  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status}).`;
    throw new StatementApiError(message, json?.error?.code);
  }

  return json as T;
}

export interface CategorizeResultEntry {
  category: string;
  source: 'map' | 'model';
}

export interface CategorizeResponse {
  map: Record<string, CategorizeResultEntry>;
  diagnostics: { cacheHits: number; modelCalls: number; modelAnswered: number };
}

/** Batched merchant lookup. Send every distinct key from a parse in one call. */
export function categorizeMerchants(keys: string[]): Promise<CategorizeResponse> {
  return callWorker<CategorizeResponse>('/categorize', { keys });
}

export interface MerchantCorrection {
  merchantKey: string;
  category: string;
  subcategory?: string | null;
}

export interface FeedbackResponse {
  applied: number;
  seeded: number;
}

/** Batched at commit time — every category edit in the review table in one call, not one per keystroke. */
export function submitMerchantFeedback(corrections: MerchantCorrection[]): Promise<FeedbackResponse> {
  return callWorker<FeedbackResponse>('/merchant-feedback', { corrections });
}

/** User-facing copy for a parse/categorize failure. Never echoes statement content. */
export function describeStatementError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'unsupported_format':    return 'Only PDF statements are supported right now.';
    case 'unsupported_profile':   return "We don't support that bank and document type combination yet.";
    case 'encrypted_pdf':         return 'This PDF is password-protected.';
    case 'no_text_layer':         return "This looks like a scan. Download the PDF directly from your bank's website instead.";
    case 'wrong_bank':            return "This doesn't look like a statement from the bank you selected. Double-check the card.";
    case 'no_table':              return "Couldn't find a transaction table in this document.";
    case 'ambiguous_columns':
    case 'ambiguous_dates':
    case 'ambiguous_amounts':
    case 'ambiguous_direction':
    case 'layout_misread':        return "Couldn't read this document's layout reliably.";
    case 'reconciliation_failed': return "The numbers in this document don't add up as expected, so we're not importing anything from it.";
    case 'too_many_rows':         return 'This document has too many transactions for one import — try a shorter period.';
    case 'quota_exceeded':        return "You've hit today's import limit. Try again tomorrow.";
    case 'unauthorized':          return 'Please sign in again.';
    default:                      return fallback;
  }
}
