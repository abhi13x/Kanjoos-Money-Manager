import type { Account, AccountType, InvestmentSubType } from '@/db/schema';

// ─── iOS Typography Stack ──────────────────────────────────────────────
export const iOSFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Helvetica, Arial, sans-serif',
};

// ─── Constants ──────────────────────────────────────────────────
export const ACCOUNT_CATEGORIES: { label: string; types: AccountType[] }[] = [
  { label: 'Liquid Cash & Banking', types: ['cash', 'savings', 'wallet'] },
  { label: 'Borrowing & Credit Lines', types: ['credit_card', 'debit_card'] },
  { label: 'Loans & Mortgages', types: ['loan', 'mortgage'] }, // ✅ ADDED
  { label: 'Equities & Long Term Assets', types: ['mutual_fund', 'stock'] },
  { label: 'Deposits & Fixed Securities', types: ['fd_rd'] },
  { label: 'National Schemes', types: ['scheme'] },
];

export const SUB_TYPE_OPTIONS: Record<string, { value: InvestmentSubType; label: string }[]> = {
  fd_rd: [
    { value: 'fd', label: 'Fixed Deposit (FD)' },
    { value: 'rd', label: 'Recurring Deposit (RD)' },
  ],
  mutual_fund: [{ value: 'sip', label: 'SIP' }],
  stock: [{ value: 'lumpsum', label: 'Lump Sum' }],
  scheme: [
    { value: 'ppf', label: 'PPF' },
    { value: 'nps', label: 'NPS' },
    { value: 'epfo', label: 'EPFO' },
  ],
};

export const SUB_TYPE_LABELS: Record<InvestmentSubType, string> = {
  fd: 'FD',
  rd: 'RD',
  sip: 'SIP',
  lumpsum: 'Lump Sum',
  ppf: 'PPF',
  nps: 'NPS',
  epfo: 'EPFO',
};

// ─── Helpers ──────────────────────────────────────────────
export const needsMonthlyInvestment = (subType: InvestmentSubType | ''): boolean =>
  ['rd', 'sip', 'ppf', 'nps', 'epfo'].includes(subType);

export const needsRate = (type: AccountType): boolean =>
  ['mutual_fund', 'stock', 'fd_rd', 'scheme'].includes(type);

export const getAccountSignedBalance = (acc: Account): number =>
  acc.type === 'credit_card' ? -acc.currentBalance : acc.currentBalance;
