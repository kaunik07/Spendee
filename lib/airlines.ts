// Offline airline search over the bundled OpenFlights open dataset
// (constants/data/airlines.json — [iata, name, country] tuples, active airlines only).

type AirlineTuple = [string, string, string];

let cache: AirlineTuple[] | null = null;

function load(): AirlineTuple[] {
  if (!cache) cache = require('@/constants/data/airlines.json') as AirlineTuple[];
  return cache;
}

export interface AirlineHit {
  iata: string;
  name: string;
  country: string;
}

export function searchAirlines(query: string, limit = 6): AirlineHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const airlines = load();
  const codeHits: AirlineHit[] = [];
  const nameHits: AirlineHit[] = [];

  for (const [iata, name, country] of airlines) {
    if (iata.toLowerCase() === q) {
      codeHits.push({ iata, name, country });
    } else if (name.toLowerCase().includes(q)) {
      nameHits.push({ iata, name, country });
    }
    if (codeHits.length + nameHits.length >= limit * 3) break;
  }

  // Prefer names that START with the query, then the rest
  nameHits.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name);
  });

  return [...codeHits, ...nameHits].slice(0, limit);
}
