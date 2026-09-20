import { db, type Account, type Transaction } from '@/db/schema';
import { GDriveSyncService, recordDeletedTransactionId } from '@/services/gdriveSync';

// NOTE: 'loan' and 'mortgage' now exist on AccountType in schema.ts — previously
// these entries were unreachable dead code. 'liability' is kept only as a
// defensive catch-all for any legacy/foreign data.
const LIABILITY_TYPES = new Set(['credit_card', 'loan', 'mortgage', 'liability']);

const updateAccountBalance = async (accountId: string | undefined, delta: number): Promise<void> => {
  if (!accountId) return;
  const acc = await db.accounts.get(accountId);
  if (acc) {
    const currentVal = acc.currentBalance ?? acc.initialBalance ?? 0;
    const updatedVal = Math.round(currentVal + delta);
    await db.accounts.update(accountId, { currentBalance: updatedVal, updatedAt: Date.now() });
  }
};

const adjustTransactionBalances = async (
  tx: Partial<Transaction>,
  direction: 1 | -1
): Promise<void> => {
  const amount = (tx.amount ?? 0) * direction;

  if (tx.type === 'income' && tx.accountId) {
    await updateAccountBalance(tx.accountId, amount);
  } else if (tx.type === 'expense' && tx.accountId) {
    await updateAccountBalance(tx.accountId, -amount);
  } else if (tx.type === 'transfer' && tx.accountId) {
    // FIX: sequential on purpose — a self-transfer updates the same row twice,
    // and parallel read-modify-writes would race and silently lose one update.
    await updateAccountBalance(tx.accountId, -amount);
    if (tx.toAccountId) {
      await updateAccountBalance(tx.toAccountId, amount);
    }
  }
};

export const addTransaction = async (transactionData: Omit<Transaction, 'id'>): Promise<Transaction> => {
  return await db.transaction('rw', [db.transactions, db.accounts], async () => {
    const id = crypto.randomUUID();
    const transaction = { ...transactionData, id, updatedAt: Date.now() } as Transaction;
    await db.transactions.add(transaction);
    await adjustTransactionBalances(transaction, 1);
    return transaction;
  });
};

const triggerOutboundSync = async (): Promise<void> => {
  try {
    const syncService = GDriveSyncService.getInstance();
    // Use stored credentials (not just a currently-valid token) so a sync is still
    // attempted, and silently renewed, if the access token expired since last use
    if (syncService.hasStoredCredentials()) {
      // Full bidirectional sync – pulls remote, merges, then pushes
      await syncService.sync();
    }
  } catch (e) {
    console.warn('Background sync failed:', e);
  }
};

export const addTransactionWithSync = async (transactionData: Omit<Transaction, 'id'>): Promise<Transaction> => {
  const tx = await addTransaction(transactionData);
  triggerOutboundSync();
  return tx;
};

export const updateTransaction = async (id: string, updateData: Partial<Transaction>): Promise<Transaction> => {
  return await db.transaction('rw', [db.transactions, db.accounts], async () => {
    const oldTx = await db.transactions.get(id);
    if (!oldTx) throw new Error('Transaction not found');

    await adjustTransactionBalances(oldTx, -1);

    const newTx: Transaction = { ...oldTx, ...updateData, id, updatedAt: Date.now() };
    await db.transactions.update(id, newTx);

    await adjustTransactionBalances(newTx, 1);

    return newTx;
  });
};

export const updateTransactionWithSync = async (id: string, transactionData: Partial<Transaction>): Promise<Transaction> => {
  const updatedTx = await updateTransaction(id, transactionData);
  triggerOutboundSync();
  return updatedTx;
};

export const deleteTransaction = async (id: string): Promise<void> => {
  return await db.transaction('rw', [db.transactions, db.accounts], async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction) throw new Error('Transaction not found');

    await adjustTransactionBalances(transaction, -1);
    await db.transactions.delete(id);
    recordDeletedTransactionId(id);
  });
};

export const deleteTransactionWithSync = async (id: string): Promise<void> => {
  await deleteTransaction(id);
  triggerOutboundSync();
};

// Cascade-deletes any transactions referencing this account so none are left dangling.
export const deleteAccount = async (accountId: string): Promise<void> => {
  return await db.transaction('rw', [db.transactions, db.accounts], async () => {
    const linkedTransactions = await db.transactions
      .filter(t => t.accountId === accountId || t.toAccountId === accountId)
      .toArray();

    for (const tx of linkedTransactions) {
      // FIX: revert the balance effect BEFORE deleting, so the OTHER account
      // involved (the far side of a transfer) stays consistent. Updating the
      // account being deleted is harmless — it's removed right after.
      await adjustTransactionBalances(tx, -1);
      await db.transactions.delete(tx.id);
      recordDeletedTransactionId(tx.id);
    }

    await db.accounts.delete(accountId);
    recordDeletedTransactionId(accountId);
  });
};

