// Credit-card payment due-date math. `billingDay` is a day-of-month (1–31);
// the next due date is that day in the current month if it hasn't passed,
// otherwise next month — clamped to the month's length (e.g. 31 → Feb 28).

export function clampDayToMonth(day: number, year: number, month: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

export function nextDueDate(billingDay: number, from: Date = new Date()): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const today = from.getDate();
  const thisMonth = clampDayToMonth(billingDay, y, m);
  if (today <= thisMonth) return new Date(y, m, thisMonth);
  const nm = m + 1;
  const ny = y + Math.floor(nm / 12);
  const nmm = ((nm % 12) + 12) % 12;
  return new Date(ny, nmm, clampDayToMonth(billingDay, ny, nmm));
}

// Whole calendar days from `from` to `date` (0 = due today, negative = past).
export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dueLabel(days: number): string {
  if (days <= 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}
