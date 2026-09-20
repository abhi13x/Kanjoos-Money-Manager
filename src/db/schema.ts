import Dexie, { type Table } from 'dexie';

export type AccountType =
  | 'cash'
  | 'savings'
  | 'wallet'
  | 'credit_card'
  | 'debit_card'
  | 'mutual_fund'
  | 'stock'
  | 'fd_rd'
  | 'scheme'
  | 'loan'      
  | 'mortgage'; 

export type InvestmentSubType = 'fd' | 'rd' | 'sip' | 'lumpsum' | 'ppf' | 'nps' | 'epfo';
export type CompoundingFrequency = 'monthly' | 'quarterly' | 'annually';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  // Convention: liability accounts (loan/mortgage/credit_card) hold a NEGATIVE
  // balance = outstanding debt; getAccountBalances() takes Math.abs().
  currentBalance: number;
  currency: string;
  updatedAt: number;
  repeatInvestmentDate?: number;
  interestRate?: number;        // loans: annual interest % p.a. (used by EMI calc)
  expectedReturnRate?: number;
  statementDate?: number;
  dueDate?: number;             // loans: next EMI due date
  monthlyInvestment?: number;
  startDate?: number;           // loans: first EMI due date
  tenureMonths?: number;        // loans: remaining tenure (used by EMI calc)
  investmentSubType?: InvestmentSubType;
  compoundingFrequency?: CompoundingFrequency;
  processingFee?: number;       // NEW: One-time upfront fee for loans (sub-units)
  color?: string;
  icon?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  parentId?: string | null;
  color?: string;
  icon?: string;
  updatedAt: number;
}

export interface Transaction {
  id: string;
  amount: number;
  date: number;
  type: 'expense' | 'income' | 'transfer';
  categoryId?: string;
  subCategoryId?: string;
  accountId?: string;
  toAccountId?: string;
  note?: string;
  description?: string;
  isRecurring?: boolean;
  repeatInterval?: string;
  // NEW: EMI Tracking fields
  loanAccountId?: string;       // Links this payment to a specific loan account
  installmentNumber?: number;   // Which EMI number this was (e.g., 1 of 12)
  updatedAt: number;
}

class KanjoosDatabase extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;

  constructor() {
    super('KanjoosDatabase');

    this.version(1).stores({
      accounts: 'id, type',
      categories: 'id, type, parentId, parentCategoryId',
      transactions: 'id, date, accountId, toAccountId, categoryId, isRecurring, [type+date], [categoryId+date], [accountId+date], [toAccountId+date]'
    });

    // v2: parentCategoryId was a redundant duplicate of parentId; fold any legacy
    // data into parentId and drop the extra field/index.
    this.version(2).stores({
      accounts: 'id, type',
      categories: 'id, type, parentId',
      transactions: 'id, date, accountId, toAccountId, categoryId, isRecurring, [type+date], [categoryId+date], [accountId+date], [toAccountId+date]'
    }).upgrade(async (tx) => {
      await tx.table('categories').toCollection().modify((cat: Category & { parentCategoryId?: string | null }) => {
        if (!cat.parentId && cat.parentCategoryId) {
          cat.parentId = cat.parentCategoryId;
        }
        delete cat.parentCategoryId;
      });
    });

    // v3: Added indexes to support querying upcoming loan EMIs and tracking 
    // which loan account a transaction belongs to.
    this.version(3).stores({
      accounts: 'id, type, dueDate, tenureMonths',
      categories: 'id, type, parentId',
      transactions: 'id, date, accountId, toAccountId, categoryId, loanAccountId, isRecurring, [type+date], [categoryId+date], [accountId+date], [toAccountId+date], [loanAccountId+date]'
    });
  }

  async seedDefaultCategories(): Promise<void> {
    const SEEDED_FLAG_KEY = 'kanjoos_categories_seeded';
    try {
      if (localStorage.getItem(SEEDED_FLAG_KEY) === 'true') return;
    } catch {
      // localStorage unavailable (e.g. private browsing); fall back to the count check below
    }

    const existingCount = await this.categories.count();

    const now = Date.now();
    const defaultCategories: Category[] = [
      { id: 'cat-salary', name: 'Salary', type: 'income', icon: 'briefcase', color: '#10B981', updatedAt: now },
      { id: 'cat-investments', name: 'Investment Returns', type: 'income', icon: 'trending-up', color: '#3B82F6', updatedAt: now },
      { id: 'cat-freelance', name: 'Freelance & Side Hustles', type: 'income', icon: 'laptop', color: '#8B5CF6', updatedAt: now },
      { id: 'cat-income-other', name: 'Other Income', type: 'income', icon: 'dollar-sign', color: '#6B7280', updatedAt: now },
      { id: 'cat-food', name: 'Food & Dining', type: 'expense', icon: 'utensils', color: '#F59E0B', updatedAt: now },
      { id: 'cat-groceries', name: 'Groceries', type: 'expense', icon: 'shopping-cart', color: '#10B981', updatedAt: now },
      { id: 'cat-rent', name: 'Rent & Housing', type: 'expense', icon: 'home', color: '#EF4444', updatedAt: now },
      { id: 'cat-utilities', name: 'Bills & Utilities', type: 'expense', icon: 'zap', color: '#6366F1', updatedAt: now },
      { id: 'cat-transport', name: 'Fuel & Transport', type: 'expense', icon: 'navigation', color: '#EC4899', updatedAt: now },
      { id: 'cat-shopping', name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#8B5CF6', updatedAt: now },
      { id: 'cat-entertainment', name: 'Entertainment & OTT', type: 'expense', icon: 'film', color: '#A855F7', updatedAt: now },
      { id: 'cat-netflix', name: 'Netflix', type: 'expense', parentId: 'cat-entertainment', color: '#E50914', icon: 'tv', updatedAt: now },
      { id: 'cat-medical', name: 'Medical & Healthcare', type: 'expense', icon: 'activity', color: '#06B6D4', updatedAt: now },
      { id: 'cat-loan-interest', name: 'Loan Interest & GST', type: 'expense', icon: 'percent', color: '#F43F5E', updatedAt: now }, // NEW: Useful for EMI expenses
      { id: 'cat-expense-other', name: 'Miscellaneous', type: 'expense', icon: 'more-horizontal', color: '#9CA3AF', updatedAt: now }
    ];

    // Only seed on a genuinely empty, never-before-seeded database — otherwise a user who
    // intentionally deletes every category would have the defaults silently restored.
    if (existingCount === 0) {
      await this.categories.bulkPut(defaultCategories);
    }

    try {
      localStorage.setItem(SEEDED_FLAG_KEY, 'true');
    } catch {
      // Ignore write failures; worst case we re-check the count next launch
    }
  }
}

export const db = new KanjoosDatabase();