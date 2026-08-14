/**
 * Verifying the caller without any crypto in this Worker.
 *
 * The alternative is to verify the JWT's signature locally — that needs a
 * JWKS cache (or the shared secret, for HS256 tokens) held in the Worker, and
 * it has to be kept correct through Supabase's move to per-project asymmetric
 * signing keys. Asking Supabase's own /auth/v1/user endpoint instead costs
 * one extra subrequest per parse and buys three things that matter more here:
 * no key material lives in this Worker at all, it works unchanged whichever
 * signing scheme the project uses, and it honours a session the user has
 * since revoked — a locally-verified signature would still look valid.
 *
 * The request this endpoint gates is already seconds of work (a categorize
 * call, potentially a Gemini round trip), so ~60ms of auth overhead is not
 * the cost that matters.
 */

export interface AuthedUser {
  id: string;
}

export async function verifyCaller(
  supabaseUrl: string,
  anonKey: string,
  authorizationHeader: string | null,
): Promise<AuthedUser | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: authorizationHeader,
        apikey: anonKey,
      },
    });
    if (!res.ok) return null;

    const body = await res.json<{ id?: string }>();
    return body?.id ? { id: body.id } : null;
  } catch {
    return null;
  }
}
