// Formatting for a signed expense amount.
//
// An expense.amount is usually positive (money spent) but can be negative —
// a refund logged directly, or a statement row Chase itself prints as a
// negative amount reversing an earlier charge (see lib/statement/reviewRows.ts).
// Every screen that renders an expense amount needs the same sign→prefix→color
// mapping, so it lives here once rather than six times with a hardcoded '-$'.

import { Colors } from '@/constants/theme';

/** '-$45.00' for a normal expense, '+$20.00' for a refund (amount < 0). */
export function formatSignedAmount(amount: number): string {
  const sign = amount < 0 ? '+' : '-';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

/** Danger (spend) for a positive amount, primary/mint (money back) for a refund. */
export function signedAmountColor(amount: number): string {
  return amount < 0 ? Colors.primary : Colors.danger;
}
