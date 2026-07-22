// Minimal pub/sub so independent store hooks can re-materialize together when
// the sync queue changes (e.g. an expense's balance-delta op must refresh the
// accounts/cards hooks, which live in different providers).

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSync(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function notifySync(): void {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore listener errors */ }
  });
}
