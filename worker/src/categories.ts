/**
 * Mirrors constants/theme.ts's `Categories` in the app repo. Worker code
 * doesn't share a build with the Expo app, so this is a deliberate, narrow
 * duplication rather than a cross-package import — id + label is all a
 * categorization prompt needs, and it's the app's Categories array the
 * response has to line up with, so if that array ever changes, this must too.
 */
export const CATEGORY_IDS = [
  'food', 'transport', 'shopping', 'bills', 'home', 'entertainment', 'health',
  'groceries', 'tech', 'subscriptions', 'trip', 'transfer', 'fitness',
  'investment', 'other',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  food: 'Food & Drink',
  transport: 'Transport',
  shopping: 'Shopping',
  bills: 'Bills',
  home: 'Home',
  entertainment: 'Entertainment',
  health: 'Health',
  groceries: 'Groceries',
  tech: 'Tech',
  subscriptions: 'Subscriptions',
  trip: 'Trip',
  transfer: 'Transfer',
  fitness: 'Fitness',
  investment: 'Investment',
  other: 'Other',
};

export function isCategoryId(s: unknown): s is CategoryId {
  return typeof s === 'string' && (CATEGORY_IDS as readonly string[]).includes(s);
}
