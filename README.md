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

### Environment Setup

Create a `.env` file in the root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup (Online Mode)

Run `supabase/schema.sql` in your Supabase SQL editor — it creates every table the app uses (expenses, budgets, savings, accounts, credit cards) with row-level security.

### Run

```bash
npm start
```

Then press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

---

## Storage Modes

Spendee supports two storage modes, chosen at sign-up:

- **Local** — All data stored on-device using AsyncStorage. Works fully offline. No account needed beyond a local username/password.
- **Online** — Data synced to Supabase with real-time updates across devices. Supports biometric login (Face ID / fingerprint). Expenses added while offline are queued locally and auto-sync to the cloud when connectivity returns.

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
