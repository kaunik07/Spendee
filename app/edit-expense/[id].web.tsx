// Web override of the Edit Expense route. In-app, editing opens as a
// right-side drawer straight from the Expenses list (no navigation) — this
// route only exists so a direct link / refresh on /edit-expense/<id> still
// works. It renders the same EditExpenseDrawer so the (money-handling)
// save logic lives in exactly one place; closing returns to the list.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import EditExpenseDrawer from '@/components/web/EditExpenseDrawer';

export default function EditExpenseScreenWeb() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <EditExpenseDrawer
      expenseId={id ?? null}
      visible
      onClose={() => router.replace('/expenses')}
    />
  );
}