export const deleteAccountWithSync = async (accountId: string): Promise<void> => {
  await deleteAccount(accountId);
  triggerOutboundSync();
};

export const countTransactionsForAccount = async (accountId: string): Promise<number> => {
  return db.transactions.filter(t => t.accountId === accountId || t.toAccountId === accountId).count();
};

export const getAccountBalances = async () => {
  const accounts = await db.accounts.toArray();

  let assets = 0;
  let liabilities = 0;
  let retirementAssets = 0;

  for (const account of accounts) {
    const balance = account.currentBalance ?? account.initialBalance ?? 0;
    const type = account.type ?? '';

    if (LIABILITY_TYPES.has(type)) {
      liabilities += Math.abs(balance);
    } else {
      assets += balance;
      if (type === 'scheme') {
        retirementAssets += balance;
      }
    }
  }

  return { assets, liabilities, retirementAssets, netWorth: assets - liabilities };
};

export const getMonthlyCategoryBreakdown = async (year: number, month: number) => {
  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0).getTime();
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

  const transactions = await db.transactions
    .where('date')
    .between(startOfMonth, endOfMonth, true, true)
    .filter(t => t.type === 'expense')
    .toArray();

  const breakdown: Record<string, number> = {};

  transactions.forEach(t => {
    const targetKey = t.categoryId || 'uncategorized';
    breakdown[targetKey] = Math.round((breakdown[targetKey] || 0) + (t.amount || 0));
  });

  return Object.entries(breakdown).map(([categoryId, total]) => ({
    categoryId,
    total,
  }));
};

// ---------------------------------------------------------------------------
// EMI with GST
//
// In India, GST (currently 18%) is levied on the *interest* component of an
// EMI (and on fees like processing charges) — NOT on the principal. Each
// installment is therefore:  principal + interest + GST(18% of interest).
//
// All amounts are integer sub-units ("cents": paise for INR, whole yen for
// JPY, fils for KWD). Convert at the boundaries with toCents()/fromCents();
// the math itself is currency-agnostic.
// ---------------------------------------------------------------------------

export interface EMIInstallment {
  installmentNumber: number;
  dueDate: number;           // epoch ms
  openingBalance: number;    // sub-units
  principal: number;         // sub-units
  interest: number;          // sub-units
  gst: number;               // sub-units — GST on the interest component
  closingBalance: number;    // sub-units
  totalDue: number;          // sub-units — principal + interest + gst
}

export interface EMICalculationInput {
  principal: number;           // sub-units — output of toCents()
  annualInterestRate: number;  // e.g. 11.25 means 11.25% p.a.
  tenureMonths: number;
  gstRate?: number;            // percent, default 18
  processingFee?: number;      // sub-units, one-time upfront fee (GST applies to it)
  startDate?: number | Date;   // first due date, default today
}

export interface EMICalculationResult {
  emi: number;                   // rounded EMI (principal + interest)
  gstOnFirstInstallment: number;
  firstInstallmentTotal: number; // emi + first month's GST
  totalPrincipal: number;
  totalInterest: number;
  gstOnInterest: number;
  processingFee: number;
  gstOnProcessingFee: number;
  totalGst: number;              // GST on interest + processing fee
  totalAmountPayable: number;    // principal + interest + all GST + fee
  schedule: EMIInstallment[];
}

/** Standard reducing-balance EMI formula: P·r·(1+r)^n / ((1+r)^n − 1). Returns sub-units, rounded. */
export const calculateEMI = (
  principal: number,
  annualInterestRate: number,
  tenureMonths: number
): number => {
  if (principal <= 0) throw new Error('Principal must be positive');
  if (!Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    throw new Error('Tenure must be a positive whole number of months');
  }

  const monthlyRate = annualInterestRate / 12 / 100;
  if (monthlyRate === 0) return Math.round(principal / tenureMonths); // 0% interest

  const compound = Math.pow(1 + monthlyRate, tenureMonths);
  return Math.round((principal * monthlyRate * compound) / (compound - 1));
};

/** Adds months to a date, clamping to month-end (Jan 31 + 1 month → Feb 28/29). */
const addMonthsClamped = (date: Date, months: number): Date => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
};

