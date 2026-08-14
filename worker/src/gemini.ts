/**
 * Gemini call + retry, lifted from Trip Planner's worker/src/index.ts
 * (callGemini / callGeminiWithRetry / extractJson) unchanged in shape — this
 * Worker asks a much narrower question (map a list of merchant name strings to
 * one of 15 category ids) but the failure modes that logic was written for
 * are exactly the same ones here.
 */

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const UPSTREAM_TIMEOUT_MS = 20_000;

export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * responseSchema makes the reply structured JSON, but a stray fence still
 * shows up occasionally, so pull out the outermost array rather than trusting
 * it to be clean.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const startObj = candidate.indexOf('{');
  const startArr = candidate.indexOf('[');
  const start = startArr === -1 ? startObj : startObj === -1 ? startArr : Math.min(startObj, startArr);
  const endObj = candidate.lastIndexOf('}');
  const endArr = candidate.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON in response');
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function callGemini(key: string, userPrompt: string, schema: unknown, model = GEMINI_MODEL) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0,   // categorization, not creative writing — pick the same answer every time
        },
      }),
    },
  );
  if (!res.ok) {
    throw new UpstreamError(
      `Gemini ${model} returned ${res.status}: ${(await res.text()).slice(0, 400)}`,
      res.status,
    );
  }
  const data = await res.json<any>();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  return extractJson(text);
}

/**
 * Given more than one key, a 429 or 5xx moves to the next one immediately —
 * a second Google Cloud project has an entirely separate free-tier quota, so
 * there's nothing to gain by waiting on the one that just failed. Only once
 * every key has been tried does it back off and retry the last one, in case
 * the failure was momentary (a 503 spike) rather than quota.
 */
export async function callGeminiWithRetry(keys: string[], userPrompt: string, schema: unknown, model?: string) {
  if (!keys.length) throw new Error('No Gemini key configured');
  let lastErr: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await callGemini(keys[i], userPrompt, schema, model);
    } catch (e) {
      lastErr = e;
      if (!(e instanceof UpstreamError && (e.status >= 500 || e.status === 429))) throw e;
      if (i < keys.length - 1) continue; // another key to try — skip straight to it
    }
  }
  const status = lastErr instanceof UpstreamError ? lastErr.status : 500;
  await new Promise((r) => setTimeout(r, status === 429 ? 6_000 : 1_000));
  return callGemini(keys[keys.length - 1], userPrompt, schema, model);
}
