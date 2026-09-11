# Expense Topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user group existing expenses under a named topic (e.g. "Trip
to New York") and see that topic's total spend plus a category breakdown,
independent of the expenses' own individual categories.

**Architecture:** Two new Supabase tables (`topics`, and a many-to-many join
`topic_expenses`), following every existing table's RLS/realtime/sync-queue
conventions exactly — no new RPC, no SECURITY DEFINER function, because
there's no balance to move and no cross-table invariant to protect
transactionally. Two new store hooks (`useTopics`, `useTopicExpenses`)
structured like the existing `useBudgets.ts`. Two new web-only routes
(`/topics` list, `/topics/[id]` detail) plus native stub routes, following
`app/account/[id].web.tsx` and `app/import-statement.tsx`'s exact
precedents. Totals and category breakdowns are computed client-side by
cross-referencing the join table against the already-loaded `expenses`
array — the same pattern `budget.web.tsx` and `summary.web.tsx` already use,
not a new aggregation approach.

**Tech Stack:** Expo Router (file-based routing), React Native Web,
Supabase (Postgres + RLS + Realtime), TypeScript, existing
`store/syncQueue.ts` offline-write queue, `react-native-svg`-based
`WebDonutChart` (already built, reused as-is).

## Global Constraints

- No test framework exists in this codebase (`package.json` has no `test`
  script; grep for `*.test.ts(x)`/`*.spec.ts(x)` returns nothing). Every
  existing feature (statement import, refunds) was verified via
  `npx tsc --noEmit` + manual browser verification, not automated tests.
  This plan follows that same convention — every task ends with a
  typecheck step and a concrete manual-verification step, not a unit test.
- Every new Supabase table gets `ENABLE ROW LEVEL SECURITY` +
  `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`,
  copied verbatim from the pattern in
  `supabase/migrations/20260721000000_initial_schema.sql:159-180`.
- Every new table is added to `supabase_realtime` (same migration,
  line 185-188 pattern) so realtime subscriptions work like every other
  store.
- Web-only feature. Native gets stub routes only (`app/topics.tsx`,
  `app/topics/[id].tsx`), copying `app/import-statement.tsx`'s exact
  "available on the web app" layout.
- All money values render via `lib/money.ts`'s `formatSignedAmount` /
  `signedAmountColor` — never a hand-rolled `-$${amount.toFixed(2)}`.
- All new provider contexts register in `app/_layout.tsx` following
  `BudgetsProvider`'s exact nesting/shape (`store/BudgetsContext.tsx`).
- Migration file naming: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`,
  next available timestamp after the existing latest
  (`20260814000200_import_refunds.sql`) is `20260911000000_expense_topics.sql`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260911000000_expense_topics.sql` | `topics` + `topic_expenses` tables, RLS, realtime, indexes |
| `store/useTopics.ts` | CRUD hook for `topics` (create/update/archive/delete) |
| `store/TopicsContext.tsx` | Provider + `useTopicsContext()` |
| `store/useTopicExpenses.ts` | CRUD hook for `topic_expenses` memberships |
| `store/TopicExpensesContext.tsx` | Provider + `useTopicExpensesContext()` |
| `lib/topicStats.ts` | Pure functions: total spend, category breakdown, active/archived counts — computed from `Expense[]` + membership rows, unit-testable in isolation even though nothing else in this repo has unit tests (kept pure specifically so it CAN be tested later without a rewrite) |
| `components/web/WebModal.web.tsx` | New centered-modal chrome (sibling to `WebDrawer.tsx`) |
| `components/web/NewTopicDrawer.web.tsx` | Create-topic form (name/note/icon/target/date range) |
| `components/web/EditTopicDrawer.web.tsx` | Edit-topic form, same fields, sibling to `EditExpenseDrawer.tsx`'s pattern |
| `components/web/AddExpensesToTopicModal.web.tsx` | Search/filter/checklist picker, rendered inside `WebModal` |
| `components/web/TopicCard.web.tsx` | One topic card (list page + reused nowhere else, but split out since `topics.web.tsx` would otherwise exceed ~300 lines) |
| `app/topics.web.tsx` | Topics list page |
| `app/topics/[id].web.tsx` | Topic detail page |
| `app/topics.tsx` | Native stub |
| `app/topics/[id].tsx` | Native stub |
| `app/_layout.tsx` | Modify: add `TopicsProvider`/`TopicExpensesProvider`, register 2 new `Stack.Screen` |
| `components/web/WebSidebar.tsx` | Modify: add Topics nav item |
| `app/(tabs)/expenses.web.tsx` | Modify: add select-mode toggle, bulk action bar |

---

### Task 1: Database schema

**Files:**
- Create: `supabase/migrations/20260911000000_expense_topics.sql`

**Interfaces:**
- Produces: tables `public.topics` (columns: `id, user_id, name, note, icon,
  target_amount, date_start, date_end, archived, created_at`) and
  `public.topic_expenses` (columns: `id, topic_id, expense_id, user_id,
  created_at`, unique on `(topic_id, expense_id)`).

- [ ] **Step 1: Write the migration file**

```sql
-- Expense Topics — group existing expenses under a user-created label
-- ("Trip to New York", "Moving Cost") to see total spend and a category
-- breakdown for that group, independent of each expense's own category.
--
-- A topic is purely a many-to-many TAG over expenses that already exist —
-- nothing about how an expense is entered, categorized, or synced changes.
-- No new RPC: every write here is a plain insert/update/delete through the
-- existing generic store/syncQueue.ts op types (see that file's `apply()`),
-- because there's no balance to move and no cross-table invariant to
-- protect transactionally — unlike import_statement_expenses, which needed
-- SECURITY DEFINER specifically because it also moves an account/card
-- balance in the same transaction as the expense insert.

CREATE TABLE IF NOT EXISTS public.topics (
  id            UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          TEXT           NOT NULL,
  note          TEXT           NOT NULL DEFAULT '',
  icon          TEXT           NOT NULL DEFAULT '🗂️',   -- a single emoji, free text
  target_amount NUMERIC(12, 2) DEFAULT NULL,
  date_start    TEXT           DEFAULT NULL,             -- YYYY-MM-DD, display context only
  date_end      TEXT           DEFAULT NULL,
  archived      BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at    BIGINT         NOT NULL
);

-- Many-to-many: one expense can belong to multiple topics, one topic holds
-- many expenses. ON DELETE CASCADE on BOTH foreign keys is load-bearing —
-- deleting an expense anywhere else in the app (the existing delete flow in
-- useExpenses.ts is completely unmodified) automatically drops its
-- topic_expenses rows with no app-side cleanup code, and deleting a topic
-- drops its memberships the same way. Cascade only flows from the deleted
-- row's own FK direction: deleting an expense never deletes a topic, and
-- vice versa.
CREATE TABLE IF NOT EXISTS public.topic_expenses (
  id         UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id   UUID   REFERENCES public.topics(id)   ON DELETE CASCADE NOT NULL,
  expense_id UUID   REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID   REFERENCES auth.users(id)       ON DELETE CASCADE NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (topic_id, expense_id)
);

-- ── Row Level Security ────────────────────────────────────
ALTER TABLE public.topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_expenses  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics_own" ON public.topics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "topic_expenses_own" ON public.topic_expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Realtime ──────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.topics, public.topic_expenses;

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_topics_user            ON public.topics(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_expenses_topic    ON public.topic_expenses(topic_id);
-- Used by the "in N topics" tag on the Add-Expenses picker — a lookup FROM
-- an expense id TO the topics it already belongs to, the opposite direction
-- of the topic-detail page's own lookup (which goes through idx above).
CREATE INDEX IF NOT EXISTS idx_topic_expenses_expense  ON public.topic_expenses(expense_id);
```

- [ ] **Step 2: Push the migration**

Run: `supabase db push`
Expected: prompts to apply `20260911000000_expense_topics.sql`, confirm
with `y`. Output ends with "Finished supabase db push."

- [ ] **Step 3: Verify RLS is actually enforced**

Run:
```bash
supabase db query --linked "select tablename, rowsecurity from pg_tables where tablename in ('topics','topic_expenses');" -o table
```
Expected: both rows show `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260911000000_expense_topics.sql
git commit -m "(feature) supabase: topics and topic_expenses tables

Group existing expenses under a user-created topic (trip, project,
event) to see total spend and a category breakdown independent of
each expense's own category. Many-to-many via topic_expenses, both
FKs ON DELETE CASCADE so deleting an expense or a topic cleans up
memberships with no app-side code. No new RPC — every write here
goes through the existing generic sync-queue op types.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `useTopics` store hook + provider

**Files:**
- Create: `store/useTopics.ts`
- Create: `store/TopicsContext.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `store/AuthContext.tsx`'s `useAuthContext()` → `{ user, storageMode }`; `store/syncQueue.ts`'s `getQueue, enqueue, opId, flushAndNotify, materializeRows`; `store/syncBus.ts`'s `subscribeSync`.
- Produces:
  ```ts
  export interface Topic {
    id: string;
    name: string;
    note: string;
    icon: string;
    targetAmount: number | null;
    dateStart: string | null;
    dateEnd: string | null;
    archived: boolean;
    createdAt: number;
  }
  export function useTopics(userId: string | null, storageMode: StorageMode | null): {
    topics: Topic[];
    loading: boolean;
    refresh: () => void;
    createTopic: (input: Omit<Topic, 'id' | 'createdAt' | 'archived'> & { archived?: boolean }) => Promise<Topic>;
    updateTopic: (id: string, updates: Partial<Omit<Topic, 'id' | 'createdAt'>>) => Promise<void>;
    deleteTopic: (id: string) => Promise<void>;
  }
  ```
  `store/TopicsContext.tsx` exports `TopicsProvider` and
  `useTopicsContext(): ReturnType<typeof useTopics>`.