export const calculateEMIWithGST = (input: EMICalculationInput): EMICalculationResult => {
  const {
    principal,
    annualInterestRate,
    tenureMonths,
    gstRate = 18,
    processingFee = 0,
    startDate = new Date(),
  } = input;

  if (principal <= 0) throw new Error('Principal must be positive');
  if (tenureMonths <= 0) throw new Error('Tenure must be at least 1 month');
  if (gstRate < 0) throw new Error('GST rate cannot be negative');

  const monthlyRate = annualInterestRate / 12 / 100;
  const gstMultiplier = gstRate / 100;
  const emi = calculateEMI(principal, annualInterestRate, tenureMonths);
  const firstDue = startDate instanceof Date ? new Date(startDate.getTime()) : new Date(startDate);

  const schedule: EMIInstallment[] = [];
  let balance = principal;
  let totalInterest = 0;
  let gstOnInterest = 0;

  for (let i = 1; i <= tenureMonths; i++) {
    const isLast = i === tenureMonths;
    const interest = Math.round(balance * monthlyRate);
    const gst = Math.round(interest * gstMultiplier);

    // The final installment absorbs sub-unit rounding drift so the sum of all
    // principal components equals the loan amount exactly.
    const principalPart = isLast
      ? balance
      : Math.max(0, Math.min(emi - interest, balance));

    schedule.push({
      installmentNumber: i,
      dueDate: addMonthsClamped(firstDue, i - 1).getTime(),
      openingBalance: balance,
      principal: principalPart,
      interest,
      gst,
      closingBalance: balance - principalPart,
      totalDue: principalPart + interest + gst,
    });

    balance -= principalPart;
    totalInterest += interest;
    gstOnInterest += gst;
  }

  const gstOnProcessingFee = Math.round(processingFee * gstMultiplier);

  return {
    emi,
    gstOnFirstInstallment: schedule[0].gst,
    firstInstallmentTotal: schedule[0].totalDue,
    totalPrincipal: principal,
    totalInterest,
    gstOnInterest,
    processingFee,
    gstOnProcessingFee,
    totalGst: gstOnInterest + gstOnProcessingFee,
    totalAmountPayable: principal + totalInterest + gstOnInterest + processingFee + gstOnProcessingFee,
    schedule,
  };
};

/**
 * Convenience: computes the EMI schedule straight from a loan-style Account,
 * reusing existing schema fields (no new columns needed):
 *   - currentBalance / initialBalance → outstanding principal (sign ignored)
 *   - interestRate  → annual rate, % p.a.
 *   - tenureMonths  → remaining tenure
 *   - startDate / dueDate → first / next due date
 */
export const calculateEMIForAccount = (account: Account, gstRate = 18): EMICalculationResult => {
  if (!LIABILITY_TYPES.has(account.type)) {
    throw new Error(`Account type "${account.type}" is not a liability account`);
  }

  const outstanding = Math.abs(account.currentBalance ?? account.initialBalance ?? 0);
  if (outstanding <= 0) {
    throw new Error('Account has no outstanding balance to amortize');
  }
  if (!account.tenureMonths || account.tenureMonths <= 0) {
    throw new Error('Account is missing tenureMonths');
  }

  return calculateEMIWithGST({
    principal: outstanding,
    annualInterestRate: account.interestRate ?? 0,
    tenureMonths: account.tenureMonths,
    gstRate,
    processingFee: account.processingFee ?? 0, // <-- ADD THIS
    startDate: account.startDate ?? account.dueDate ?? new Date(),
  });
};

export interface EMIPaymentInput {
  installment: EMIInstallment;
  /** Account the EMI is paid from (e.g. savings). */
  accountId: string;
  categoryId?: string;
  subCategoryId?: string;
  note?: string;
  description?: string;
  /**
   * Optional liability account (loan / mortgage / credit_card). When provided,
   * the payment is booked as two transactions:
   *   1. a transfer of the principal portion INTO the loan account — this
   *      reduces the outstanding debt, assuming liability balances are stored
   *      NEGATIVE (the convention getAccountBalances() implies via Math.abs);
   *   2. an expense for interest + GST.
   * When omitted, the full installment is recorded as a single expense.
   */
  loanAccountId?: string;
}

export const addEMIPayment = async (input: EMIPaymentInput): Promise<Transaction[]> => {
  const { installment, accountId, categoryId, subCategoryId, note, description, loanAccountId } = input;

  const shared = {
    note,
    description,
    date: installment.dueDate,
    loanAccountId, // <-- ADD THIS to link transactions to the loan
    installmentNumber: installment.installmentNumber, // <-- ADD THIS
    updatedAt: Date.now(),
  };

  if (loanAccountId) {
    const transferTx = await addTransaction({
      ...shared,
      type: 'transfer',
      amount: installment.principal,
      accountId,
      toAccountId: loanAccountId,
      // Transfers don't need categories
      categoryId: undefined, 
      subCategoryId: undefined,
    });

    const expenseTx = await addTransaction({
      ...shared,
      type: 'expense',
      amount: installment.interest + installment.gst,
      accountId,
      categoryId,
      subCategoryId,
    });

    return [transferTx, expenseTx];
  }

  const tx = await addTransaction({
    ...shared,
    type: 'expense',
    amount: installment.totalDue,
    accountId,
  });

  return [tx];
};

export const addEMIPaymentWithSync = async (input: EMIPaymentInput): Promise<Transaction[]> => {
  const transactions = await addEMIPayment(input);
  triggerOutboundSync();
  return transactions;
};

export { formatCurrency, toCents, fromCents } from '@/types/finance';