import { useAccountsContext } from './AccountsContext';
import { useAuthContext } from './AuthContext';
import { useCreditCardsContext } from './CreditCardsContext';
import { useExpenseContext } from './ExpenseContext';
import { Expense } from './useExpenses';
import { deleteAccountTransactionDirect } from './useAccountTransactions';
import { deleteCCTransactionDirect } from './useCreditCardTransactions';

/**
 * Provides deleteExpenseWithReversal — deletes an expense and reverses
 * any linked bank account withdrawal or credit card charge.
 */
export function useExpenseActions() {
  const { user, storageMode }        = useAuthContext();
  const { deleteExpense }            = useExpenseContext();
  const { accounts, updateAccount }  = useAccountsContext();
  const { cards, updateCard }        = useCreditCardsContext();

  const deleteExpenseWithReversal = async (expense: Expense) => {
    if (expense.paymentType === 'bank_account' && expense.paymentSourceId) {
      // Add the amount back to the bank account
      const account = accounts.find((a) => a.id === expense.paymentSourceId);
      if (account) {
        await updateAccount(account.id, account.name, account.balance + expense.amount);
      }
      // Remove the linked withdrawal transaction
      if (expense.linkedTransactionId && user?.id) {
        await deleteAccountTransactionDirect(user.id, storageMode, expense.linkedTransactionId);
      }
    } else if (expense.paymentType === 'credit_card' && expense.paymentSourceId) {
      // Subtract the charge back from the card's outstanding balance
      const card = cards.find((c) => c.id === expense.paymentSourceId);
      if (card) {
        await updateCard(card.id, card.name, card.outstandingBalance - expense.amount, card.creditLimit);
      }
      // Remove the linked charge transaction
      if (expense.linkedTransactionId && user?.id) {
        await deleteCCTransactionDirect(user.id, storageMode, expense.linkedTransactionId);
      }
    }

    await deleteExpense(expense.id);
  };

  return { deleteExpenseWithReversal };
}
