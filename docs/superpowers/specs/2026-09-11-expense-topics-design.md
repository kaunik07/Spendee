# Expense Topics — Design

## Context

Spendee tracks expenses by category (Food, Transport, Shopping…), which answers
"how much did I spend on dining this month" but not "how much did my New York
trip cost in total" or "what did moving to a new place actually cost me,
across every category it touched." Those cross-category questions currently
require manually adding up rows by eye.

Topics solve this: a user creates a topic ("Trip to New York", "Moving Cost"),
tags any existing expenses onto it regardless of category, and gets a
dedicated page showing the total spent and a category breakdown for exactly
that group. It's a label over existing expenses, not a new kind of
transaction — nothing about how an expense is entered, categorized, or synced
changes.

Approved via the brainstorming visual companion: a card-grid list page, a
right-side "New Topic" drawer (name/note/icon/target/date range, with a full
emoji picker beyond the curated quick row), a detail page (total + donut
category breakdown + filterable expense list), and a centered "Add Expenses"
picker modal. Screenshots of each approved mockup are not reproduced here;
the mockup HTML lives in `.superpowers/brainstorm/` (gitignored) for
reference during implementation — behavior described below is authoritative.

### Decisions already made
- **Many-to-many.** One expense can belong to multiple topics (a hotel
  charge could sit in both "Trip to New York" and a broader "Q3 Travel").
- **Two entry points to add expenses to a topic:** bulk-select in the
  Expenses list ("Add to topic…"), and a search/checklist picker on the
  topic's own page.
- **Web-only for v1**, same precedent as Statement Import — native gets a
  stub route ("available on the web app"), no native UI built now.
- **Topic fields:** name (required), note (optional), icon/emoji (required,
  defaults to a sensible pick), optional target budget, optional archive
  flag, optional date range (context only — see Scope below).
- Removing an expense from a topic **un-tags it, never deletes the expense.**

---

## Data model

Two new tables, `supabase/migrations/20260911000000_expense_topics.sql`,
following the exact RLS and realtime conventions every existing table already
uses (`user_id` FK to `auth.users`, `auth.uid() = user_id` policy, added to
`supabase_realtime`):

```sql
CREATE TABLE public.topics (
  id           UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID           REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         TEXT           NOT NULL,
  note         TEXT           NOT NULL DEFAULT '',
  icon         TEXT           NOT NULL DEFAULT '🗂️',   -- a single emoji
  target_amount NUMERIC(12,2) DEFAULT NULL,
  date_start   TEXT           DEFAULT NULL,             -- YYYY-MM-DD, context only
  date_end     TEXT           DEFAULT NULL,
  archived     BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at   BIGINT         NOT NULL
);

CREATE TABLE public.topic_expenses (
  id          UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id    UUID   REFERENCES public.topics(id)    ON DELETE CASCADE NOT NULL,
  expense_id  UUID   REFERENCES public.expenses(id)  ON DELETE CASCADE NOT NULL,
  user_id     UUID   REFERENCES auth.users(id)        ON DELETE CASCADE NOT NULL,
  created_at  BIGINT NOT NULL,
  UNIQUE (topic_id, expense_id)
);
```

Both get `ENABLE ROW LEVEL SECURITY` + an owner policy
(`USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`), an index
(`topic_expenses(topic_id)` and `topic_expenses(expense_id)` — the second so
"which topics is this expense in" for the picker's "in N topics" tag is
cheap), and both join `supabase_realtime`.

`ON DELETE CASCADE` on both FKs is load-bearing: deleting an expense
(anywhere in the app, unrelated to topics) automatically drops its
`topic_expenses` rows with no app-side cleanup code, and deleting a topic
drops its memberships the same way. Deleting an expense never deletes a
topic, and vice versa — cascade only flows from the deleted row's own FK
direction.

No new RPC. Every write here (`insert`/`delete` on `topics` and
`topic_expenses`) goes through the existing generic `syncQueue.ts` op types —
there's no balance to move, no cross-table invariant to protect
transactionally, so this doesn't need the `import_statement_expenses`-style
`SECURITY DEFINER` treatment those needed.

---

## Store layer

