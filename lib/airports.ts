// Offline airport search over the bundled OurAirports/mwgg open dataset
// (constants/data/airports.json — [iata, name, city, country] tuples).

type AirportTuple = [string, string, string, string];

let cache: AirportTuple[] | null = null;

function load(): AirportTuple[] {
  if (!cache) cache = require('@/constants/data/airports.json') as AirportTuple[];
  return cache;
}

export interface AirportHit {
  iata: string;
  name: string;
  city: string;
  country: string;
  display: string;   // "SEA — Seattle-Tacoma International (Seattle, US)"
}

export function searchAirports(query: string, limit = 6): AirportHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const airports = load();
  const codeHits: AirportHit[] = [];
  const textHits: AirportHit[] = [];

  for (const [iata, name, city, country] of airports) {
    if (codeHits.length + textHits.length >= limit * 4) break;
    if (iata.toLowerCase().startsWith(q)) {
      codeHits.push(toHit(iata, name, city, country));
    } else if (
      city.toLowerCase().startsWith(q) ||
      name.toLowerCase().includes(q)
    ) {
      textHits.push(toHit(iata, name, city, country));
    }
  }

  return [...codeHits, ...textHits].slice(0, limit);
}

function toHit(iata: string, name: string, city: string, country: string): AirportHit {
  return {
    iata, name, city, country,
    display: `${iata} — ${name}${city ? ` (${city}, ${country})` : ''}`,
  };
}
