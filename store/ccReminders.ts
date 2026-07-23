import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { CreditCard } from './useCreditCards';
import { nextDueDate, daysUntil, toDateStr, dueLabel } from '@/lib/billing';

// Show notifications even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

// Settled = { [cardId]: 'YYYY-MM-DD' } — the due date the user marked handled.
// Kept on-device (a reminder-dismissal concern), keyed per user.
const settledKey = (userId: string) => `@spendee_cc_settled_${userId}`;

export async function getSettled(userId: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(settledKey(userId));
  return raw ? JSON.parse(raw) : {};
}

export async function settleCardCycle(userId: string, cardId: string, dueStr: string): Promise<void> {
  const s = await getSettled(userId);
  s[cardId] = dueStr;
  await AsyncStorage.setItem(settledKey(userId), JSON.stringify(s));
}

export interface DueReminder {
  card: CreditCard;
  due: Date;
  days: number;   // whole days until due (0 = today)
  dueStr: string; // YYYY-MM-DD
}

// Cards whose payment is within 7 days and not already settled for this cycle.
export function computeDueReminders(
  cards: CreditCard[],
  settled: Record<string, string>,
  from: Date = new Date(),
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const c of cards) {
    if (c.billingDay == null) continue;
    const due = nextDueDate(c.billingDay, from);
    const days = daysUntil(due, from);
    const dueStr = toDateStr(due);
    if (days >= 0 && days <= 7 && settled[c.id] !== dueStr) {
      out.push({ card: c, due, days, dueStr });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

async function ensurePermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: asked } = await Notifications.requestPermissionsAsync();
  return asked === 'granted';
}

// Reschedule all card reminders. For each card with a billing day that isn't
// settled for its current cycle, schedule one notification per day for the 7
// days before the due date (and on the due day) at 10:00 local. Only future
// times are scheduled. Called on app launch and whenever billing days change,
// so the next cycle stays scheduled without a server.
export async function rescheduleCardReminders(userId: string, cards: CreditCard[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const withBilling = cards.filter((c) => c.billingDay != null);
  if (withBilling.length === 0) return;
  if (!(await ensurePermission())) return;

  const settled = await getSettled(userId);
  const now = new Date();

  for (const c of withBilling) {
    const due = nextDueDate(c.billingDay!, now);
    if (settled[c.id] === toDateStr(due)) continue; // handled this cycle

    for (let offset = 7; offset >= 0; offset--) {
      const fire = new Date(due);
      fire.setDate(due.getDate() - offset);
      fire.setHours(10, 0, 0, 0);
      if (fire.getTime() <= now.getTime()) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${c.name} payment ${dueLabel(offset)}`,
          body: `Last date to pay is ${due.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
      });
    }
  }
}
