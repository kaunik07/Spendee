/**
 * Exact counters for the categorizer's two spend guards.
 *
 * Generalized from Trip Planner's worker/src/quota.ts — same shape, `month=`
 * renamed `period=` so one class serves both counters this Worker needs: a
 * shared monthly Gemini-call cap, and a per-user daily parse-request guard.
 * The period string is opaque to this file; callers decide whether it means
 * a month or a day.
 *
 * A Durable Object rather than KV because KV is eventually consistent — two
 * requests landing together could both read the same stale total and both
 * decide there is room under the cap. A Durable Object is single-threaded per
 * object and its storage is transactional, so a read-modify-write here
 * genuinely cannot interleave.
 */

/** Reserve request: `?period=2026-08&cap=1000&want=12&all=1`. */
export interface QuotaGrant {
  /** How many calls the caller may now make. Never more than `want`. */
  granted: number;
  /** Total consumed this period, including this grant. */
  used: number;
  cap: number;
}

export class QuotaCounter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const q = new URL(request.url).searchParams;
    const period = q.get('period') ?? '';
    const cap = Math.max(0, Number(q.get('cap') ?? 0));
    const want = Math.max(0, Number(q.get('want') ?? 0));
    /**
     * All-or-nothing. A merchant-categorization batch is only worth sending as
     * a whole — partial coverage still costs a full model call for no
     * complete answer. Verification-style callers would want partial grants;
     * this Worker has none, but the flag is kept for parity with the pattern
     * this generalizes from.
     */
    const allOrNothing = q.get('all') === '1';

    const grant = await this.state.blockConcurrencyWhile(async () => {
      const key = `used:${period}`;
      const used = (await this.state.storage.get<number>(key)) ?? 0;
      const room = Math.max(0, cap - used);
      const granted = allOrNothing ? (room >= want ? want : 0) : Math.min(want, room);

      if (granted > 0) {
        await this.state.storage.put(key, used + granted);
        // First write of a new period — drop the old ones so this never grows unbounded.
        if (used === 0) await this.dropOtherPeriods(key);
      }
      return { granted, used: used + granted, cap } satisfies QuotaGrant;
    });

    return new Response(JSON.stringify(grant), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async dropOtherPeriods(keep: string) {
    const all = await this.state.storage.list<number>({ prefix: 'used:' });
    const stale = [...all.keys()].filter((k) => k !== keep);
    if (stale.length) await this.state.storage.delete(stale);
  }
}

/** UTC, because these counters are shared and a local boundary would be ambiguous. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reserves `want` calls against a named counter.
 *
 * **Fails closed**, but the two counters this Worker uses fail closed in
 * different directions, deliberately:
 *
 * - The shared Gemini counter failing closed just means unknown merchants
 *   land in `other` for this request — never fatal, since the mandatory
 *   review step exists exactly to absorb that.
 * - The per-user daily counter failing closed means the whole parse is
 *   rejected. An abuse guard that fails open on its own unavailability isn't
 *   a guard.
 *
 * `used: -1` marks the total as unknown rather than zero, so /health can say so.
 */
export async function reserve(
  ns: DurableObjectNamespace,
  counter: string,
  period: string,
  cap: number,
  want: number,
  allOrNothing = false,
): Promise<QuotaGrant> {
  // want === 0 deliberately still round-trips: it is how /health peeks at the real total.
  if (want < 0) return { granted: 0, used: 0, cap };
  try {
    const stub = ns.get(ns.idFromName(counter));
    const url = `https://quota/take?period=${period}&cap=${cap}`
      + `&want=${want}&all=${allOrNothing ? '1' : '0'}`;
    const res = await stub.fetch(url);
    if (!res.ok) throw new Error(`quota ${res.status}`);
    return await res.json<QuotaGrant>();
  } catch {
    return { granted: 0, used: -1, cap };
  }
}