- [ ] **Step 1: Write `store/useTopics.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, enqueue, opId, flushAndNotify, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface Topic {
  id: string;
  name: string;
  note: string;
  icon: string;
  targetAmount: number | null;
  dateStart: string | null;
  dateEnd: string | null;
  archived: boolean;
  createdAt: number;
}

function rowToTopic(row: any): Topic {
  return {
    id:           row.id,
    name:         row.name,
    note:         row.note ?? '',
    icon:         row.icon ?? '🗂️',
    targetAmount: row.target_amount !== null && row.target_amount !== undefined ? Number(row.target_amount) : null,
    dateStart:    row.date_start ?? null,
    dateEnd:      row.date_end ?? null,
    archived:     row.archived ?? false,
    createdAt:    row.created_at,
  };
}

function topicToRow(t: Topic, userId: string): Record<string, any> {
  return {
    id: t.id,
    user_id: userId,
    name: t.name,
    note: t.note,
    icon: t.icon,
    target_amount: t.targetAmount,
    date_start: t.dateStart,
    date_end: t.dateEnd,
    archived: t.archived,
    created_at: t.createdAt,
  };
}

export function useTopics(userId: string | null, storageMode: StorageMode | null) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_topics_${userId}`;
  const cacheKey = `@spendee_topics_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`topics_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setTopics([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setTopics(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      Promise.all([
        supabase.from('topics').select('*').order('created_at', { ascending: true }),
        getQueue(userId),
      ]).then(async ([res, ops]) => {
        let rows: any[];
        if (res.error) {
          const cached = await AsyncStorage.getItem(cacheKey);
          rows = cached ? JSON.parse(cached) : [];
        } else {
          rows = res.data ?? [];
          await AsyncStorage.setItem(cacheKey, JSON.stringify(rows));
        }
        setTopics(materializeRows(rows, ops, 'topics').map(rowToTopic));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const createTopic = useCallback(async (
    input: Omit<Topic, 'id' | 'createdAt' | 'archived'> & { archived?: boolean },
  ): Promise<Topic> => {
    const topic: Topic = { ...input, archived: input.archived ?? false, id: Crypto.randomUUID(), createdAt: Date.now() };

    if (storageMode === 'local') {
      const updated = [...topics, topic];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTopics(updated);
    } else {
      const row = topicToRow(topic, userId!);
      await enqueue(userId!, { id: opId(), kind: 'insert', table: 'topics', row });
      setTopics((prev) => [...prev, topic]);
      flushAndNotify(userId!);
    }
    return topic;
  }, [userId, storageMode, topics, localKey]);

  const updateTopic = useCallback(async (id: string, updates: Partial<Omit<Topic, 'id' | 'createdAt'>>) => {
    const existing = topics.find((t) => t.id === id);
    if (!existing) return;
    const updated: Topic = { ...existing, ...updates };

    if (storageMode === 'local') {
      const next = topics.map((t) => (t.id === id ? updated : t));
      await AsyncStorage.setItem(localKey, JSON.stringify(next));
      setTopics(next);
    } else {
      const row = topicToRow(updated, userId!);
      await enqueue(userId!, { id: opId(), kind: 'update', table: 'topics', rowId: id, row });
      setTopics((prev) => prev.map((t) => (t.id === id ? updated : t)));
      flushAndNotify(userId!);
    }
  }, [userId, storageMode, topics, localKey]);

  const deleteTopic = useCallback(async (id: string) => {
    if (storageMode === 'local') {
      const updated = topics.filter((t) => t.id !== id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setTopics(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'topics', rowId: id });
      setTopics((prev) => prev.filter((t) => t.id !== id));
      flushAndNotify(userId!);
    }
  }, [storageMode, topics, localKey, userId]);

  return { topics, loading, refresh, createTopic, updateTopic, deleteTopic };
}
```

- [ ] **Step 2: Write `store/TopicsContext.tsx`**

```tsx
import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useTopics } from './useTopics';

type TopicsContextType = ReturnType<typeof useTopics>;

const TopicsContext = createContext<TopicsContextType | null>(null);

export function TopicsProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useTopics(user?.id ?? null, storageMode);
  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>;
}

export function useTopicsContext() {
  const ctx = useContext(TopicsContext);
  if (!ctx) throw new Error('useTopicsContext must be used within TopicsProvider');
  return ctx;
}
```

- [ ] **Step 3: Wire `TopicsProvider` into `app/_layout.tsx`**

Modify `app/_layout.tsx`. Add the import near the other provider imports
(after `import { BudgetsProvider } from '@/store/BudgetsContext';`):

```tsx
import { TopicsProvider } from '@/store/TopicsContext';
```

Then wrap it into the provider tree — find this block:

```tsx
            <BudgetsProvider>
              <AuthGuard>
```

and change it to:

```tsx
            <BudgetsProvider>
            <TopicsProvider>
              <AuthGuard>
```

and find its matching closer:

```tsx
              </AuthGuard>
            </BudgetsProvider>
```

and change it to:

```tsx
              </AuthGuard>
            </TopicsProvider>
            </BudgetsProvider>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run web`, sign in on the web app. No visible change yet (nothing
consumes `useTopicsContext` yet) — this step just confirms the app still
boots and the new provider doesn't throw. Check the browser console for
errors; there should be none.

- [ ] **Step 6: Commit**

```bash
git add store/useTopics.ts store/TopicsContext.tsx app/_layout.tsx
git commit -m "(feature) topics: useTopics store hook and provider

Mirrors useBudgets.ts's exact shape (full-table fetch, realtime
subscription, syncQueue-backed writes). No screen consumes this yet.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `useTopicExpenses` store hook + provider

**Files:**
- Create: `store/useTopicExpenses.ts`
- Create: `store/TopicExpensesContext.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: same as Task 2 (`useAuthContext`, `syncQueue.ts`, `syncBus.ts`).
- Produces:
  ```ts
  export interface TopicExpenseMembership {
    id: string;
    topicId: string;
    expenseId: string;
    createdAt: number;
  }
  export function useTopicExpenses(userId: string | null, storageMode: StorageMode | null): {
    memberships: TopicExpenseMembership[];
    loading: boolean;
    refresh: () => void;
    addExpensesToTopic: (topicId: string, expenseIds: string[]) => Promise<void>;
    removeExpenseFromTopic: (topicId: string, expenseId: string) => Promise<void>;
  }
  ```
  `store/TopicExpensesContext.tsx` exports `TopicExpensesProvider` and
  `useTopicExpensesContext()`.

- [ ] **Step 1: Write `store/useTopicExpenses.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StorageMode } from './storageMode';
import { getQueue, enqueue, opId, flushAndNotify, materializeRows } from './syncQueue';
import { subscribeSync } from './syncBus';

export interface TopicExpenseMembership {
  id: string;
  topicId: string;
  expenseId: string;
  createdAt: number;
}

function rowToMembership(row: any): TopicExpenseMembership {
  return {
    id:        row.id,
    topicId:   row.topic_id,
    expenseId: row.expense_id,
    createdAt: row.created_at,
  };
}

