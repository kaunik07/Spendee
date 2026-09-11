// Pure stat computation for a topic — no hooks, no I/O. Every screen that
// shows a topic's numbers (the list page's card, the detail page's total +
// breakdown, the list page's "Tracked This Year" stat) calls these same
// functions rather than three slightly different inline reduces.
import type { Expense } from '@/store/useExpenses';
import type { TopicExpenseMembership } from '@/store/useTopicExpenses';

export interface CategoryBreakdownEntry {
  catId: string;
  amount: number;
  pct: number; // 0-100
}

/** The actual Expense rows tagged into this topic, in the order they appear in `expenses`. */
export function expensesForTopic(
  topicId: string,
  memberships: TopicExpenseMembership[],
  expenses: Expense[],
): Expense[] {
  const ids = new Set(memberships.filter((m) => m.topicId === topicId).map((m) => m.expenseId));
  return expenses.filter((e) => ids.has(e.id));
}

/** Signed sum — a refund tagged into a topic reduces its total, same as everywhere else in the app. */
export function topicTotal(topicExpenses: Expense[]): number {
  return topicExpenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Sorted descending by amount. Only categories actually present — never a zero-amount entry. */
export function categoryBreakdown(topicExpenses: Expense[]): CategoryBreakdownEntry[] {
  const byCat = new Map<string, number>();
  for (const e of topicExpenses) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  }
  const total = topicExpenses.reduce((s, e) => s + e.amount, 0);
  return [...byCat.entries()]
    .map(([catId, amount]) => ({ catId, amount, pct: total !== 0 ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** How many topics (other than `excludeTopicId`, if given) this expense already belongs to. */
export function topicCountForExpense(
  expenseId: string,
  memberships: TopicExpenseMembership[],
  excludeTopicId?: string,
): number {
  return memberships.filter((m) => m.expenseId === expenseId && m.topicId !== excludeTopicId).length;
}
