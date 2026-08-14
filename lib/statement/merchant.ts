// Statement import — turning a bank descriptor into a stable merchant key.
//
// "SQ *BLUE BOTTLE COFFEE  OAKLAND CA 07/04" and
// "SQ *BLUE BOTTLE COFFEE  BERKELEY CA 08/11" have to collapse to the same
// key, or the merchant map never accumulates and every import pays for fresh
// model calls.
//
// The key is also the ONLY thing this feature ever sends off the machine. The
// statement, the amounts, the dates and the account number stay local; a list
// of strings like ['BLUE BOTTLE COFFEE'] is what reaches the categorizer.
//
// Stability matters more than prettiness. A key that keeps a city in it is
// mildly wasteful — one model call, then cached forever. A key that varies
// run to run is broken, because nothing ever matches.

export interface NormalizedMerchant {
  /** Lookup key: uppercase, stripped, at most 5 tokens. */
  key: string;
  /** Title-cased key — becomes Expense.name. */
  display: string;
  /** Cleaner display name that strips common merchant suffixes */
  cleanDisplay: string;
}

/**
 * Payment-processor and card-network noise glued to the front of a descriptor.
 * Applied repeatedly, since these stack ("POS DEBIT CARD PURCHASE …").
 */
const PREFIXES: RegExp[] = [
  /^SQ\s*\*/,               // Square
  /^TST\s*\*/,              // Toast
  /^SP\s*\*/,               // Shopify / Stripe-hosted storefronts
  /^PAYPAL\s*\*/,
  /^PP\s*\*/,
  /^IZ\s*\*/,               // iZettle
  /^WL\s*\*/,               // Worldline
  /^EBAY\s+O\*/,
  /^POS\s+/,
  /^PURCHASE\s+/,
  /^DEBIT\s+CARD\s+PURCHASE\s+/,
  /^RECURRING\s+PAYMENT\s+/,
  /^VISA\s+/,
  /^MC\s+/,
  /^ACH\s+/,
  /^ATM\s+/,
  /^UPI\//,
  /^IMPS\//,
  /^NEFT\//,
];

/** Reference numbers, card tails and contact details tacked onto the end. */
const TRAILERS: RegExp[] = [
  /\bX{2,}\d{2,}\b/g,          // XXXX1234
  // Card tails are exactly four digits. Matching three-or-more instead ate the
  // product number in MICROSOFT*365, where '*' is a vendor separator rather
  // than a card-tail marker.
  /\*\d{4}(?!\d)/g,            // *1234
  /\bENDING\s+\d+\b/g,
  /\bREF\s*#?\s*\w+\b/g,
  /\bAUTH\s*#?\s*\d+\b/g,
  /#\s*\d+\b/g,                // store number — '#' makes it unambiguous
  /\b\d{3}-\d{3}-\d{4}\b/g,    // phone
  /\b\d{3}-\d{7}\b/g,
];

/** Common merchant suffixes that should be stripped for cleaner display */
const MERCHANT_SUFFIXES: RegExp[] = [
  /\s+(ONLINE|WEB|NET|COM|INTERNET|DIGITAL|ECOM|E-COM|ECOMM|ECOMMERCE)$/i,
  /\s+(TEAM|CREW|STAFF|GROUP|ASSOCIATES|PARTNERS|LLC|INC|CORP|CO|COMPANY)$/i,
  /\s+(STORE|SHOP|MARKET|BOUTIQUE|OUTLET|DEPOT|WAREHOUSE)$/i,
  /\s+(SERVICE|SERVICES|SOLUTIONS|SYSTEMS|LABS|TECH|TECHNOLOGIES)$/i,
  /\s+(FOODS|FOOD|DINING|EATS|KITCHEN|GRILL|BAR|CAFE|COFFEE|BREW)$/i,
  /\s+(PAYMENT|PAY|BILL|BILLING|CHECKOUT|PURCHASE)$/i,
  /\s+(MOBILE|APP|PORTAL|ACCOUNT|ACCT|BANKING|CARD|VISA|MC|AMEX)$/i,
  /\s+(ORDER|ORDERS|DELIVERY|SHIPPING|FULFILLMENT)$/i,
  /\s+(SUPPORT|HELP|CARE|CUSTOMER|CLIENT|SERVICE)$/i,
];

const EMBEDDED_DATE = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g;
const EMBEDDED_TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const TLD           = /\.(?:COM|NET|ORG|CO|IO|APP|INFO|SHOP|STORE)\b/g;

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

const COUNTRIES = new Set([
  'USA','CANADA','MEXICO','UK','GB','ENGLAND','IRELAND','FRANCE','GERMANY',
  'SPAIN','ITALY','INDIA','JAPAN','AUSTRALIA','SINGAPORE','NETHERLANDS',
]);

/**
 * Only consulted once a trailing state or country has already been found —
 * that's the proof the tail is a location at all. Without that gate, stripping
 * a trailing word because it looks like a city would eat real merchant names.
 * A city not listed here just stays in the key: stable, and worth one model
 * call rather than a wrong key.
 */
