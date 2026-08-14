/**
 * Mirrors constants/subcategories.ts in the app repo — same reasoning as
 * categories.ts's duplication of constants/theme.ts's Categories: the Worker
 * doesn't share a build with the Expo app, and a categorization prompt only
 * needs ids/labels, not the full per-field UI definitions (search-list
 * pickers, date types, showIf logic — none of that is Gemini's business).
 *
 * If constants/subcategories.ts ever changes its ids or the identity field a
 * subcategory carries, this must change too — there is no automated check
 * for that, the same tradeoff categories.ts already accepts.
 *
 * This file exists to answer exactly two questions for categorize.ts:
 *   1. What subcategory ids are even valid for a given category? (used to
 *      REJECT anything Gemini invents — it must pick from this list or
 *      answer null, never propose a new one)
 *   2. For a given category+subcategory, is there a single "identity" field
 *      worth asking about — the one piece of the subcategory's full field
 *      set that (a) is actually derivable from a bank descriptor and (b) is
 *      the field that makes the subcategory specific (which airline, which
 *      restaurant) rather than incidental (a pick-up date, an airport code
 *      nobody's descriptor prints). Fields like flight's `from`/`to`/`when`
 *      or car-rental's `pickup_location` are real fields in the full UI but
 *      not something a merchant string like "FRONTIER AI TJW9NQ" reveals —
 *      asking Gemini for them would just manufacture guesses, so they're
 *      left out entirely rather than asked about and discarded.
 */

import type { CategoryId } from './categories';

export interface SubcategoryOption {
  id: string;
  label: string;
}

/** Empty array = this category has no subcategory list; Gemini must answer null. */
export const SUBCATEGORIES: Record<CategoryId, SubcategoryOption[]> = {
  transport: [
    { id: 'cab', label: 'Cab' },
    { id: 'lime', label: 'Lime' },
    { id: 'flight', label: 'Flight' },
    { id: 'car-rental', label: 'Car Rental' },
    { id: 'cruise', label: 'Cruise' },
    { id: 'train', label: 'Train' },
    { id: 'other', label: 'Other' },
  ],
  home: [
    { id: 'rent', label: 'Rent' },
    { id: 'internet', label: 'Internet' },
    { id: 'utility', label: 'Utility' },
    { id: 'electricity', label: 'Electricity' },
    { id: 'other', label: 'Other' },
  ],
  food: [
    { id: 'uber-eats', label: 'Uber Eats' },
    { id: 'doordash', label: 'DoorDash' },
    { id: 'dining', label: 'Dining' },
    { id: 'office-lunch', label: 'Office Lunch' },
    { id: 'other', label: 'Other' },
  ],
  entertainment: [
    { id: 'concert', label: 'Concert' },
    { id: 'movies', label: 'Movies' },
    { id: 'theater', label: 'Theater' },
    { id: 'arcade', label: 'Arcade' },
    { id: 'other', label: 'Other' },
  ],
  shopping: [
    { id: 'amazon', label: 'Amazon' },
    { id: 'in-store', label: 'In-Store' },
    { id: 'other', label: 'Other' },
  ],
  tech: [
    { id: 'gpt', label: 'GPT' },
    { id: 'others', label: 'Others' },
  ],
  fitness: [
    { id: 'protein-powder', label: 'Protein Powder' },
    { id: 'gym-membership', label: 'Gym Membership' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'other', label: 'Other' },
  ],
  investment: [
    { id: '401k', label: '401k' },
    { id: 'etf', label: 'ETF' },
    { id: 'hysa', label: 'HYSA' },
    { id: 'other', label: 'Other' },
  ],
  subscriptions: [
    { id: 'ai', label: 'AI' },
    { id: 'dev', label: 'Dev' },
    { id: 'food', label: 'Food' },
    { id: 'app', label: 'App' },
    { id: 'fitness', label: 'Fitness' },
    { id: 'sports', label: 'Sports' },
    { id: 'outdoor', label: 'Outdoor' },
    { id: 'other', label: 'Other' },
  ],
  bills: [],
  health: [],
  groceries: [],   // takes a category-level field instead — see GROCERIES_DETAIL_FIELD below
  trip: [],
  transfer: [],
  other: [],
};

/** Just the ids, for validating a Gemini answer against — see categorize.ts. */
export const SUBCATEGORY_IDS: Record<CategoryId, string[]> = Object.fromEntries(
  (Object.entries(SUBCATEGORIES) as [CategoryId, SubcategoryOption[]][]).map(([cat, subs]) => [cat, subs.map((s) => s.id)]),
) as Record<CategoryId, string[]>;

export interface IdentityField {
  /** Matches a DetailField `key` in constants/subcategories.ts, so this writes into the same expense.details shape the manual-entry form reads. */
  key: string;
  /** Present only for a fixed-choice field (constants/subcategories.ts's 'chips' type) — Gemini's answer is REJECTED, not coerced, if it's not exactly one of these. */
  options?: string[];
}

/** Keyed `${category}:${subcategory}`. Absent = nothing worth asking Gemini about for this subcategory. */
export const IDENTITY_FIELD: Record<string, IdentityField> = {
  'transport:flight': { key: 'airline' },
  'transport:cab': { key: 'provider', options: ['Lyft', 'Uber'] },
  'transport:car-rental': { key: 'company', options: ['Avis', 'Budget', 'Alamo', 'Enterprise', 'National', 'Hertz', 'Dollar', 'Thrifty', 'Fox'] },
  'transport:train': { key: 'train_name' },
  'food:uber-eats': { key: 'restaurant' },
  'food:doordash': { key: 'restaurant' },
  'food:dining': { key: 'restaurant' },
  'food:office-lunch': { key: 'restaurant' },
  'shopping:in-store': { key: 'store' },
};

/**
 * groceries has no subcategory list at all — constants/subcategories.ts
 * gives it a category-level field instead (CategoryDetailFields.groceries).
 * `options` here is the seed list, not an exhaustive enum — the real field
 * type is 'store' (free entry with suggestions), so an unlisted real store
 * name is accepted, just not fabricated when there's no signal for one.
 */
export const GROCERIES_DETAIL_FIELD: IdentityField = {
  key: 'store',
  options: ['Safeway', "Trader Joe's", 'HMart', 'Indian'],
};