// Fetches the WHOLE table for the user (a few rows per expense at most —
// small), not scoped to one topic. This is deliberate: one subscription
// serves both the topic detail page (filter client-side by topicId) and the
// Expenses-list / Add-Expenses picker (filter client-side by expenseId, for
// the "already in N topics" tag) without two separate fetches or two
// separate realtime channels.
export function useTopicExpenses(userId: string | null, storageMode: StorageMode | null) {
  const [memberships, setMemberships] = useState<TopicExpenseMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const localKey = `@spendee_topic_expenses_${userId}`;
  const cacheKey = `@spendee_topic_expenses_cache_${userId}`;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (storageMode !== 'online' || !userId) return;
    const channel = supabase
      .channel(`topic_expenses_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_expenses', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, storageMode, refresh]);

  useEffect(() => subscribeSync(refresh), [refresh]);

  useEffect(() => { setMemberships([]); }, [userId, storageMode]);

  useEffect(() => {
    if (!userId || !storageMode) { setLoading(false); return; }
    setLoading(true);

    if (storageMode === 'local') {
      AsyncStorage.getItem(localKey).then((raw) => {
        if (raw) setMemberships(JSON.parse(raw));
        setLoading(false);
      });
    } else {
      Promise.all([
        supabase.from('topic_expenses').select('*'),
        getQueue(userId),
      ]).then(async ([res, ops]) => {
        let rows: any[];
        if (res.error) {
          const cached = await AsyncStorage.getItem(cacheKey);
          rows = cached ? JSON.parse(cached) : [];
        } else {
          rows = res.data ?? [];
          await AsyncStorage.setItem(cacheKey, JSON.stringify(rows));
        }
        setMemberships(materializeRows(rows, ops, 'topic_expenses').map(rowToMembership));
        setLoading(false);
      });
    }
  }, [userId, storageMode, refreshKey]);

  const addExpensesToTopic = useCallback(async (topicId: string, expenseIds: string[]) => {
    if (expenseIds.length === 0) return;
    const now = Date.now();
    const newRows: TopicExpenseMembership[] = expenseIds.map((expenseId, i) => ({
      id: Crypto.randomUUID(),
      topicId,
      expenseId,
      createdAt: now + i,
    }));

    if (storageMode === 'local') {
      const updated = [...memberships, ...newRows];
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setMemberships(updated);
    } else {
      const ops = newRows.map((m) => ({
        id: opId(),
        kind: 'insert' as const,
        table: 'topic_expenses',
        row: { id: m.id, user_id: userId!, topic_id: m.topicId, expense_id: m.expenseId, created_at: m.createdAt },
      }));
      await enqueue(userId!, ...ops);
      setMemberships((prev) => [...prev, ...newRows]);
      flushAndNotify(userId!);
    }
  }, [userId, storageMode, memberships, localKey]);

  const removeExpenseFromTopic = useCallback(async (topicId: string, expenseId: string) => {
    const row = memberships.find((m) => m.topicId === topicId && m.expenseId === expenseId);
    if (!row) return;

    if (storageMode === 'local') {
      const updated = memberships.filter((m) => m.id !== row.id);
      await AsyncStorage.setItem(localKey, JSON.stringify(updated));
      setMemberships(updated);
    } else {
      await enqueue(userId!, { id: opId(), kind: 'delete', table: 'topic_expenses', rowId: row.id });
      setMemberships((prev) => prev.filter((m) => m.id !== row.id));
      flushAndNotify(userId!);
    }
  }, [storageMode, memberships, localKey, userId]);

  return { memberships, loading, refresh, addExpensesToTopic, removeExpenseFromTopic };
}
```

- [ ] **Step 2: Write `store/TopicExpensesContext.tsx`**

```tsx
import React, { createContext, useContext } from 'react';
import { useAuthContext } from './AuthContext';
import { useTopicExpenses } from './useTopicExpenses';

type TopicExpensesContextType = ReturnType<typeof useTopicExpenses>;

const TopicExpensesContext = createContext<TopicExpensesContextType | null>(null);

export function TopicExpensesProvider({ children }: { children: React.ReactNode }) {
  const { user, storageMode } = useAuthContext();
  const value = useTopicExpenses(user?.id ?? null, storageMode);
  return <TopicExpensesContext.Provider value={value}>{children}</TopicExpensesContext.Provider>;
}

export function useTopicExpensesContext() {
  const ctx = useContext(TopicExpensesContext);
  if (!ctx) throw new Error('useTopicExpensesContext must be used within TopicExpensesProvider');
  return ctx;
}
```

- [ ] **Step 3: Wire `TopicExpensesProvider` into `app/_layout.tsx`**

Modify `app/_layout.tsx`. Add the import next to the `TopicsProvider` import:

```tsx
import { TopicExpensesProvider } from '@/store/TopicExpensesContext';
```

Nest it inside `TopicsProvider` (so both are available together but
`TopicExpensesProvider` only needs to be added once at this level) — change:

```tsx
            <BudgetsProvider>
            <TopicsProvider>
              <AuthGuard>
```

to:

```tsx
            <BudgetsProvider>
            <TopicsProvider>
            <TopicExpensesProvider>
              <AuthGuard>
```

and its closer:

```tsx
              </AuthGuard>
            </TopicsProvider>
            </BudgetsProvider>
```

to:

```tsx
              </AuthGuard>
            </TopicExpensesProvider>
            </TopicsProvider>
            </BudgetsProvider>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run web`, sign in. App should still boot with no console errors.

- [ ] **Step 6: Commit**

```bash
git add store/useTopicExpenses.ts store/TopicExpensesContext.tsx app/_layout.tsx
git commit -m "(feature) topics: useTopicExpenses store hook and provider

Many-to-many membership rows between topics and expenses. Fetches the
whole table per user (small) so both the topic detail page and the
Add-Expenses picker's 'in N topics' tag share one subscription.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `lib/topicStats.ts` — pure stat computation

**Files:**
- Create: `lib/topicStats.ts`

**Interfaces:**
- Consumes: `Expense` from `store/useExpenses.ts`, `TopicExpenseMembership` from `store/useTopicExpenses.ts`, `Topic` from `store/useTopics.ts`.
- Produces:
  ```ts
  export interface CategoryBreakdownEntry { catId: string; amount: number; pct: number }
  export function expensesForTopic(topicId: string, memberships: TopicExpenseMembership[], expenses: Expense[]): Expense[]
  export function topicTotal(topicExpenses: Expense[]): number
  export function categoryBreakdown(topicExpenses: Expense[]): CategoryBreakdownEntry[]  // sorted desc by amount
  export function topicCountForExpense(expenseId: string, memberships: TopicExpenseMembership[], excludeTopicId?: string): number
  ```

This file is kept pure (no hooks, no I/O) specifically so every screen that
needs a topic's numbers computes them identically — the list page's card,
the detail page's total/breakdown, and the "Tracked This Year" stat all
call the same three functions instead of three slightly-different inline
`reduce`s.

- [ ] **Step 1: Write `lib/topicStats.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

No UI consumes this yet — verification is that it typechecks and the
function signatures match what Tasks 6-8 will import. Re-read the file once
against this task's Interfaces block to confirm names match exactly
(`expensesForTopic`, `topicTotal`, `categoryBreakdown`,
`topicCountForExpense`) — later tasks import these by name.

- [ ] **Step 4: Commit**

```bash
git add lib/topicStats.ts
git commit -m "(feature) topics: pure stat computation (total, category breakdown)

No hooks/IO — every screen that needs a topic's numbers calls these
same functions instead of three slightly different inline reduces.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `WebModal.web.tsx` — centered modal chrome

**Files:**
- Create: `components/web/WebModal.web.tsx`

**Interfaces:**
- Produces:
  ```tsx
  interface WebModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    /** Fixed pixel width — callers size their own content, no default assumed to fit everything. */
    width?: number;
  }
  export default function WebModal(props: WebModalProps): JSX.Element | null;
  ```

This is a new sibling to the existing `components/web/WebDrawer.tsx`, same
`Modal` + overlay-`Pressable`-to-dismiss structure, but centered with a
fixed max-height and its own scroll region, since the Add-Expenses picker
(a search-and-pick task over potentially hundreds of rows) reads better
centered than docked to an edge — this was the approved mockup's layout.

- [ ] **Step 1: Write `components/web/WebModal.web.tsx`**

```tsx
// Centered modal — the web replacement for a full-screen dialog, sibling to
// WebDrawer.tsx (which docks right, for forms). This one centers and gives
// its content a fixed max-height with its own scroll region, which reads
// better for a search-and-pick task over many rows (see
// AddExpensesToTopicModal.web.tsx) than a right-docked drawer would.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: number;
}

export default function WebModal({ visible, onClose, title, subtitle, children, width = 560 }: Props) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.modal, { width }]} onPress={() => {}}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    maxWidth: '92%',
    maxHeight: '80%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: 15.5, fontWeight: '800' },
  subtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 3 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

No caller yet — this is chrome only. Confirms via typecheck that the props
shape matches what Task 8 will pass.

- [ ] **Step 4: Commit**

```bash
git add components/web/WebModal.web.tsx
git commit -m "(feature) web: centered modal chrome, sibling to WebDrawer

New shared chrome for a search-and-pick task (the Add-Expenses picker)
that reads better centered than docked to an edge. Not a one-off —
any future modal-shaped need reuses this instead of duplicating it.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: New Topic drawer

**Files:**
- Create: `components/web/NewTopicDrawer.web.tsx`

**Interfaces:**
- Consumes: `WebDrawer` (`components/web/WebDrawer.tsx`), `WebDatePickerModal` (`components/WebDatePickerModal.tsx`), `useTopicsContext()` → `createTopic`, `useTopicExpensesContext()` → `addExpensesToTopic`.
- Produces:
  ```tsx
  interface NewTopicDrawerProps {
    visible: boolean;
    onClose: () => void;
    /** If set, these expense ids are attached to the topic immediately after creation — the bulk-select "+ New Topic" entry point. */
    preselectedExpenseIds?: string[];
    /** Called with the newly created topic's id after a successful save, so the caller (e.g. the Expenses screen) can navigate or just close. */
    onCreated?: (topicId: string) => void;
  }
  export default function NewTopicDrawer(props: NewTopicDrawerProps): JSX.Element;
  ```

- [ ] **Step 1: Write `components/web/NewTopicDrawer.web.tsx`**

```tsx
// "New Topic" drawer — same right-docked chrome as AddExpenseSheet /
// AddBudgetSheet on web (WebDrawer). Approved via the brainstorming visual
// companion mockup, with one revision from the mockup: instead of a custom
// searchable emoji grid, tapping "+" reveals a plain TextInput — the
// browser/OS's own emoji picker (Cmd+Ctrl+Space on macOS, Win+. on Windows,
// the native keyboard's emoji tab on mobile web) already gives full-unicode
// search for free, so no new dependency or component is needed.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import WebDatePickerModal from '@/components/WebDatePickerModal';
import WebDrawer from '@/components/web/WebDrawer';
import { Colors } from '@/constants/theme';
import { useTopicsContext } from '@/store/TopicsContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';

const QUICK_ICONS = ['🗽', '📦', '🏖️', '💍', '🎓', '🚗', '🏠', '🎉'];

interface Props {
  visible: boolean;
  onClose: () => void;
  preselectedExpenseIds?: string[];
  onCreated?: (topicId: string) => void;
}

export default function NewTopicDrawer({ visible, onClose, preselectedExpenseIds, onCreated }: Props) {
  const { createTopic } = useTopicsContext();
  const { addExpensesToTopic } = useTopicExpensesContext();

  const [icon, setIcon] = useState(QUICK_ICONS[0]);
  const [customIconMode, setCustomIconMode] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [dateStart, setDateStart] = useState<string | null>(null);
  const [dateEnd, setDateEnd] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  const reset = () => {
    setIcon(QUICK_ICONS[0]);
    setCustomIconMode(false);
    setName('');
    setNote('');
    setTargetAmount('');
    setDateStart(null);
    setDateEnd(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const topic = await createTopic({
        name: name.trim(),
        note: note.trim(),
        icon,
        targetAmount: targetAmount.trim() ? parseFloat(targetAmount) : null,
        dateStart,
        dateEnd,
      });
      if (preselectedExpenseIds && preselectedExpenseIds.length > 0) {
        await addExpensesToTopic(topic.id, preselectedExpenseIds);
      }
      onCreated?.(topic.id);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <WebDrawer visible={visible} onClose={handleClose} title="New Topic">
        <Text style={styles.label}>Icon</Text>
        <View style={styles.iconRow}>
          {QUICK_ICONS.map((i) => (
            <Pressable
              key={i}
              style={[styles.iconPick, icon === i && !customIconMode && styles.iconPickSelected]}
              onPress={() => { setIcon(i); setCustomIconMode(false); }}>
              <Text style={styles.iconPickText}>{i}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.iconPick, styles.iconPickCustom, customIconMode && styles.iconPickSelected]}
            onPress={() => setCustomIconMode(true)}>
            <Text style={styles.iconPickCustomText}>+</Text>
          </Pressable>
        </View>
        {customIconMode && (
          <TextInput
            style={styles.customIconInput}
            value={QUICK_ICONS.includes(icon) ? '' : icon}
            onChangeText={(t) => setIcon(t || QUICK_ICONS[0])}
            placeholder="Type or paste any emoji"
            placeholderTextColor={Colors.outline}
            maxLength={4}
            autoFocus
          />
        )}

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="e.g. Trip to New York"
          placeholderTextColor={Colors.outline}
          selectionColor={Colors.primary}
        />

        <Text style={styles.label}>Note <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          placeholder="What's this for?"
          placeholderTextColor={Colors.outline}
          selectionColor={Colors.primary}
        />

        <Text style={styles.label}>Target Budget <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={targetAmount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setTargetAmount(t); }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Colors.outline}
            selectionColor={Colors.primary}
          />
        </View>

        <Text style={styles.label}>Date Range <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.dateRow}>
          <Pressable style={styles.dateInput} onPress={() => setPickingDate('start')}>
            <Text style={dateStart ? styles.dateInputText : styles.dateInputPlaceholder}>{dateStart ?? 'Start date'}</Text>
          </Pressable>
          <Pressable style={styles.dateInput} onPress={() => setPickingDate('end')}>
            <Text style={dateEnd ? styles.dateInputText : styles.dateInputPlaceholder}>{dateEnd ?? 'End date'}</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} onPress={handleSave} disabled={!canSave}>
          <Text style={styles.saveBtnText}>{saving ? 'Creating…' : 'Create Topic'}</Text>
        </Pressable>
      </WebDrawer>

      <WebDatePickerModal
        visible={pickingDate === 'start'}
        date={dateStart ?? new Date().toISOString().split('T')[0]}
        maxDate={dateEnd ?? undefined}
        onSelect={(d) => { setDateStart(d); setPickingDate(null); }}
        onClose={() => setPickingDate(null)}
      />
      <WebDatePickerModal
        visible={pickingDate === 'end'}
        date={dateEnd ?? new Date().toISOString().split('T')[0]}
        onSelect={(d) => { setDateEnd(d); setPickingDate(null); }}
        onClose={() => setPickingDate(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.05, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  optional: { color: Colors.outline, textTransform: 'none', fontWeight: '400' },

  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPick: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  iconPickSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryMuted },
  iconPickText: { fontSize: 17 },
  iconPickCustom: { borderStyle: 'dashed' },
  iconPickCustomText: { color: Colors.outline, fontSize: 16, fontWeight: '700' },
  customIconInput: {
    marginTop: 8, backgroundColor: Colors.surfaceContainer, borderRadius: 11, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, color: Colors.text, fontSize: 18,
  },

  input: { backgroundColor: Colors.surfaceContainer, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },

  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14 },
  currencySymbol: { color: Colors.primary, fontSize: 16, fontWeight: '700', marginRight: 4 },
  amountInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 10 },

  dateRow: { flexDirection: 'row', gap: 10 },
  dateInput: { flex: 1, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dateInputText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  dateInputPlaceholder: { color: Colors.outline, fontSize: 13.5 },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.onPrimary, fontSize: 14.5, fontWeight: '800' },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