const CITY_TOKENS = new Set([
  'NEW','YORK','BROOKLYN','QUEENS','BRONX','MANHATTAN','LOS','ANGELES','SAN',
  'FRANCISCO','JOSE','DIEGO','ANTONIO','OAKLAND','BERKELEY','PALO','ALTO',
  'MOUNTAIN','VIEW','SUNNYVALE','SANTA','CLARA','CRUZ','MONICA','FREMONT',
  'SEATTLE','BELLEVUE','REDMOND','PORTLAND','DENVER','BOULDER','AUSTIN',
  'DALLAS','HOUSTON','PLANO','IRVING','ARLINGTON','CHICAGO','EVANSTON',
  'BOSTON','CAMBRIDGE','SOMERVILLE','ATLANTA','MIAMI','ORLANDO','TAMPA',
  'PHOENIX','SCOTTSDALE','TEMPE','MESA','VEGAS','LAS','RENO','SACRAMENTO',
  'FRESNO','LONG','BEACH','IRVINE','ANAHEIM','PASADENA','GLENDALE','BURBANK',
  'PHILADELPHIA','PITTSBURGH','BALTIMORE','WASHINGTON','RICHMOND','CHARLOTTE',
  'RALEIGH','DURHAM','NASHVILLE','MEMPHIS','DETROIT','CLEVELAND','COLUMBUS',
  'CINCINNATI','INDIANAPOLIS','MILWAUKEE','MINNEAPOLIS','PAUL','SALT','LAKE',
  'CITY','KANSAS','LOUIS','OMAHA','TUCSON','ALBUQUERQUE','HONOLULU','ANCHORAGE',
  'JERSEY','NEWARK','HOBOKEN','STAMFORD','HARTFORD','PROVIDENCE','BUFFALO',
  'ROCHESTER','SYRACUSE','ALBANY','TORONTO','VANCOUVER','MONTREAL',
]);

const MAX_TOKENS = 5;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function cleanMerchantName(name: string): string {
  let clean = name;
  // Apply merchant suffix stripping repeatedly
  for (let changed = true; changed; ) {
    changed = false;
    for (const re of MERCHANT_SUFFIXES) {
      const before = clean;
      clean = clean.replace(re, '');
      if (clean !== before) changed = true;
    }
  }
  // Clean up any remaining whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  // If we stripped everything, fall back to original
  return clean || name;
}

export function normalizeMerchant(raw: string): NormalizedMerchant {
  let s = (raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // drop combining accents
    .toUpperCase();

  // Apostrophes are DELETED, not spaced: MCDONALD'S -> MCDONALDS, not
  // MCDONALD S. Getting this backwards splits half the well-known merchants
  // into a stray one-letter token.
  s = s.replace(/['‘’`]/g, '');

  // Before punctuation becomes whitespace, so NETFLIX.COM -> NETFLIX rather
  // than NETFLIX COM.
  s = s.replace(TLD, ' ');

  s = s.replace(EMBEDDED_DATE, ' ').replace(EMBEDDED_TIME, ' ');
  for (const re of TRAILERS) s = s.replace(re, ' ');

  // Prefixes can stack, so keep going until nothing more matches.
  for (let changed = true; changed; ) {
    changed = false;
    const before = s;
    for (const re of PREFIXES) s = s.replace(re, '');
    s = s.trimStart();
    if (s !== before) changed = true;
  }

  s = s.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  let tokens = s.split(' ').filter(Boolean);

  // Reference numbers and store ids that survived as bare tokens. Kept
  // deliberately narrow so a real name like MICROSOFT*365 or 7 ELEVEN lives.
  tokens = tokens.filter((t) => {
    const digits = (t.match(/\d/g) ?? []).length;
    if (t.length >= 6 && digits === t.length) return false;  // 0012345678
    if (digits >= 4) return false;                            // RT4G28TW3 style ids
    return true;
  });

  // Trailing geography, gated on actually finding a state or country.
  const isGeo = (t: string) => US_STATES.has(t) || COUNTRIES.has(t);
  if (tokens.length >= 2 && isGeo(tokens[tokens.length - 1])) {
    tokens.pop();
    for (let i = 0; i < 2 && tokens.length >= 2; i++) {
      if (CITY_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
      else break;
    }
  }

  // A bare number without a '#' is ambiguous: a store id in IN N OUT BURGER
  // 123, part of the name in MICROSOFT 365 or 7 ELEVEN. Two things separate
  // them — a store id TRAILS the name, and it only appears once the name is
  // long enough to need one. So: drop a trailing all-digit token only when at
  // least three tokens survive it. Judged after geography is gone, so the
  // count reflects the merchant name alone.
  //
  // Position matters as much as length here. An earlier version dropped every
  // bare number in a 4+ token name, which turned MICROSOFT 365 MSBILL INFO
  // into MICROSOFT MSBILL INFO.
  //
  // Getting this wrong is not fatal either way: an un-stripped store number
  // still yields a STABLE key, just one per store rather than per brand, which
  // costs extra model calls rather than correctness.
  if (tokens.length >= 4 && /^\d+$/.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  const key = tokens.slice(0, MAX_TOKENS).join(' ');
  const display = titleCase(key);
  const cleanDisplay = cleanMerchantName(display);

  return { key, display, cleanDisplay };
}

/**
 * True when normalizing a key returns it unchanged. The seeded merchant map is
 * only useful if its keys are fixed points — otherwise nothing ever matches
 * them and the seed is dead weight.
 */
export function isNormalizedKey(key: string): boolean {
  return normalizeMerchant(key).key === key;
}