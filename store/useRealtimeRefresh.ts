import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A refresh counter whose bumps collapse under a burst.
 *
 * Every store that subscribes to `postgres_changes` wires the handler straight
 * to a counter bump, and each bump re-runs a full `select('*')`. That is fine
 * for one-at-a-time edits, but Postgres emits one realtime message *per row*:
 * a bulk write of 200 expenses arrives as 200 messages in separate macrotasks,
 * so React's batching can't help and the store refetches the whole table 200
 * times. (Supabase Realtime also drops messages past its per-second ceiling, so
 * the last of those refetches isn't even guaranteed to be the authoritative one
 * — callers that need certainty should refresh explicitly after the write.)
 *
 * Leading + trailing: the first bump fires immediately, so a single manual add
 * still feels instant, and everything arriving inside `windowMs` collapses into
 * one trailing bump. The window re-opens after each trailing fire, so a long
 * burst keeps coalescing instead of reverting to one refetch per message once
 * the first window closes.
 */
export function useRealtimeRefresh(windowMs = 400) {
  const [refreshKey, setRefreshKey] = useState(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const refresh = useCallback(() => {
    // A window is already open — fold into its trailing fire.
    if (timerRef.current !== null) { pendingRef.current = true; return; }

    bump();

    const settle = () => {
      timerRef.current = null;
      if (!pendingRef.current) return;
      pendingRef.current = false;
      bump();
      timerRef.current = setTimeout(settle, windowMs);
    };
    timerRef.current = setTimeout(settle, windowMs);
  }, [bump, windowMs]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  return { refreshKey, refresh };
}