No caller yet (Task 9 wires it in). Confirms via typecheck the props match
Task 9's expected usage.

- [ ] **Step 4: Commit**

```bash
git add components/web/NewTopicDrawer.web.tsx
git commit -m "(feature) web: New Topic drawer — name/note/icon/target/date range

Icon entry: 8 quick-pick tiles + a '+' that reveals a plain text input
so the browser/OS's own emoji picker handles full-unicode search —
no new dependency. Supports preselectedExpenseIds for the bulk-select
'+ New Topic' entry point (Task 10).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Edit Topic drawer

**Files:**
- Create: `components/web/EditTopicDrawer.web.tsx`

**Interfaces:**
- Consumes: `WebDrawer`, `WebDatePickerModal`, `useTopicsContext()` → `updateTopic`, `Topic` type from `store/useTopics.ts`.
- Produces:
  ```tsx
  interface EditTopicDrawerProps {
    topic: Topic | null;
    visible: boolean;
    onClose: () => void;
  }
  export default function EditTopicDrawer(props: EditTopicDrawerProps): JSX.Element;
  ```

Near-identical field set to `NewTopicDrawer`, as a separate component —
this follows `EditExpenseDrawer.tsx`'s established precedent (a sibling
component to the Add drawer, not one drawer with an `isEditing` branch).

- [ ] **Step 1: Write `components/web/EditTopicDrawer.web.tsx`**

```tsx
// Edit an existing topic. Sibling to NewTopicDrawer.web.tsx rather than one
// drawer with an isEditing branch — same convention EditExpenseDrawer.tsx
// established for expenses.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import WebDatePickerModal from '@/components/WebDatePickerModal';
import WebDrawer from '@/components/web/WebDrawer';
import { Colors } from '@/constants/theme';
import { useTopicsContext } from '@/store/TopicsContext';
import type { Topic } from '@/store/useTopics';

const QUICK_ICONS = ['🗽', '📦', '🏖️', '💍', '🎓', '🚗', '🏠', '🎉'];

interface Props {
  topic: Topic | null;
  visible: boolean;
  onClose: () => void;
}

export default function EditTopicDrawer({ topic, visible, onClose }: Props) {
  const { updateTopic } = useTopicsContext();

  const [icon, setIcon] = useState('🗂️');
  const [customIconMode, setCustomIconMode] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [dateStart, setDateStart] = useState<string | null>(null);
  const [dateEnd, setDateEnd] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed whenever a different topic is opened — this component stays
  // mounted between openings, so state would otherwise carry over.
  useEffect(() => {
    if (!topic || !visible) return;
    setIcon(topic.icon);
    setCustomIconMode(!QUICK_ICONS.includes(topic.icon));
    setName(topic.name);
    setNote(topic.note);
    setTargetAmount(topic.targetAmount !== null ? topic.targetAmount.toString() : '');
    setDateStart(topic.dateStart);
    setDateEnd(topic.dateEnd);
  }, [topic?.id, visible]);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave || !topic) return;
    setSaving(true);
    try {
      await updateTopic(topic.id, {
        name: name.trim(),
        note: note.trim(),
        icon,
        targetAmount: targetAmount.trim() ? parseFloat(targetAmount) : null,
        dateStart,
        dateEnd,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <WebDrawer visible={visible && !!topic} onClose={onClose} title="Edit Topic">
        <Text style={styles.label}>Icon</Text>
        <View style={styles.iconRow}>
          {QUICK_ICONS.map((i) => (
            <Pressable
              key={i}
              style={[styles.iconPick, icon === i && !customIconMode && styles.iconPickSelected]}
              onPress={() => { setIcon(i); setCustomIconMode(false); }}>
              <Text style={styles.iconPickText}>{i}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.iconPick, styles.iconPickCustom, customIconMode && styles.iconPickSelected]}
            onPress={() => setCustomIconMode(true)}>
            <Text style={styles.iconPickCustomText}>+</Text>
          </Pressable>
        </View>
        {customIconMode && (
          <TextInput
            style={styles.customIconInput}
            value={QUICK_ICONS.includes(icon) ? '' : icon}
            onChangeText={(t) => setIcon(t || QUICK_ICONS[0])}
            placeholder="Type or paste any emoji"
            placeholderTextColor={Colors.outline}
            maxLength={4}
          />
        )}

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={60} selectionColor={Colors.primary} />

        <Text style={styles.label}>Note <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} maxLength={200} selectionColor={Colors.primary} />

        <Text style={styles.label}>Target Budget <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={targetAmount}
            onChangeText={(t) => { if (/^\d*\.?\d{0,2}$/.test(t)) setTargetAmount(t); }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Colors.outline}
            selectionColor={Colors.primary}
          />
        </View>

        <Text style={styles.label}>Date Range <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.dateRow}>
          <Pressable style={styles.dateInput} onPress={() => setPickingDate('start')}>
            <Text style={dateStart ? styles.dateInputText : styles.dateInputPlaceholder}>{dateStart ?? 'Start date'}</Text>
          </Pressable>
          <Pressable style={styles.dateInput} onPress={() => setPickingDate('end')}>
            <Text style={dateEnd ? styles.dateInputText : styles.dateInputPlaceholder}>{dateEnd ?? 'End date'}</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} onPress={handleSave} disabled={!canSave}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </Pressable>
      </WebDrawer>

      <WebDatePickerModal
        visible={pickingDate === 'start'}
        date={dateStart ?? new Date().toISOString().split('T')[0]}
        maxDate={dateEnd ?? undefined}
        onSelect={(d) => { setDateStart(d); setPickingDate(null); }}
        onClose={() => setPickingDate(null)}
      />
      <WebDatePickerModal
        visible={pickingDate === 'end'}
        date={dateEnd ?? new Date().toISOString().split('T')[0]}
        onSelect={(d) => { setDateEnd(d); setPickingDate(null); }}
        onClose={() => setPickingDate(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.05, textTransform: 'uppercase', marginBottom: 8, marginTop: 18 },
  optional: { color: Colors.outline, textTransform: 'none', fontWeight: '400' },

  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPick: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  iconPickSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryMuted },
  iconPickText: { fontSize: 17 },
  iconPickCustom: { borderStyle: 'dashed' },
  iconPickCustomText: { color: Colors.outline, fontSize: 16, fontWeight: '700' },
  customIconInput: {
    marginTop: 8, backgroundColor: Colors.surfaceContainer, borderRadius: 11, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, color: Colors.text, fontSize: 18,
  },

  input: { backgroundColor: Colors.surfaceContainer, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },

  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14 },
  currencySymbol: { color: Colors.primary, fontSize: 16, fontWeight: '700', marginRight: 4 },
  amountInput: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 10 },

  dateRow: { flexDirection: 'row', gap: 10 },
  dateInput: { flex: 1, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dateInputText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  dateInputPlaceholder: { color: Colors.outline, fontSize: 13.5 },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 22 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.onPrimary, fontSize: 14.5, fontWeight: '800' },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

No caller yet (Task 9 wires it in). Confirms via typecheck.

- [ ] **Step 4: Commit**

```bash
git add components/web/EditTopicDrawer.web.tsx
git commit -m "(feature) web: Edit Topic drawer

Sibling to NewTopicDrawer, same field set, EditExpenseDrawer's
established precedent of a separate component rather than an
isEditing branch.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Topic card component + Topics list page

**Files:**
- Create: `components/web/TopicCard.web.tsx`
- Create: `app/topics.web.tsx`
- Modify: `components/web/WebSidebar.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `Topic` (`store/useTopics.ts`), `useTopicsContext()`, `useTopicExpensesContext()`, `useExpenseContext()`, `expensesForTopic`/`topicTotal` (`lib/topicStats.ts`), `formatSignedAmount` (`lib/money.ts`), `WebStatCard`, `NewTopicDrawer`.
- Produces: `TopicCard` component consumed by `app/topics.web.tsx`; the
  `/topics` route.

- [ ] **Step 1: Write `components/web/TopicCard.web.tsx`**

```tsx
// One topic card on the /topics list page. Split into its own file since
// topics.web.tsx would otherwise carry both the page shell and every card's
// render logic (~300+ lines combined).
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { formatSignedAmount } from '@/lib/money';
import type { Topic } from '@/store/useTopics';

const WARN_COLOR = '#FFB74D';

interface Props {
  topic: Topic;
  total: number;
  expenseCount: number;
}

function metaLine(topic: Topic): string {
  if (topic.dateStart && topic.dateEnd) {
    return `${formatShort(topic.dateStart)} – ${formatShort(topic.dateEnd)}`;
  }
  if (topic.dateStart) return `Started ${formatShort(topic.dateStart)}`;
  return '';
}

function formatShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[m - 1]} ${d}`;
}

