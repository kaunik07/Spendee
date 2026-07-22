import * as Crypto from 'expo-crypto';
import { useAccountsContext } from './AccountsContext';
import { useAuthContext } from './AuthContext';
import { useCreditCardsContext } from './CreditCardsContext';
import { useExpenseContext } from './ExpenseContext';
import { Expense } from './useExpenses';
import { deleteAccountTransactionDirect } from './useAccountTransactions';
import { deleteCCTransactionDirect } from './useCreditCardTransactions';
import { SyncOp } from './syncQueue';

const opId = () => Crypto.randomUUID();

/**
 * Provides deleteExpenseWithReversal — deletes an expense and reverses any
 * linked bank withdrawal / credit-card charge.
 *
 * Online: the reversal (refund the balance via a delta + delete the linked
 * transaction) is queued together with the expense delete, so it's offline-safe
 * and idempotent. Local (guest): writes directly to on-device storage.
 */
export function useExpenseActions() {
  const { user, storageMode }        = useAuthContext();
  const { deleteExpense }            = useExpenseContext();
  const { accounts, updateAccount }  = useAccountsContext();
  const { cards, updateCard }        = useCreditCardsContext();

  const deleteExpenseWithReversal = async (expense: Expense) => {
    const bundle: SyncOp[] = [];

    if (expense.paymentType === 'bank_account' && expense.paymentSourceId) {
      if (storageMode === 'online') {
        bundle.push({ id: opId(), kind: 'balanceAccount', accountId: expense.paymentSourceId, delta: expense.amount });
        if (expense.linkedTransactionId) {
          bundle.push({ id: opId(), kind: 'delete', table: 'account_transactions', rowId: expense.linkedTransactionId });
        }
      } else {
        const account = accounts.find((a) => a.id === expense.paymentSourceId);
        if (account) await updateAccount(account.id, account.name, account.balance + expense.amount);
        if (expense.linkedTransactionId && user?.id) {
          await deleteAccountTransactionDirect(user.id, storageMode, expense.linkedTransactionId);
        }
      }
    } else if (expense.paymentType === 'credit_card' && expense.paymentSourceId) {
      if (storageMode === 'online') {
        bundle.push({ id: opId(), kind: 'balanceCard', cardId: expense.paymentSourceId, delta: -expense.amount });
        if (expense.linkedTransactionId) {
          bundle.push({ id: opId(), kind: 'delete', table: 'credit_card_transactions', rowId: expense.linkedTransactionId });
        }
      } else {
        const card = cards.find((c) => c.id === expense.paymentSourceId);
        if (card) await updateCard(card.id, card.name, card.outstandingBalance - expense.amount, card.creditLimit);
        if (expense.linkedTransactionId && user?.id) {
          await deleteCCTransactionDirect(user.id, storageMode, expense.linkedTransactionId);
        }
      }
    }

    await deleteExpense(expense.id, bundle);
  };

  return { deleteExpenseWithReversal };
}
