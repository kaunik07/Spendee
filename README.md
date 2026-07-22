# Spendee — Personal Finance Tracker

A full-featured personal finance app built with React Native and Expo. Track expenses, manage bank accounts and credit cards, and log savings — all in one place.

---

## Features

- **Home** — Card dashboard: net worth, total invested, today's spending, top category this month, and pinned budget progress.
- **Expenses** — Add and categorize daily expenses across 14 categories, with optional subcategories (e.g. Transport → Flight with airline/route/date, Food & Drink → Dining with restaurant/location). Offline airport-code search and OpenStreetMap place search built in. Link payments to a bank account or credit card.
- **Budgets** — Set monthly spending limits per category with live progress bars synced to your expenses, an on-pace indicator, and over-budget alerts.
- **Savings** — Log money you chose not to spend and watch your savings jar grow.
- **Bank Accounts** — Manage account balances with full deposit and withdrawal history.
- **Credit Cards** — Track outstanding balances, charges, and payments. Payments can auto-deduct from a linked bank account.
- **Summary** — Calendar view with daily expense breakdowns and monthly totals.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 |
| Routing | Expo Router v6 (file-based) |
| Backend | Supabase (PostgreSQL + Realtime + Auth) |
| State | React Context API + custom hooks |
| UI | GorhomBottomSheet, React Native Reanimated |
| Charts | Pure React Native Views (progress bars, calendar heatmap) |
| Auth | Expo Local Authentication (Face ID / fingerprint) |
| Language | TypeScript 5.9 |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (for online mode)
- iOS Simulator / Android Emulator or a physical device with Expo Go

### Installation

```bash
git clone https://github.com/kaunik6/Spendee.git
cd Spendee
npm install
```

### Environment & backend config

Two sources of config, with a **clear precedence you must respect**:

| Where | Used by | Notes |
|---|---|---|
| `.env` (local, gitignored) | `npm start` / Expo dev | Local development only |
| **EAS Environment Variables** | `eas build` | **Override `.env` at build time — the source of truth for real builds** |

The two Supabase keys are `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Because `EXPO_PUBLIC_*` values are compiled into the app bundle, keep them **plaintext** (not "secret") in EAS so they're auditable — inspect with:

```bash
eas env:list --environment production --format long
```

> ⚠️ If a build's runtime backend looks wrong despite a correct `.env`, check `eas env:list` **first** — server-side EAS variables win over `.env`. The login screen also prints the live backend + build info at the bottom (see below).

Each `eas.json` build profile declares its environment explicitly (`development` / `preview` / `production`), so which backend a build targets is readable, not guessed.

### Database Setup (Online Mode)

The schema is a **version-controlled Supabase migration** (`supabase/migrations/`) — the single source of truth. Never hand-run SQL in the dashboard; every change is a migration so environments stay reproducible. Provision a fresh project in two commands:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates every table plus the new-user profile trigger, `delete_user` RPC, RLS policies, realtime publication, and indexes. Afterwards, in the dashboard set **Authentication → Sign In/Up → Confirm email → OFF** (the app uses synthetic `username@spendee.app` emails).

### Build info / diagnostics

The bottom of the login screen shows `backend: <project> · <profile> · v<version> (<build>) · <gitSha>` so you can confirm exactly which backend and build any device is running, without rebuilding to investigate. Long-press it to reset a stuck local session.

### Run

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

---

## Guest-first, upgrade to an account

Spendee opens straight into a usable **guest** session — no sign-up wall. Guest data is stored on-device (AsyncStorage) with client-generated UUIDs.

Whenever you want backup / multi-device sync, tap **Back up to cloud** (Profile, Settings, or the Home banner). That creates a Supabase account and **migrates your existing on-device data up into it** — nothing is lost. From then on you're online: real-time sync across devices and biometric login. **Log in** switches an already-registered account onto the device (guest data is left untouched).

**Offline-first sync engine:** in online mode, every write goes through an ordered operation queue and applies optimistically. Add/edit/delete an expense offline — including one paid from a bank account or credit card (the linked transaction and balance change queue as a bundle) — and it all auto-syncs when connectivity returns. Replay is idempotent (client-generated ids), and balances are applied as server-side **deltas** (`adjust_*_balance` RPCs guarded by an op-id ledger), so concurrent writes from multiple devices compose correctly instead of clobbering each other; same-row edits are last-write-wins.

Under the hood there's still one `local` and one `online` mode, but the user never chooses — guest = local, account = online, and the upgrade is a one-way local→cloud migration.

---

## Project Structure

```
app/
  (tabs)/              → Bottom tab screens (Home, Expense, Budget, Savings, Summary)
  account/[id].tsx     → Bank account detail
  credit-card/[id].tsx → Credit card detail
  login.tsx / signup.tsx / profile.tsx / settings.tsx

components/            → Bottom sheet modals for all CRUD actions
store/                 → React Context providers and custom hooks
lib/                   → Supabase client
constants/             → Theme, colors, categories, currencies
supabase/              → SQL schema files
```

---

## Distribution

The app is configured for EAS Build. To build for TestFlight:

```bash
eas build --platform ios --profile testflight
eas submit --platform ios --latest
```

---

## License

MIT