export default function TopicCard({ topic, total, expenseCount }: Props) {
  const router = useRouter();
  const meta = metaLine(topic);
  const metaWithCount = [meta, `${expenseCount} expense${expenseCount !== 1 ? 's' : ''}`].filter(Boolean).join(' · ');

  const pct = topic.targetAmount && topic.targetAmount > 0 ? (total / topic.targetAmount) * 100 : null;
  const barColor = pct === null ? undefined : pct >= 100 ? Colors.danger : pct >= 90 ? WARN_COLOR : Colors.primary;

  return (
    <Pressable style={[styles.card, topic.archived && styles.cardArchived]} onPress={() => router.push(`/topics/${topic.id}` as any)}>
      <View style={styles.top}>
        <View style={styles.icon}><Text style={styles.iconText}>{topic.icon}</Text></View>
        <View style={[styles.badge, topic.archived ? styles.badgeArchived : styles.badgeActive]}>
          <Text style={[styles.badgeText, topic.archived ? styles.badgeTextArchived : styles.badgeTextActive]}>
            {topic.archived ? 'Archived' : 'Active'}
          </Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>{topic.name}</Text>
      <Text style={styles.meta} numberOfLines={1}>{metaWithCount}</Text>
      <View style={styles.amtRow}>
        <Text style={styles.amt}>{formatSignedAmount(total)}</Text>
        <Text style={styles.count}>{topic.targetAmount ? `of $${topic.targetAmount.toFixed(2)}` : 'no target set'}</Text>
      </View>
      {pct !== null && (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct))}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text style={styles.pctLabel}>{pct.toFixed(0)}% of target</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // minWidth/flexBasis/flexGrow, not a fixed width: topics.web.tsx's grid
  // uses flexWrap (react-native-web has no `display: grid`), so each card
  // needs to size itself for that to wrap into columns.
  card: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 18, minWidth: 260, flexBasis: '31%', flexGrow: 1 },
  cardArchived: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  icon: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeActive: { backgroundColor: Colors.primary + '1A' },
  badgeArchived: { backgroundColor: Colors.surfaceContainerHigh },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.04 },
  badgeTextActive: { color: Colors.primary },
  badgeTextArchived: { color: Colors.outline },
  name: { color: Colors.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  meta: { color: Colors.textMuted, fontSize: 11.5, marginBottom: 14 },
  amtRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  amt: { color: Colors.text, fontSize: 19, fontWeight: '800' },
  count: { color: Colors.outline, fontSize: 11.5 },
  track: { height: 5, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  pctLabel: { color: Colors.textMuted, fontSize: 10.5, marginTop: 6 },
});
```

- [ ] **Step 2: Write `app/topics.web.tsx`**

```tsx
// Web-only Topics list page. Bare content — WebLayout already wraps every
// route once in AuthGuard (app/_layout.tsx), same convention
// import-statement.web.tsx already follows.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import NewTopicDrawer from '@/components/web/NewTopicDrawer.web';
import TopicCard from '@/components/web/TopicCard.web';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors } from '@/constants/theme';
import { expensesForTopic, topicTotal } from '@/lib/topicStats';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import { useTopicsContext } from '@/store/TopicsContext';

