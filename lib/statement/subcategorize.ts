// Statement import — inferring a subcategory (and, where one applies, the
// specific detail behind it: an airline, a cab provider, a restaurant, a
// grocery store) straight off the merchant descriptor.
//
// Deliberately NOT a Gemini call. Category needs a model because "is this
// merchant a restaurant or a bar" genuinely requires world knowledge; the
// signals here don't — they're brand names and category-defining keywords
// sitting right in the descriptor text ("LYFT", "DOORDASH", "ALASKA AIR").
// Pattern-matching those locally costs nothing, adds no latency, and never
// leaves the browser, same as merchant normalization.
//
// Every match here is a real, curated signal — never a guess dressed up as
// one. When nothing matches, this returns null and the review row shows the
// category alone, exactly like an ordinary manually-entered expense with no
// subcategory picked. A wrong auto-fill is worse than an absent one: the
// user has to notice AND correct it, instead of just filling in a blank.
//
// Coverage today: transport, food, shopping, groceries, subscriptions — the
// categories a card statement's normal spend actually clusters into.
// Everything else intentionally returns null; add a branch here rather than
// stretch an existing one when a new pattern earns its keep.

export interface SubcategoryResult {
  subcategory: string | null;
  /** Written to Expense.details — shape matches the field `key`s in constants/subcategories.ts. */
  details: Record<string, string> | null;
}

const NONE: SubcategoryResult = { subcategory: null, details: null };

/** Brand -> the exact label constants/subcategories.ts's car-rental field already offers. */
const CAR_RENTAL_BRANDS: [RegExp, string][] = [
  [/\bAVIS\b/i, 'Avis'],
  [/\bBUDGET\b/i, 'Budget'],
  [/\bALAMO\b/i, 'Alamo'],
  [/\bENTERPRISE\b/i, 'Enterprise'],
  [/\bNATIONAL\b/i, 'National'],
  [/\bHERTZ\b/i, 'Hertz'],
  [/\bDOLLAR\b/i, 'Dollar'],
  [/\bTHRIFTY\b/i, 'Thrifty'],
  [/\bFOX\s*RENT\s*A?\s*CAR\b|\bFOXRENTACAR\b/i, 'Fox'],
];

/**
 * Common carriers by their descriptor spelling, which is usually truncated
 * ("FRONTIER AI", not "FRONTIER AIRLINES") — matching on the airline's own
 * name rather than requiring "AIR"/"AIRLINES" as a suffix is what catches
 * that. Not exhaustive; a carrier missing here just yields category alone,
 * same as any other unmatched merchant.
 */
const AIRLINES: [RegExp, string][] = [
  [/\bALASKA\s*AIR/i, 'Alaska Airlines'],
  [/\bFRONTIER\b/i, 'Frontier Airlines'],
  [/\bDELTA\s*AIR/i, 'Delta Air Lines'],
  [/\bUNITED\s*AIR/i, 'United Airlines'],
  [/\bSOUTHWEST\b/i, 'Southwest Airlines'],
  [/\bJETBLUE\b/i, 'JetBlue'],
  [/\bSPIRIT\s*AIR/i, 'Spirit Airlines'],
  [/\bAMERICAN\s*AIR/i, 'American Airlines'],
  [/\bHAWAIIAN\s*AIR/i, 'Hawaiian Airlines'],
  [/\bALLEGIANT\b/i, 'Allegiant Air'],
  [/\bSUN\s*COUNTRY\b/i, 'Sun Country Airlines'],
  [/\bBRITISH\s*AIRWAYS\b/i, 'British Airways'],
  [/\bLUFTHANSA\b/i, 'Lufthansa'],
  [/\bAIR\s*CANADA\b/i, 'Air Canada'],
  [/\bAIR\s*FRANCE\b/i, 'Air France'],
  [/\bEMIRATES\b/i, 'Emirates'],
  [/\bQATAR\s*AIR/i, 'Qatar Airways'],
  [/\bTURKISH\s*AIR/i, 'Turkish Airlines'],
  [/\bVIRGIN\s*(ATLANTIC|AMERICA)\b/i, 'Virgin'],
  [/\bRYANAIR\b/i, 'Ryanair'],
  [/\bEASYJET\b/i, 'easyJet'],
  [/\bWESTJET\b/i, 'WestJet'],
  [/\bKLM\b/i, 'KLM'],
];