Two hooks in `store/`, each structured like `useBudgets.ts` (the simplest
existing precedent: full-table fetch on mount, a realtime subscription that
triggers refetch, writes through `enqueue` + `flushAndNotify`, local-mode
branch even though web never exercises it — mobile might reuse this store
later without a rewrite):

- **`useTopics.ts`** — `{ topics, loading, refresh, createTopic, updateTopic, archiveTopic, deleteTopic }`. `Topic` interface mirrors the table columns (camelCase).
- **`useTopicExpenses.ts`** — `{ memberships, loading, refresh, addExpensesToTopic(topicId, expenseIds[]), removeExpenseFromTopic(topicId, expenseId) }`. Fetches the **whole** `topic_expenses` table for the user (small table — a few rows per expense at most), not scoped to one topic, so a single subscription serves both the topic detail page (filter by `topic_id`) and the Expenses-list picker (filter by `expense_id`, for the "already in N topics" tag) without two separate fetches.

Both get `TopicsProvider`/`TopicExpensesProvider` in `app/_layout.tsx`,
following `BudgetsProvider`'s exact shape, and `useTopicsContext()` /
`useTopicExpensesContext()` accessors.

**Totals and the category breakdown are computed client-side**, not via a
SQL aggregate: `useTopicExpensesContext().memberships` filtered to one
`topic_id` gives a list of `expense_id`s; cross-referencing that against
`useExpenseContext().expenses` (already loaded for the whole app) gives the
actual `Expense[]` for that topic, which is then `reduce`d for the total and
grouped by `category` for the donut — identical to how `budget.web.tsx`
already computes `spentByCategory` and how `summary.web.tsx` already builds
its donut chart's `groups`. No new aggregation code pattern, just a third
consumer of the same one.

---

## Routes

- **`app/topics.web.tsx`** — the list page (card grid, approved mockup A).
  Bare content; `WebLayout` already wraps every route once in `AuthGuard`
  (`app/_layout.tsx`), so this screen renders content only, no self-wrapping
  — same convention `import-statement.web.tsx` already follows.
- **`app/topics/[id].web.tsx`** — the detail page (total card + donut
  breakdown card + category filter pills + expense list), following
  `app/account/[id].web.tsx`'s exact shape: `useLocalSearchParams` for the
  id, `WebStatCard`/`WebPanel` for the summary cards, a drawer for edit.
- **`app/topics.tsx`** and **`app/topics/[id].tsx`** — native stubs, copying
  `app/import-statement.tsx`'s "available on the web app" screen verbatim
  (same icon, same two-line message, same layout) — required because
  `app/_layout.tsx` registers every screen name in one shared `<Stack>`, so
  a web-only route left unregistered on native would 404 rather than fall
  back gracefully.
- `app/_layout.tsx` gains two new `<Stack.Screen>` entries:
  `topics`, `topics/[id]`.
- `components/web/WebSidebar.tsx`'s `NAV_ITEMS` gains a `Topics` entry
  (icon `folder-multiple-outline` — distinct from Import's
  `file-upload-outline` and Budget's `target`), placed after Summary and
  before Import, matching the approved mockup's sidebar order.

---

## Topic list page (`/topics`)

Per the approved mockup:
- Header: "Topics" title + subtitle, "+ New Topic" button (opens the New
  Topic drawer).
- Three `WebStatCard`s: Active Topics (count), Tracked This Year (sum of
  every non-archived topic's total, computed the same client-side way as
  above), Archived (count).
- Two sections, **Active** and **Archived** (only rendered if non-empty),
  each a CSS grid of topic cards. A card shows: icon, an Active/Archived
  badge, name, a meta line (`date_start`–`date_end` if both are set, else
  `Started <date_start>` if only start is set, else nothing), total spent,
  and — only when `target_amount` is set — a progress bar + "X% of target"
  caption, amber past 90% same as Budget's existing over-threshold color,
  mint otherwise. No progress bar when there's no target (exactly the
  "Moving to New Place" card in the mockup).
- Clicking a card navigates to `/topics/[id]`.

## New Topic drawer