export default function TopicsScreenWeb() {
  const { topics } = useTopicsContext();
  const { memberships } = useTopicExpensesContext();
  const { expenses } = useExpenseContext();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const withTotals = useMemo(
    () => topics.map((t) => {
      const tExpenses = expensesForTopic(t.id, memberships, expenses);
      return { topic: t, total: topicTotal(tExpenses), count: tExpenses.length };
    }),
    [topics, memberships, expenses],
  );

  const active = withTotals.filter((x) => !x.topic.archived);
  const archived = withTotals.filter((x) => x.topic.archived);
  const trackedThisYear = active.reduce((s, x) => s + x.total, 0);

  return (
    <View>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Topics</Text>
          <Text style={styles.sub}>Group expenses by trip, project or event to see what they really cost</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setDrawerOpen(true)}>
          <MaterialCommunityIcons name="plus" size={16} color={Colors.onPrimary} />
          <Text style={styles.addBtnText}>New Topic</Text>
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <WebStatCard label="Active Topics" value={`${active.length}`} />
        <WebStatCard label="Tracked This Year" value={`$${trackedThisYear.toFixed(2)}`} />
        <WebStatCard label="Archived" value={`${archived.length}`} />
      </View>

      {topics.length === 0 ? (
        <Text style={styles.emptyText}>No topics yet — create one to group expenses across categories.</Text>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Active</Text>
              <View style={styles.grid}>
                {active.map(({ topic, total, count }) => (
                  <TopicCard key={topic.id} topic={topic} total={total} expenseCount={count} />
                ))}
              </View>
            </>
          )}
          {archived.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Archived</Text>
              <View style={styles.grid}>
                {archived.map(({ topic, total, count }) => (
                  <TopicCard key={topic.id} topic={topic} total={total} expenseCount={count} />
                ))}
              </View>
            </>
          )}
        </>
      )}

      <NewTopicDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.textSecondary, fontSize: 13, marginTop: 3, maxWidth: 420 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: Colors.onPrimary, fontWeight: '700', fontSize: 13.5 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },

  emptyText: { color: Colors.outline, fontSize: 13 },

  sectionLabel: { color: Colors.outline, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.06, marginTop: 8, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
```

- [ ] **Step 3: Add the Topics nav item to `components/web/WebSidebar.tsx`**

Modify `NAV_ITEMS` — insert a new entry after Summary and before Import:

```ts
const NAV_ITEMS: NavItem[] = [
  { href: '/',         label: 'Home',     icon: 'home-variant',    match: (p) => p === '/' },
  { href: '/expenses', label: 'Expenses', icon: 'receipt-text',    match: (p) => p.startsWith('/expenses') || p.startsWith('/edit-expense') },
  { href: '/budget',   label: 'Budget',   icon: 'target',          match: (p) => p.startsWith('/budget') },
  { href: '/savings',  label: 'Savings',  icon: 'piggy-bank',      match: (p) => p.startsWith('/savings') },
  { href: '/summary',  label: 'Summary',  icon: 'chart-box',       match: (p) => p.startsWith('/summary') },
  { href: '/topics',   label: 'Topics',   icon: 'folder-multiple-outline', match: (p) => p.startsWith('/topics') },
  { href: '/import-statement', label: 'Import', icon: 'file-upload-outline', match: (p) => p.startsWith('/import-statement') },
];
```

- [ ] **Step 4: Register the route in `app/_layout.tsx`**

Add a `Stack.Screen` entry. Find:

```tsx
                  <Stack.Screen name="import-statement"   options={{ headerShown: false }} />
```

and add directly after it:

```tsx
                  <Stack.Screen name="import-statement"   options={{ headerShown: false }} />
                  <Stack.Screen name="topics"              options={{ headerShown: false }} />
```

(Task 9 adds `topics/[id]` alongside this same line.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run web`, sign in. Click "Topics" in the sidebar. Expected: page
loads, shows "No topics yet…" empty state, three stat cards all show 0 /
$0.00. Click "+ New Topic", fill in a name (e.g. "Test Trip"), click "Create
Topic". Expected: drawer closes, a new card appears in the "Active" section
with the name, "0 expenses", and "$0.00". Refresh the page — the topic
should still be there (confirms the Supabase round-trip actually worked,
not just optimistic local state).

- [ ] **Step 7: Commit**

```bash
git add components/web/TopicCard.web.tsx app/topics.web.tsx components/web/WebSidebar.tsx app/_layout.tsx
git commit -m "(feature) web: Topics list page

Card grid (active + archived sections), 3 summary stat cards, New
Topic drawer wired in. Sidebar gains a Topics entry between Summary
and Import.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Topic detail page + Add-Expenses picker

**Files:**
- Create: `components/web/AddExpensesToTopicModal.web.tsx`
- Create: `app/topics/[id].web.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `WebModal` (Task 5), `WebDonutChart` (`components/web/WebDonutChart.tsx`), `WebStatCard`, `WebPanel`, `EditTopicDrawer` (Task 7), `getCategoryById`/`Categories`/`Colors` (`constants/theme.ts`), `expensesForTopic`/`topicTotal`/`categoryBreakdown`/`topicCountForExpense` (`lib/topicStats.ts`), `formatSignedAmount`/`signedAmountColor` (`lib/money.ts`), `useTopicsContext`, `useTopicExpensesContext`, `useExpenseContext`.
- Produces: the `/topics/[id]` route;
  ```tsx
  interface AddExpensesToTopicModalProps {
    topicId: string;
    topicName: string;
    dateStart: string | null;
    dateEnd: string | null;
    visible: boolean;
    onClose: () => void;
  }
  export default function AddExpensesToTopicModal(props: AddExpensesToTopicModalProps): JSX.Element;
  ```

- [ ] **Step 1: Write `components/web/AddExpensesToTopicModal.web.tsx`**

```tsx
// The "Add Expenses" picker, rendered inside WebModal. Search + filter
// chips + a day-grouped checklist. Diffs against the topic's CURRENT
// membership on save rather than a blind full-replace — unchanged rows are
// never touched.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import WebModal from '@/components/web/WebModal.web';
import { Colors, getCategoryById } from '@/constants/theme';
import { formatSignedAmount } from '@/lib/money';
import { expensesForTopic, topicCountForExpense } from '@/lib/topicStats';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import type { Expense } from '@/store/useExpenses';

interface Props {
  topicId: string;
  topicName: string;
  dateStart: string | null;
  dateEnd: string | null;
  visible: boolean;
  onClose: () => void;
}

type FilterKey = 'all' | 'dateRange' | 'unassigned';

export default function AddExpensesToTopicModal({ topicId, topicName, dateStart, dateEnd, visible, onClose }: Props) {
  const { expenses } = useExpenseContext();
  const { memberships, addExpensesToTopic, removeExpenseFromTopic } = useTopicExpensesContext();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentIds = useMemo(
    () => new Set(expensesForTopic(topicId, memberships, expenses).map((e) => e.id)),
    [topicId, memberships, expenses],
  );

  // Seed the selection from current membership exactly once per open —
  // not on every membership change, or a save-in-flight would reset the
  // user's in-progress toggles.
  if (visible && !seeded) {
    setSelected(new Set(currentIds));
    setSeeded(true);
  }
  if (!visible && seeded) {
    setSeeded(false);
  }

  const filtered = useMemo(() => {
    let result = expenses;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (filter === 'dateRange' && dateStart && dateEnd) {
      result = result.filter((e) => e.date >= dateStart && e.date <= dateEnd);
    }
    if (filter === 'unassigned') {
      result = result.filter((e) => topicCountForExpense(e.id, memberships) === 0);
    }
    return result;
  }, [expenses, search, filter, dateStart, dateEnd, memberships]);

  const grouped = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    filtered.forEach((e) => { (map[e.date] ??= []).push(e); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedList = [...selected];
  const selectedTotal = expenses.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.amount, 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const toAdd = selectedList.filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !selected.has(id));
      if (toAdd.length > 0) await addExpensesToTopic(topicId, toAdd);
      for (const id of toRemove) await removeExpenseFromTopic(topicId, id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <WebModal
      visible={visible}
      onClose={onClose}
      title={`Add expenses to "${topicName}"`}
      subtitle="Search or scroll your expenses and check the ones that belong here"
      width={560}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name..."
          placeholderTextColor={Colors.outline}
          selectionColor={Colors.primary}
        />
      </View>

      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, filter === 'all' && styles.chipActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>All</Text>
        </Pressable>
        {dateStart && dateEnd && (
          <Pressable style={[styles.chip, filter === 'dateRange' && styles.chipActive]} onPress={() => setFilter('dateRange')}>
            <Text style={[styles.chipText, filter === 'dateRange' && styles.chipTextActive]}>{dateStart} – {dateEnd}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.chip, filter === 'unassigned' && styles.chipActive]} onPress={() => setFilter('unassigned')}>
          <Text style={[styles.chipText, filter === 'unassigned' && styles.chipTextActive]}>Not yet in a topic</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list}>
        {grouped.map(([date, items]) => (
          <View key={date}>
            <Text style={styles.dayLabel}>{date}</Text>
            {items.map((e) => {
              const cat = getCategoryById(e.category);
              const isChecked = selected.has(e.id);
              const otherTopicCount = topicCountForExpense(e.id, memberships, topicId);
              return (
                <Pressable key={e.id} style={[styles.row, isChecked && styles.rowChecked]} onPress={() => toggle(e.id)}>
                  <View style={[styles.cb, isChecked && styles.cbOn]}>
                    {isChecked && <MaterialCommunityIcons name="check" size={11} color={Colors.onPrimary} />}
                  </View>
                  <View style={[styles.rowIcon, { backgroundColor: cat.color + '22' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={14} color={cat.color} />
                  </View>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {e.name}
                      {otherTopicCount > 0 ? ` · in ${otherTopicCount} topic${otherTopicCount !== 1 ? 's' : ''}` : ''}
                    </Text>
                    <Text style={styles.rowMeta}>{cat.label}</Text>
                  </View>
                  <Text style={styles.rowAmt}>{formatSignedAmount(e.amount)}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        {filtered.length === 0 && <Text style={styles.emptyText}>No expenses match.</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerCount}>
          <Text style={styles.footerCountBold}>{selectedList.length}</Text> selected · {formatSignedAmount(selectedTotal)}
        </Text>
        <View style={styles.footerActions}>
          <Pressable style={styles.btnGhost} onPress={onClose}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.btnPrimary} onPress={handleSave} disabled={saving}>
            <Text style={styles.btnPrimaryText}>{saving ? 'Saving…' : `Add ${selectedList.length} Expense${selectedList.length !== 1 ? 's' : ''}`}</Text>
          </Pressable>
        </View>
      </View>
    </WebModal>
  );
}

const styles = StyleSheet.create({
  searchRow: { paddingHorizontal: 22, paddingVertical: 14 },
  searchInput: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10, color: Colors.text, fontSize: 13 },

  chipRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingBottom: 10 },
  chip: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 5 },
  chipActive: { backgroundColor: Colors.primaryMuted, borderColor: Colors.primary + '55' },
  chipText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '600' },
  chipTextActive: { color: Colors.primary },

  list: { maxHeight: 320, paddingHorizontal: 12 },
  dayLabel: { color: Colors.outline, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11 },
  rowChecked: { backgroundColor: Colors.primaryMuted },
  cb: { width: 17, height: 17, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cbOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowMid: { flex: 1, minWidth: 0 },
  rowName: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  rowMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  rowAmt: { color: Colors.text, fontSize: 13, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 12.5, padding: 20, textAlign: 'center' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  footerCount: { color: Colors.textSecondary, fontSize: 12.5 },
  footerCountBold: { color: Colors.primary, fontWeight: '800' },
  footerActions: { flexDirection: 'row', gap: 8 },
  btnGhost: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 9 },
  btnGhostText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  btnPrimary: { backgroundColor: Colors.primary, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 9 },
  btnPrimaryText: { color: Colors.onPrimary, fontSize: 12.5, fontWeight: '800' },
});
```

- [ ] **Step 2: Write `app/topics/[id].web.tsx`**

```tsx
// Web-only Topic detail page. Follows app/account/[id].web.tsx's exact
// shape: useLocalSearchParams for the id, WebStatCard/WebPanel-style cards
// for the summary, a drawer for edit.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AddExpensesToTopicModal from '@/components/web/AddExpensesToTopicModal.web';
import EditTopicDrawer from '@/components/web/EditTopicDrawer.web';
import WebDonutChart from '@/components/web/WebDonutChart';
import { Colors, getCategoryById } from '@/constants/theme';
import { formatSignedAmount, signedAmountColor } from '@/lib/money';
import { categoryBreakdown, expensesForTopic, topicTotal } from '@/lib/topicStats';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import { useTopicsContext } from '@/store/TopicsContext';

const WARN_COLOR = '#FFB74D';

export default function TopicDetailScreenWeb() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { topics, updateTopic } = useTopicsContext();
  const { memberships, removeExpenseFromTopic } = useTopicExpensesContext();
  const { expenses } = useExpenseContext();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const topic = topics.find((t) => t.id === id);

  const topicExpenses = useMemo(
    () => (topic ? expensesForTopic(topic.id, memberships, expenses) : []),
    [topic, memberships, expenses],
  );
  const total = useMemo(() => topicTotal(topicExpenses), [topicExpenses]);
  const breakdown = useMemo(() => categoryBreakdown(topicExpenses), [topicExpenses]);

  const filteredExpenses = categoryFilter
    ? topicExpenses.filter((e) => e.category === categoryFilter)
    : topicExpenses;

  if (!topic) return null;

  const pct = topic.targetAmount && topic.targetAmount > 0 ? (total / topic.targetAmount) * 100 : null;
  const remaining = topic.targetAmount !== null ? topic.targetAmount - total : null;

  const metaParts: string[] = [];
  if (topic.dateStart && topic.dateEnd) metaParts.push(`${topic.dateStart} – ${topic.dateEnd}`);
  else if (topic.dateStart) metaParts.push(`Started ${topic.dateStart}`);
  metaParts.push(`${topicExpenses.length} expense${topicExpenses.length !== 1 ? 's' : ''}`);

  const handleRemove = (expenseId: string, name: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove "${name}" from this topic? The expense itself won't be deleted.`)) return;
    removeExpenseFromTopic(topic.id, expenseId);
  };

  const handleArchiveToggle = () => updateTopic(topic.id, { archived: !topic.archived });

  const donutData = breakdown.map((b) => ({ id: b.catId, color: getCategoryById(b.catId).color, value: Math.abs(b.amount) }));
  const donutTotal = breakdown.reduce((s, b) => s + Math.abs(b.amount), 0);

  return (
    <View>
      <Pressable onPress={() => router.push('/topics')}>
        <Text style={styles.crumb}>Topics / <Text style={styles.crumbBold}>{topic.name}</Text></Text>
      </Pressable>

      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}><Text style={styles.headerIconText}>{topic.icon}</Text></View>
          <View>
            <Text style={styles.headerName}>{topic.name}</Text>
            <Text style={styles.headerMeta}>{metaParts.join(' · ')}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.btnGhost} onPress={() => setEditDrawerOpen(true)}>
            <Text style={styles.btnGhostText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={handleArchiveToggle}>
            <Text style={styles.btnGhostText}>{topic.archived ? 'Unarchive' : 'Archive'}</Text>
          </Pressable>
          <Pressable style={styles.btnPrimary} onPress={() => setAddModalOpen(true)}>
            <MaterialCommunityIcons name="plus" size={15} color={Colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>Add Expenses</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.totalCard}>
          <Text style={styles.cardLabel}>Total Spent</Text>
          <Text style={[styles.totalValue, { color: signedAmountColor(total) }]}>{formatSignedAmount(total)}</Text>
          <Text style={styles.totalSub}>across {topicExpenses.length} expense{topicExpenses.length !== 1 ? 's' : ''}</Text>
          {pct !== null && (
            <>
              <View style={styles.targetTrack}>
                <View style={[styles.targetFill, { width: `${Math.min(100, Math.max(0, pct))}%` as any, backgroundColor: pct >= 100 ? Colors.danger : pct >= 90 ? WARN_COLOR : Colors.primary }]} />
              </View>
              <View style={styles.targetCaptionRow}>
                <Text style={styles.targetCaption}>{pct.toFixed(0)}% of ${topic.targetAmount!.toFixed(2)} target</Text>
                <Text style={[styles.targetCaption, { color: remaining! >= 0 ? Colors.textMuted : Colors.danger }]}>
                  {remaining! >= 0 ? `$${remaining!.toFixed(2)} left` : `$${Math.abs(remaining!).toFixed(2)} over`}
                </Text>
              </View>
            </>
          )}
        </View>

        {topicExpenses.length > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.cardLabel}>Breakdown by Category</Text>
            <View style={styles.donutRow}>
              <WebDonutChart data={donutData} total={donutTotal} size={104} strokeWidth={18} centerLabel="items" centerValue={`${topicExpenses.length}`} />
              <View style={styles.legend}>
                {breakdown.map((b) => {
                  const cat = getCategoryById(b.catId);
                  return (
                    <View key={b.catId} style={styles.legendRow}>
                      <View style={styles.legendLeft}>
                        <View style={[styles.dot, { backgroundColor: cat.color }]} />
                        <Text style={styles.legendLabel}>{cat.label}</Text>
                      </View>
                      <Text style={styles.legendAmt}>{formatSignedAmount(b.amount)} · {Math.abs(b.pct).toFixed(0)}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </View>

      {topicExpenses.length === 0 ? (
        <Text style={styles.emptyText}>No expenses yet — add some to see what this topic costs.</Text>
      ) : (
        <>
          <View style={styles.filterRow}>
            <Pressable style={[styles.filterPill, categoryFilter === null && styles.filterPillActive]} onPress={() => setCategoryFilter(null)}>
              <Text style={[styles.filterPillText, categoryFilter === null && styles.filterPillTextActive]}>All</Text>
            </Pressable>
            {breakdown.map((b) => {
              const cat = getCategoryById(b.catId);
              const active = categoryFilter === b.catId;
              return (
                <Pressable key={b.catId} style={[styles.filterPill, active && styles.filterPillActive]} onPress={() => setCategoryFilter(active ? null : b.catId)}>
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.expTable}>
            {filteredExpenses.map((e) => {
              const cat = getCategoryById(e.category);
              return (
                <View key={e.id} style={styles.expRow}>
                  <Text style={styles.expDate}>{e.date}</Text>
                  <View style={[styles.expIcon, { backgroundColor: cat.color + '22' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={15} color={cat.color} />
                  </View>
                  <View style={styles.expMid}>
                    <Text style={styles.expName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.expCat}>{cat.label}</Text>
                  </View>
                  <Text style={[styles.expAmt, { color: signedAmountColor(e.amount) }]}>{formatSignedAmount(e.amount)}</Text>
                  <Pressable onPress={() => handleRemove(e.id, e.name)} hitSlop={8} style={styles.expRemove}>
                    <MaterialCommunityIcons name="close" size={14} color={Colors.outline} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}

      <EditTopicDrawer topic={topic} visible={editDrawerOpen} onClose={() => setEditDrawerOpen(false)} />
      <AddExpensesToTopicModal
        topicId={topic.id}
        topicName={topic.name}
        dateStart={topic.dateStart}
        dateEnd={topic.dateEnd}
        visible={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  crumb: { color: Colors.outline, fontSize: 12, marginBottom: 14 },
  crumbBold: { color: Colors.textSecondary, fontWeight: '600' },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  headerLeft: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  headerIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  headerIconText: { fontSize: 24 },
  headerName: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  headerMeta: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  btnGhost: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9 },
  btnGhostText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 9 },
  btnPrimaryText: { color: Colors.onPrimary, fontSize: 12.5, fontWeight: '800' },

  summaryRow: { flexDirection: 'row', gap: 14, marginBottom: 24 },
  totalCard: { flex: 1.3, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 22 },
  breakdownCard: { flex: 1.7, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 22 },
  cardLabel: { color: Colors.outline, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 8 },
  totalValue: { fontSize: 32, fontWeight: '800' },
  totalSub: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 6 },
  targetTrack: { height: 7, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  targetFill: { height: '100%', borderRadius: 4 },
  targetCaptionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  targetCaption: { color: Colors.textMuted, fontSize: 11 },

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: Colors.textSecondary, fontSize: 12 },
  legendAmt: { color: Colors.text, fontSize: 12, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 13 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterPill: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 },
  filterPillActive: { backgroundColor: Colors.primaryMuted, borderColor: Colors.primary + '55' },
  filterPillText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: Colors.primary },

  expTable: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, overflow: 'hidden' },
  expRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
  expDate: { color: Colors.textSecondary, fontSize: 12, width: 80 },
  expIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expMid: { flex: 1, minWidth: 0 },
  expName: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  expCat: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  expAmt: { fontSize: 13.5, fontWeight: '700' },
  expRemove: { width: 24, alignItems: 'flex-end' },
});
```

- [ ] **Step 3: Register the route in `app/_layout.tsx`**

Find the line added in Task 8 Step 4:

```tsx
                  <Stack.Screen name="topics"              options={{ headerShown: false }} />
```

Add directly after it:

```tsx
                  <Stack.Screen name="topics"              options={{ headerShown: false }} />
                  <Stack.Screen name="topics/[id]"         options={{ headerShown: false }} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run web`, sign in, go to Topics, click into the "Test Trip" topic
created in Task 8's verification. Expected: detail page loads, breadcrumb
reads "Topics / Test Trip", Total Spent shows $0.00 across 0 expenses, no
breakdown card (empty-state message shown instead since 0 expenses). Click
"+ Add Expenses" — modal opens, shows your real expenses grouped by date.
Check a few boxes, click "Add N Expenses". Expected: modal closes, the
detail page now shows a nonzero total, a breakdown donut + legend, and the
checked expenses in the list below with a remove ("×") button on each.
Click a category filter pill — list narrows to that category. Click "×" on
one expense, confirm the browser confirm dialog — expense disappears from
the list and the total updates. Click "Edit" — drawer opens pre-filled with
the topic's current name/icon/etc; change the name, save — header updates.
Click "Archive" — badge should reflect archived state when you navigate
back to `/topics` (the list page's Active/Archived split).

- [ ] **Step 6: Commit**

```bash
git add components/web/AddExpensesToTopicModal.web.tsx "app/topics/[id].web.tsx" app/_layout.tsx
git commit -m "(feature) web: Topic detail page + Add Expenses picker

Total Spent card (with target-budget progress bar when set), category
breakdown donut + legend (reuses WebDonutChart as-is), category
filter pills, expense list with per-row remove (un-tags, never
deletes the expense). Add Expenses picker: search, date-range/
unassigned filter chips, day-grouped checklist that diffs against
current membership on save rather than a blind full-replace.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Native stub routes

**Files:**
- Create: `app/topics.tsx`
- Create: `app/topics/[id].tsx`

**Interfaces:**
- Consumes: nothing new — copies `app/import-statement.tsx`'s pattern.
- Produces: native route matches for `topics` and `topics/[id]` so
  `app/_layout.tsx`'s shared `<Stack>` doesn't 404 on native for these
  screen names.

- [ ] **Step 1: Write `app/topics.tsx`**

```tsx
// Native stub. Topics is web-only for v1 — see the design doc. This screen
// exists only so /topics has SOME route on native: app/_layout.tsx
// registers every screen in one shared <Stack>, so a web-only file
// (topics.web.tsx) would otherwise leave native with no match for that
// name at all. Copies app/import-statement.tsx's exact pattern.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function TopicsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Topics</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="folder-multiple-outline" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Available on the web app</Text>
        <Text style={styles.sub}>
          Grouping expenses into topics is a web-only feature for now — open
          Spendee on the web to create and manage topics.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sub: { color: Colors.textSecondary, fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 19 },
});
```

- [ ] **Step 2: Write `app/topics/[id].tsx`**

Identical content to `app/topics.tsx` (same stub message applies whether a
specific topic id was requested or not) — copy the file:

```bash
cp app/topics.tsx "app/topics/[id].tsx"
```

Then edit `app/topics/[id].tsx`'s exported function name only, to avoid two
identically-named default exports confusing anyone grepping the codebase —
change `export default function TopicsScreen()` to
`export default function TopicDetailScreen()`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

This can only be verified by running the native app (`npm start`, press `i`
or `a`) since the whole point is native-only behavior — if a simulator/
device isn't available in this environment, verify instead by confirming
`app/topics.tsx` and `app/topics/[id].tsx` both exist and export a default
component, and that `app/_layout.tsx`'s `Stack.Screen name="topics"` /
`name="topics/[id]"` entries (added in Tasks 8-9) now have a matching file
on every platform — run:

```bash
ls app/topics.tsx "app/topics/[id].tsx" app/topics.web.tsx "app/topics/[id].web.tsx"
```

Expected: all four files listed, no "No such file" errors.

- [ ] **Step 5: Commit**

```bash
git add app/topics.tsx "app/topics/[id].tsx"
git commit -m "(feature) native: stub routes for Topics ('available on the web app')

Copies import-statement.tsx's exact pattern — required because
app/_layout.tsx registers every screen name in one shared Stack, so
a web-only route left unregistered on native would 404 instead of
falling back gracefully.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Bulk-select entry point on the Expenses list

**Files:**
- Modify: `app/(tabs)/expenses.web.tsx`

**Interfaces:**
- Consumes: `useTopicsContext()`, `useTopicExpensesContext()`, `NewTopicDrawer` (Task 6).
- Produces: no new exports — this is UI added to an existing screen.

- [ ] **Step 1: Add select-mode state and the bulk action bar**

Modify `app/(tabs)/expenses.web.tsx`. Add imports at the top, after the
existing `formatSignedAmount, signedAmountColor` import:

```tsx
import NewTopicDrawer from '@/components/web/NewTopicDrawer.web';
import { useTopicExpensesContext } from '@/store/TopicExpensesContext';
import { useTopicsContext } from '@/store/TopicsContext';
```

Inside `ExpensesScreenWeb`, after the existing `const [editingId, setEditingId] = useState<string | null>(null);` line, add:

```tsx
  const { topics } = useTopicsContext();
  const { addExpensesToTopic } = useTopicExpensesContext();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [newTopicDrawerOpen, setNewTopicDrawerOpen] = useState(false);
  const [addedFlash, setAddedFlash] = useState<string | null>(null);

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddToExistingTopic = async (topicId: string, topicName: string) => {
    await addExpensesToTopic(topicId, [...selectedIds]);
    setTopicPickerOpen(false);
    setAddedFlash(`Added to ${topicName}`);
    setTimeout(() => {
      setAddedFlash(null);
      setSelectMode(false);
      setSelectedIds(new Set());
    }, 1500);
  };
```

- [ ] **Step 2: Add the "Select" toggle button next to "Add Expense"**

Find:

```tsx
        <Pressable style={styles.addBtn} onPress={() => sheetRef.current?.expand()}>
          <MaterialCommunityIcons name="plus" size={16} color={Colors.onPrimary} />
          <Text style={styles.addBtnText}>Add Expense</Text>
        </Pressable>
      </View>
```

Change to:

```tsx
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={styles.selectBtn} onPress={toggleSelectMode}>
            <Text style={styles.selectBtnText}>{selectMode ? 'Done' : 'Select'}</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => sheetRef.current?.expand()}>
            <MaterialCommunityIcons name="plus" size={16} color={Colors.onPrimary} />
            <Text style={styles.addBtnText}>Add Expense</Text>
          </Pressable>
        </View>
      </View>
```

- [ ] **Step 3: Add the bulk action bar (replaces the filter row when select mode is active)**

Find the `filterRow` block:

```tsx
      <View style={styles.filterRow}>
```

Wrap it in a conditional — change to:

```tsx
      {selectMode ? (
        <View style={styles.bulkBar}>
          {addedFlash ? (
            <Text style={styles.bulkFlashText}>{addedFlash}</Text>
          ) : (
            <>
              <Text style={styles.bulkCount}>{selectedIds.size} selected</Text>
              <Pressable
                style={[styles.bulkAddBtn, selectedIds.size === 0 && styles.bulkAddBtnDisabled]}
                onPress={() => setTopicPickerOpen(true)}
                disabled={selectedIds.size === 0}>
                <Text style={styles.bulkAddBtnText}>Add to topic ▾</Text>
              </Pressable>
              <Pressable style={styles.bulkCancelBtn} onPress={toggleSelectMode}>
                <Text style={styles.bulkCancelBtnText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
      <View style={styles.filterRow}>
```

Then find the filter row's closing `</View>` (the one immediately before the
`<WebPanel` block) and change it to close the conditional too:

```tsx
      </View>

      <WebPanel
```

becomes:

```tsx
      </View>
      )}

      <WebPanel
```

- [ ] **Step 4: Pass select-mode props down to `ExpenseRow` and add the checkbox**

Find:

```tsx
                {items.map((item) => (
                  <ExpenseRow
                    key={item.id}
                    item={item}
                    highlight={isToday}
                    onDelete={() => deleteExpenseWithReversal(item)}
                    onOpen={() => setEditingId(item.id)}
                  />
                ))}
```

Change to:

```tsx
                {items.map((item) => (
                  <ExpenseRow
                    key={item.id}
                    item={item}
                    highlight={isToday}
                    onDelete={() => deleteExpenseWithReversal(item)}
                    onOpen={() => setEditingId(item.id)}
                    selectMode={selectMode}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelected(item.id)}
                  />
                ))}
```

- [ ] **Step 5: Update the `ExpenseRow` component to render the checkbox and short-circuit `onOpen` in select mode**

Find:

```tsx
function ExpenseRow({ item, highlight, onDelete, onOpen }: { item: Expense; highlight: boolean; onDelete: () => void; onOpen: () => void }) {
  const cat = getCategoryById(item.category);
  const sub = getSubcategoryById(item.category, item.subcategory);
  const displayLabel = sub ? `${cat.label} · ${sub.label}` : cat.label;

  return (
    <Pressable style={[styles.row, highlight && styles.rowToday]} onPress={onOpen}>
      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <View style={[styles.icon, { backgroundColor: cat.color + '22' }]}>
          <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
        </View>
```

Change to:

```tsx
function ExpenseRow({ item, highlight, onDelete, onOpen, selectMode, selected, onToggleSelect }: {
  item: Expense; highlight: boolean; onDelete: () => void; onOpen: () => void;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void;
}) {
  const cat = getCategoryById(item.category);
  const sub = getSubcategoryById(item.category, item.subcategory);
  const displayLabel = sub ? `${cat.label} · ${sub.label}` : cat.label;

  return (
    <Pressable style={[styles.row, highlight && styles.rowToday]} onPress={selectMode ? onToggleSelect : onOpen}>
      {selectMode && (
        <View style={[styles.rowCheckbox, selected && styles.rowCheckboxOn]}>
          {selected && <MaterialCommunityIcons name="check" size={11} color={Colors.onPrimary} />}
        </View>
      )}
      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <View style={[styles.icon, { backgroundColor: cat.color + '22' }]}>
          <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
        </View>
```

- [ ] **Step 6: Add the trailing delete button's `selectMode` guard**

Find:

```tsx
      <Pressable onPress={(e) => { e.stopPropagation?.(); onDelete(); }} hitSlop={8} style={{ width: 32, alignItems: 'flex-end' }}>
        <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
      </Pressable>
    </Pressable>
  );
}
```

Change to:

```tsx
      {!selectMode && (
        <Pressable onPress={(e) => { e.stopPropagation?.(); onDelete(); }} hitSlop={8} style={{ width: 32, alignItems: 'flex-end' }}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
        </Pressable>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 7: Render the topic-picker popover and the New Topic drawer**

Find the very end of the component, just before its closing `</View>` (the
outermost one, right before `<AddExpenseSheet sheetRef={sheetRef} />`):

```tsx
      <AddExpenseSheet sheetRef={sheetRef} />
```

Add directly before it:

```tsx
      {topicPickerOpen && (
        <Pressable style={styles.backdrop} onPress={() => setTopicPickerOpen(false)}>
          <Pressable style={styles.topicPopover} onPress={() => {}}>
            {topics.filter((t) => !t.archived).map((t) => (
              <Pressable key={t.id} style={styles.topicPopoverItem} onPress={() => handleAddToExistingTopic(t.id, t.name)}>
                <Text style={styles.topicPopoverIcon}>{t.icon}</Text>
                <Text style={styles.topicPopoverName} numberOfLines={1}>{t.name}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.topicPopoverItem, styles.topicPopoverNewItem]}
              onPress={() => { setTopicPickerOpen(false); setNewTopicDrawerOpen(true); }}>
              <MaterialCommunityIcons name="plus" size={15} color={Colors.primary} />
              <Text style={[styles.topicPopoverName, { color: Colors.primary }]}>New Topic</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      <NewTopicDrawer
        visible={newTopicDrawerOpen}
        onClose={() => setNewTopicDrawerOpen(false)}
        preselectedExpenseIds={[...selectedIds]}
        onCreated={() => { setNewTopicDrawerOpen(false); setSelectMode(false); setSelectedIds(new Set()); }}
      />

      <AddExpenseSheet sheetRef={sheetRef} />
```

- [ ] **Step 8: Add the new styles**

Find the `addBtnText:` style line:

```ts
  addBtnText: { color: Colors.onPrimary, fontWeight: '700', fontSize: 13.5 },
```

Add directly after it:

```ts
  selectBtn: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  selectBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },

  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  bulkCount: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  bulkAddBtn: { backgroundColor: Colors.primary, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  bulkAddBtnDisabled: { opacity: 0.4 },
  bulkAddBtnText: { color: Colors.onPrimary, fontSize: 12, fontWeight: '700' },
  bulkCancelBtn: { paddingHorizontal: 8, paddingVertical: 7 },
  bulkCancelBtnText: { color: Colors.outline, fontSize: 12, fontWeight: '600' },
  bulkFlashText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  rowCheckbox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowCheckboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  topicPopover: {
    position: 'absolute', top: 60, left: 0, width: 240,
    backgroundColor: Colors.surfaceContainerHigh, borderWidth: 1, borderColor: Colors.border, borderRadius: 14,
    paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 30, elevation: 10,
  },
  topicPopoverItem: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 10 },
  topicPopoverIcon: { fontSize: 15 },
  topicPopoverName: { color: Colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  topicPopoverNewItem: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 10 },
```

Note: `topicPopover`'s `position: 'absolute'` with fixed `top`/`left` is
intentionally approximate here (unlike the date-range popover elsewhere in
this file, which uses `measureInWindow` for exact placement) — the "Add to
topic" button sits in a predictable spot inside the bulk bar, and exact
pixel positioning isn't worth the added ref-measurement code for this v1.
If it visually misaligns during manual verification (Step 9), switch it to
the same `measureInWindow` pattern the date pill popover already uses
(`datePillRef` / `openDatePopover` in this same file) rather than
hand-tuning the offset.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Manual verification**

Run `npm run web`, sign in, go to Expenses. Click "Select". Expected: filter
row is replaced by a bulk action bar reading "0 selected", each expense row
gains a checkbox, clicking a row toggles its checkbox instead of opening the
edit drawer, the trash icon disappears from each row. Check 2-3 expenses —
count updates. Click "Add to topic ▾" — popover shows existing non-archived
topics plus "+ New Topic" at the bottom. Click an existing topic — popover
closes, bar briefly shows "Added to \<name\>" in mint, then reverts to the
normal toolbar and select mode exits. Go to that topic's detail page —
confirm the expenses you selected now appear there. Repeat, this time
clicking "+ New Topic" from the popover — the New Topic drawer opens; fill
in a name and save — confirm you land back on the Expenses list with select
mode exited, then check the new topic's detail page has those expenses
pre-attached.

- [ ] **Step 11: Commit**

```bash
git add "app/(tabs)/expenses.web.tsx"
git commit -m "(feature) web: bulk-select expenses into a topic

Select mode adds a checkbox to each row and swaps the filter row for
a bulk action bar: 'Add to topic' (popover of existing topics + New
Topic) or Cancel. Picking an existing topic flashes a brief inline
confirmation (no toast component exists in this app) before exiting
select mode.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** — checked against `docs/superpowers/specs/2026-09-11-expense-topics-design.md` section by section:
- Data model → Task 1. ✅
- Store layer (`useTopics`, `useTopicExpenses`, client-side stat computation) → Tasks 2, 3, 4. ✅
- Routes + sidebar entry + native stubs → Tasks 8, 9, 10. ✅
- Topic list page (stat cards, active/archived sections, cards) → Task 8. ✅
- New Topic drawer (icon entry resolved to free-text instead of custom picker per spec) → Task 6. ✅
- Edit Topic drawer → Task 7. ✅
- Topic detail page (total card w/ target progress + over-target red, breakdown donut+legend, category filter pills, expense list w/ remove) → Task 9. ✅
- Add Expenses picker (search, date-range chip only when both dates set, "not yet in a topic" chip, "in N topics" tag, diff-based save) → Task 9. ✅
- Bulk-select entry point on Expenses (checkbox mode, bulk bar, existing-topic popover + New Topic, inline flash confirmation) → Task 11. ✅
- `WebModal` shared chrome → Task 5. ✅

**2. Placeholder scan** — no "TBD"/"TODO"/"handle appropriately" found; every
step has complete code, not a description of code.

**3. Type consistency** — verified across tasks:
- `Topic` (Task 2) fields (`id, name, note, icon, targetAmount, dateStart,
  dateEnd, archived, createdAt`) match every consumer: `TopicCard` (Task 8),
  `NewTopicDrawer`/`EditTopicDrawer` (Tasks 6-7), the detail page (Task 9).
- `TopicExpenseMembership` (Task 3) fields (`id, topicId, expenseId,
  createdAt`) match `lib/topicStats.ts` (Task 4)'s consumption
  (`m.topicId`, `m.expenseId`).
- `lib/topicStats.ts` function names (`expensesForTopic`, `topicTotal`,
  `categoryBreakdown`, `topicCountForExpense`) match every import site:
  Task 8 (`app/topics.web.tsx`), Task 9 (both
  `app/topics/[id].web.tsx` and `AddExpensesToTopicModal.web.tsx`).
- `createTopic`'s return type (`Promise<Topic>`, Task 2) matches Task 6's
  `NewTopicDrawer` usage (`const topic = await createTopic(...); ... topic.id`).
- `addExpensesToTopic(topicId, expenseIds[])` / `removeExpenseFromTopic(topicId, expenseId)`
  signatures (Task 3) match every call site: Task 6 (`NewTopicDrawer`),
  Task 9 (`AddExpensesToTopicModal`), Task 11 (`expenses.web.tsx`'s
  `handleAddToExistingTopic`).
- `WebModal` props (Task 5: `visible, onClose, title, subtitle?, children,
  width?`) match Task 9's `AddExpensesToTopicModal` usage exactly.

No gaps found.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-11-expense-topics.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