const APP_SUBSCRIPTIONS: RegExp[] = [
  /\bUBER\s*ONE\b/i, /\bAMAZON\s*PRIME\b/i, /\bNETFLIX\b/i, /\bSPOTIFY\b/i,
  /\bHULU\b/i, /\bDISNEY\+?\b/i, /\bMEMBERSHIP\b/i,
];
const AI_SUBSCRIPTIONS = /\bOPENAI\b|\bCHATGPT\b|\bANTHROPIC\b|\bCLAUDE\b|\bGEMINI\b|\bPERPLEXITY\b/i;
const DEV_SUBSCRIPTIONS = /\bGITHUB\b|\bVERCEL\b|\bCLOUDFLARE\b|\bAWS\b|\bDIGITALOCEAN\b|\bRENDER\b/i;
const FITNESS_SUBSCRIPTIONS = /\bPELOTON\b|\bSTRAVA\b|\bWHOOP\b/i;

function firstMatch(raw: string, table: [RegExp, string][]): string | null {
  for (const [re, label] of table) if (re.test(raw)) return label;
  return null;
}

/**
 * @param category    Already-resolved Spendee category id (constants/theme.ts).
 * @param raw          The original bank descriptor — richer signal than the
 *                      normalized merchant key, since normalization strips
 *                      exactly the words ("EATS", "ONE MEMBERSHIP") this
 *                      needs to tell subcategories apart.
 * @param merchantName Normalized display name — used only as the detail
 *                      value for a bucket with no fixed brand list (dining).
 */
export function inferSubcategory(category: string, raw: string, merchantName: string): SubcategoryResult {
  const upper = raw.toUpperCase();

  switch (category) {
    case 'transport': {
      const airline = firstMatch(upper, AIRLINES);
      if (airline) return { subcategory: 'flight', details: { airline } };

      const carRental = firstMatch(upper, CAR_RENTAL_BRANDS);
      if (carRental) return { subcategory: 'car-rental', details: { company: carRental } };

      if (/\bLIME\b/i.test(upper)) return { subcategory: 'lime', details: null };

      // UBER alone is ambiguous (rides, eats, and the One membership all say
      // "UBER") — EATS and MEMBERSHIP are caught by the food/subscriptions
      // branches below, working from the same raw text, so by the time a
      // transport-categorized UBER row reaches here it's a ride.
      if (/\bUBER\b/i.test(upper) && !/\bEATS\b/i.test(upper) && !/\bMEMBERSHIP\b/i.test(upper)) {
        return { subcategory: 'cab', details: { provider: 'Uber' } };
      }
      if (/\bLYFT\b/i.test(upper)) return { subcategory: 'cab', details: { provider: 'Lyft' } };

      if (/\bCRUISE\b/i.test(upper)) return { subcategory: 'cruise', details: null };
      if (/\bAMTRAK\b|\bTRAIN\b/i.test(upper)) return { subcategory: 'train', details: null };
      return NONE;
    }

    case 'food': {
      if (/\bDOORDASH\b/i.test(upper)) return { subcategory: 'doordash', details: null };
      if (/\bUBER\b/i.test(upper) && /\bEATS\b/i.test(upper)) return { subcategory: 'uber-eats', details: null };
      // Fallback, not a guess: within 'food', "not a known delivery app"
      // reliably means dining out — the merchant IS the restaurant, so this
      // detail is definitionally correct, not inferred from a weak signal.
      return { subcategory: 'dining', details: { restaurant: merchantName } };
    }

    case 'shopping': {
      if (/\bAMAZON\b/i.test(upper)) return { subcategory: 'amazon', details: null };
      return NONE; // 'in-store' isn't a confident default — too broad a bucket to assume
    }

    case 'groceries': {
      // No subcategory list exists for groceries (constants/subcategories.ts)
      // — it takes a category-level 'store' detail field instead. Always
      // set: the merchant on a groceries-categorized row IS the store.
      return { subcategory: null, details: { store: merchantName } };
    }

    case 'subscriptions': {
      if (AI_SUBSCRIPTIONS.test(upper)) return { subcategory: 'ai', details: null };
      if (DEV_SUBSCRIPTIONS.test(upper)) return { subcategory: 'dev', details: null };
      if (FITNESS_SUBSCRIPTIONS.test(upper)) return { subcategory: 'fitness', details: null };
      if (APP_SUBSCRIPTIONS.some((re) => re.test(upper))) return { subcategory: 'app', details: null };
      return NONE;
    }

    default:
      return NONE;
  }
}