A `WebDrawer` (existing component, unchanged) titled "New Topic":
- Icon row: 8 curated emoji as quick-pick tiles (🗽📦🏖️💍🎓🚗🏠🎉, matching
  the mockup) plus a dashed "+" tile. Tapping "+" reveals a plain text
  `TextInput` (auto-focused, `maxLength={2}` to allow one emoji, which can
  be a 2-codepoint sequence) instead of a custom picker UI — the browser's
  own OS-level emoji picker (macOS `Cmd+Ctrl+Space`, Windows `Win+.`) or
  mobile-web's native keyboard emoji tab already gives full-unicode search
  for free, so there's no new dependency and no bundle-size cost for a
  curated dataset. Whatever's typed becomes the selected icon, shown as a
  9th (now-filled) tile; typing over it replaces it. This resolves what
  was an open question in an earlier draft of this spec — no
  `EmojiPicker.web.tsx` component needed.
- Name (`TextInput`, required — mirrors `AddExpenseSheet`'s pattern of
  disabling Save until non-empty after `.trim()`).
- Note (`TextInput`, optional).
- Target Budget (`$` prefixed numeric input, optional — same
  decimal-pad-safe regex guard `AddExpenseSheet.tsx` already uses:
  `/^\d*\.?\d{0,2}$/`).
- Date Range: two date fields using the existing `WebDatePickerModal`,
  optional, independently settable (a start with no end, or vice versa, is
  valid — it's display context, not a validated range).
- "Create Topic" button, disabled until name is non-empty.
- If opened from the Expenses list's bulk "+ New Topic" action (see below),
  accepts an optional `preselectedExpenseIds: string[]` prop; on save, calls
  `createTopic` then immediately `addExpensesToTopic` with those ids in the
  same flow, so the user lands on a topic that's already populated instead
  of an empty one they'd have to re-populate.

An `EditTopicDrawer.web.tsx` reuses the identical field set for editing an
existing topic (opened from the "Edit" button on the detail page), following
`EditExpenseDrawer.tsx`'s precedent of a near-identical sibling component to
the Add drawer rather than one drawer with an isEditing branch — smaller,
independently readable components was the explicit convention set there.

## Topic detail page (`/topics/[id]`)

Per the approved mockup:
- Breadcrumb "Topics / \<name\>".
- Header: icon, name, meta line, action buttons — Edit (opens
  `EditTopicDrawer`), Archive/Unarchive (toggles `archived`, no
  confirmation — reversible), "+ Add Expenses" (opens the picker modal,
  primary-styled button).
- **Total Spent card** (`WebStatCard`-shaped but custom, since it needs the
  progress bar): total, "across N expenses", and — only if `target_amount`
  is set — the same progress-bar treatment as the list page's cards, plus a
  "$X left" caption (or "$X over" in danger-red past 100%, an addition
  beyond the mockup's happy-path 92% example, needed since real spending
  will exceed targets).
- **Breakdown by Category card**: reuses `components/web/WebDonutChart.tsx`
  as-is (already built for `summary.web.tsx`, already keyed to
  `constants/theme.ts`'s category colors — no new charting code) plus a
  legend list (dot, category label, amount, percentage) sorted by amount
  descending.
- Category filter pills (`All` + one pill per category actually present in
  this topic's expenses, not the full 15 — an empty pill for a category
  with zero expenses here would be dead UI). Selecting one filters the
  expense list below; `All` is the default.
- Expense list: date, category icon + name + category label, signed amount
  (reuses `lib/money.ts`'s `formatSignedAmount`/`signedAmountColor` from the
  refund work — a refund tagged into a topic should read the same way it
  does everywhere else in the app), and a remove ("×") button that calls
  `removeExpenseFromTopic` — a `window.confirm`, matching every other
  destructive-but-recoverable action on web (delete account txn, delete
  expense), with copy clarifying it un-tags rather than deletes
  ("Remove "Flight to JFK" from this topic? The expense itself won't be
  deleted.").
- If the topic has zero expenses: an empty state ("No expenses yet — add
  some to see what this topic costs.") in place of the breakdown card and
  list, replacing the mockup's populated example.

## Add Expenses picker

A new `components/web/WebModal.web.tsx` — a centered-modal sibling to
`WebDrawer.tsx`, same `Modal` + overlay `Pressable`-to-dismiss structure,
different geometry (centered, fixed max-height, own scroll region) since a
search-and-pick task over a couple hundred expenses reads better centered
than docked to an edge. This is new shared chrome, not a one-off — worth
extracting now rather than inlining into the picker component, since a
second modal-shaped use (e.g. a future "duplicate this topic" confirm) would
otherwise duplicate it.

`components/web/AddExpensesToTopicModal.web.tsx` renders inside it:
- Title "Add expenses to "\<topic name\>"".
- Search input, filtering the list to expenses whose name contains the typed
  text (case-insensitive substring — the Expenses screen has no search of
  its own to match today, so this is a fresh, simple filter local to the
  modal, not shared state).
- Filter chips: `All`, a date-range chip pre-filled from the topic's own
  `date_start`/`date_end` **only if both are set** (omitted otherwise —
  nothing to pre-fill), `Not yet in a topic` (expenses with zero
  `topic_expenses` rows at all, not zero rows for *this* topic).
- List grouped by date (descending), each row: checkbox, category icon,
  name + category label, amount, and — if the expense already belongs to
  one or more *other* topics — a small "in N topics" tag (pulled from
  `useTopicExpensesContext().memberships`, counting rows for that
  `expense_id` excluding the current topic).
- Rows already in *this* topic render pre-checked; unchecking one and
  saving removes it, checking a new one adds it — the footer's "Add N
  Expenses" button actually diffs against the topic's current membership
  and calls `addExpensesToTopic`/`removeExpenseFromTopic` only for what
  changed, not a blind full-replace (avoids an unnecessary delete+reinsert
  of unchanged rows, which would also spuriously bump their `created_at`
  if that were ever surfaced).
- Footer: running "N selected · $total" on the left, Cancel + "Add N
  Expenses" on the right (button label reflects the count, per the mockup).

## Bulk-select entry point (Expenses list)

`app/(tabs)/expenses.web.tsx` gains a select-mode toggle:
- A "Select" button in the existing toolbar area flips the list into
  select mode: each `ExpenseRow` gains a leading checkbox (same visual
  treatment as `ImportReviewTable.web.tsx`'s row checkboxes, for
  consistency with the one other place multi-select already exists in the
  app).
- Selecting one or more rows replaces the toolbar with a bulk-action bar:
  "N selected", "Add to topic ▾" (a small popover listing existing
  **non-archived** topics by name + icon, plus a "+ New Topic" entry at the
  bottom), and "Cancel" (exits select mode, clears selection).
- Picking an existing topic calls `addExpensesToTopic` directly. The app has
  no toast/snackbar component today, so confirmation is the bulk-action bar
  itself briefly flashing its text to "Added to \<topic name\>" (mint text
  color) for ~1.5s before the bar closes and select mode exits — no new
  shared component needed for a single use site.
- Picking "+ New Topic" opens the New Topic drawer with
  `preselectedExpenseIds` set to the current selection.

---

## What does NOT change

- Expense entry, categorization, editing, sync, and balance math are
  completely untouched — a topic is purely an additional many-to-many tag
  on expenses that already exist. `useExpenses.ts`, `AddExpenseSheet.tsx`,
  the refund toggle, statement import — none of these files change.
- No mobile UI. Native gets stub routes only, per the platform-scope
  decision.
- No automatic tagging (e.g. "everything in this date range" auto-added on
  topic creation) — every membership is an explicit user action, via one of
  the two entry points. Auto-suggestion was considered and deferred; see
  Open Questions.

---

## Open Questions (for the implementation plan to resolve, not blocking this spec)

1. **"Tracked This Year" stat scope.** The mockup shows a single number;
   this spec defines it as "sum of every non-archived topic's total" but
   doesn't filter by the topic's own dates being *within* this year — a
   topic spanning Dec 2025–Jan 2026 would count its full total. Treated as
   acceptable for v1 (topics are short-lived trips/projects in practice;
   a lot of extra logic for an edge case), noted here so it's a conscious
   choice, not an oversight.