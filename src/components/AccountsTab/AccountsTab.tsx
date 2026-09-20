import React, { useState, useMemo, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Typography,
} from '@mui/material';
import { db, type Account, type AccountType, type InvestmentSubType, type CompoundingFrequency } from '@/db/schema';
import { projectInvestment, resolveInvestmentSubType } from '@/services/investmentService';
import { deleteAccountWithSync, countTransactionsForAccount } from '@/services/financeService';
import { toCents, fromCents } from '@/types/finance';
import { useSettings } from '@/hooks/useSettings';
import { iOSFont, glassSx } from '@/theme/glass';
import { ACCOUNT_CATEGORIES, SUB_TYPE_OPTIONS, getAccountSignedBalance, needsRate } from './features/accountHelpers';
import { AccountsHeader } from './views/AccountsHeader';
import { AccountList } from './views/AccountList';
import { AccountFormDrawer, type AccountFormValues } from './views/AccountFormDrawer';
import { EMIPaymentDialog } from './views/EMIPaymentDialog';

interface AccountsTabProps {
  accounts: Account[];
  format: (cents: number) => string;
}

/** Types where a negative balance is meaningful (outstanding debt). */
const LIABILITY_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set(['credit_card', 'loan', 'mortgage']);
const INVESTMENT_TYPES: ReadonlyArray<AccountType> = ['mutual_fund', 'stock', 'fd_rd', 'scheme'];
const LOAN_TYPES: ReadonlyArray<AccountType> = ['loan', 'mortgage'];

interface DeleteConfirmation {
  accountId: string;
  accountName: string;
  linkedCount: number;
}

export const AccountsTab: React.FC<AccountsTabProps> = ({ accounts, format }) => {
  // ─── State ──────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteConfirmation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // FIX: Added missing EMI state
  const [emiTarget, setEmiTarget] = useState<Account | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('savings');
  const [balance, setBalance] = useState('');
  const [repeatDay, setRepeatDay] = useState('');
  const [interest, setInterest] = useState('');
  const [ccStatement, setCcStatement] = useState('');
  const [ccDue, setCcDue] = useState('');
  const [monthlyInvestment, setMonthlyInvestment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [investmentSubType, setInvestmentSubType] = useState<InvestmentSubType | ''>('');
  const [compoundingFrequency, setCompoundingFrequency] = useState<CompoundingFrequency>('quarterly');

  // FIX: currency was hardcoded 'INR' on save — use the user's preference for
  // new accounts (existing accounts keep their own currency on edit).
  const { defaultCurrency } = useSettings();

  // ─── Computed Values ────────────────────────────────────────
  const totalNetWorthCents = useMemo(
    () => accounts.reduce((sum, acc) => sum + getAccountSignedBalance(acc), 0),
    [accounts]
  );

  const categorizedAccounts = useMemo(
    () =>
      ACCOUNT_CATEGORIES.map((cat) => ({
        ...cat,
        accounts: accounts.filter((acc) => cat.types.includes(acc.type)),
      })),
    [accounts]
  );

  const accountData = useMemo(() => {
    return accounts.map((acc) => ({
      account: acc,
      projection: projectInvestment(acc),
      subType: resolveInvestmentSubType(acc),
    }));
  }, [accounts]);

  // ─── Handlers ─────────────────────────────────────────
  const resetForm = useCallback(() => {
    setName('');
    setType('savings');
    setBalance('');
    setRepeatDay('');
    setInterest('');
    setCcStatement('');
    setCcDue('');
    setMonthlyInvestment('');
    setStartDate('');
    setTenureMonths('');
    setInvestmentSubType('');
    setCompoundingFrequency('quarterly');
  }, []);

  const openAddMode = useCallback(() => {
    setEditingAccount(null);
    resetForm();
    setIsOpen(true);
  }, [resetForm]);

  const openEditMode = useCallback((acc: Account) => {
    setEditingAccount(acc);
    setName(acc.name);
    setType(acc.type);
    setBalance(fromCents(acc.currentBalance, acc.currency).toString());
    setRepeatDay(acc.repeatInvestmentDate?.toString() || '');
    setInterest((acc.interestRate ?? acc.expectedReturnRate)?.toString() || '');
    setCcStatement(acc.statementDate?.toString() || '');
    setCcDue(acc.dueDate?.toString() || '');
    setMonthlyInvestment(acc.monthlyInvestment ? fromCents(acc.monthlyInvestment, acc.currency).toString() : '');
    setStartDate(acc.startDate ? new Date(acc.startDate).toISOString().slice(0, 10) : '');
    setTenureMonths(acc.tenureMonths?.toString() || '');
    setInvestmentSubType(acc.investmentSubType ?? resolveInvestmentSubType(acc) ?? '');
    setCompoundingFrequency(acc.compoundingFrequency ?? 'quarterly');
    setIsOpen(true);
  }, []);

  // FIX: Added missing EMI handler
  const handlePayEMI = useCallback((acc: Account) => {
    setEmiTarget(acc);
  }, []);

  const handleTypeChange = useCallback((newType: AccountType) => {
    setType(newType);
    const options = SUB_TYPE_OPTIONS[newType];
    if (options?.length === 1) {
      setInvestmentSubType(options[0].value);
    } else if (!options) {
      setInvestmentSubType('');
    }
  }, []);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      if (!name.trim()) {
        setError('Please enter an account name.');
        return;
      }

      const currency = editingAccount?.currency ?? defaultCurrency;
      const parsedBal = parseFloat(balance);
      if (isNaN(parsedBal)) {
        setError('Please enter a valid balance.');
        return;
      }
      if (!LIABILITY_ACCOUNT_TYPES.has(type) && parsedBal < 0) {
        setError('Balance cannot be negative for this account type.');
        return;
      }
      const balCents = toCents(parsedBal, currency);

      const data: Partial<Account> = {
        name: name.trim(),
        type,
        currentBalance: balCents,
        initialBalance: editingAccount ? editingAccount.initialBalance : balCents,
        currency,
        updatedAt: Date.now(),

        repeatInvestmentDate: undefined,
        investmentSubType: undefined,
        tenureMonths: undefined,
        startDate: undefined,
        monthlyInvestment: undefined,
        interestRate: undefined,
        expectedReturnRate: undefined,
        compoundingFrequency: undefined,
        statementDate: undefined,
        dueDate: undefined,
      };

      if (INVESTMENT_TYPES.includes(type)) {
        data.repeatInvestmentDate = parseInt(repeatDay, 10) || undefined;
        data.investmentSubType = investmentSubType || undefined;
        data.tenureMonths = parseInt(tenureMonths, 10) || undefined;
        data.startDate = startDate ? new Date(startDate).getTime() : undefined;
        const parsedMonthly = parseFloat(monthlyInvestment);
        data.monthlyInvestment = !isNaN(parsedMonthly) && parsedMonthly > 0
          ? toCents(parsedMonthly, currency)
          : undefined;
      } else if (LOAN_TYPES.includes(type)) {
        data.tenureMonths = parseInt(tenureMonths, 10) || undefined;
        data.startDate = startDate ? new Date(startDate).getTime() : undefined;
      }

      if (needsRate(type) || LOAN_TYPES.includes(type)) {
        const rate = parseFloat(interest);
        if (!isNaN(rate)) {
          if (type === 'mutual_fund' || type === 'stock') {
            data.expectedReturnRate = rate;
          } else {
            data.interestRate = rate;
          }
        }
      }

      if (type === 'fd_rd' && investmentSubType === 'fd') {
        data.compoundingFrequency = compoundingFrequency;
      }

      if (type === 'credit_card') {
        data.statementDate = parseInt(ccStatement, 10) || undefined;
        data.dueDate = parseInt(ccDue, 10) || undefined;
      }

      try {
        if (editingAccount) {
          await db.accounts.update(editingAccount.id, data);
          setSuccess('Account updated successfully.');
        } else {
          const payload = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined)
          ) as Partial<Account>;
          await db.accounts.add({ ...payload, id: crypto.randomUUID() } as Account);
          setSuccess('Account added successfully.');
        }
        setIsOpen(false);
        setEditingAccount(null);
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save account.');
        console.error('Save error:', err);
      }
    },
    [
      name, type, balance, repeatDay, interest, ccStatement, ccDue,
      monthlyInvestment, startDate, tenureMonths, investmentSubType,
      compoundingFrequency, editingAccount, defaultCurrency, resetForm,
    ]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const linkedCount = await countTransactionsForAccount(id);
        const account = accounts.find((a) => a.id === id);
        setDeleteTarget({
          accountId: id,
          accountName: account?.name ?? 'This account',
          linkedCount,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check linked transactions.');
        console.error('Delete check error:', err);
      }
    },
    [accounts]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteAccountWithSync(deleteTarget.accountId);
      setSuccess('Account deleted.');
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account.');
      console.error('Delete error:', err);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  const formValues: AccountFormValues = {
    name, type, balance, repeatDay, interest, ccStatement, ccDue,
    monthlyInvestment, startDate, tenureMonths, investmentSubType, compoundingFrequency,
  };

  // ─── Render ──────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 4, ...iOSFont }}>
      <AccountsHeader totalNetWorthCents={totalNetWorthCents} format={format} onAddClick={openAddMode} />

      <AccountList
        accounts={accounts}
        categorizedAccounts={categorizedAccounts}
        accountData={accountData}
        format={format}
        onEdit={openEditMode}
        onDelete={handleDelete}
        onPayEMI={handlePayEMI} 
      />

      <AccountFormDrawer
        isOpen={isOpen}
        editingAccount={editingAccount}
        values={formValues}
        setters={{
          setName, setBalance, setRepeatDay, setInterest, setCcStatement, setCcDue,
          setMonthlyInvestment, setStartDate, setTenureMonths, setInvestmentSubType, setCompoundingFrequency,
        }}
        onTypeChange={handleTypeChange}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
      />

      {/* Delete confirmation — glass dialog (replaces window.confirm) */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          backdrop: {
            sx: { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' },
          },
          paper: {
            elevation: 0,
            sx: (t) => ({
              borderRadius: '28px',
              ...glassSx(t, 0.85),
              ...iOSFont,
            }),
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', px: 3, pt: 3 }}>
          Delete account?
        </DialogTitle>
        <DialogContent sx={{ px: 3 }}>
          <Typography sx={{ color: '#8E8E93', fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
            {deleteTarget && (
              <>
                <strong>{deleteTarget.accountName}</strong> will be permanently deleted.
                {deleteTarget.linkedCount > 0 && (
                  <>
                    {' '}
                    Its <strong>{deleteTarget.linkedCount}</strong> linked transaction(s) will be deleted too.
                  </>
                )}
              </>
            )}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={isDeleting}
            sx={{ textTransform: 'none', fontWeight: 700, color: '#007AFF', borderRadius: '12px', px: 2.5 }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            disabled={isDeleting}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              color: '#fff',
              bgcolor: '#FF3B30',
              borderRadius: '12px',
              px: 2.5,
              boxShadow: '0 8px 20px rgba(255, 59, 48, 0.35)',
              '&:hover': { bgcolor: '#E5342B' },
              '&:active': { transform: 'scale(0.97)' },
              transition: 'background-color 0.2s ease-in-out, transform 0.15s ease-in-out',
            }}
          >
            {isDeleting ? <CircularProgress size={18} thickness={4} sx={{ color: '#fff' }} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* FIX: Moved EMI Dialog OUTSIDE the Delete Dialog so it acts as a separate modal */}
      <EMIPaymentDialog account={emiTarget} onClose={() => setEmiTarget(null)} />

      {/* Success/error toast — glass, lifted above the floating nav dock */}
      <Snackbar
        open={!!error || !!success}
        autoHideDuration={4000}
        onClose={() => { setError(null); setSuccess(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          zIndex: 1400,
          bottom: 'calc(108px + env(safe-area-inset-bottom, 0px)) !important',
        }}
      >
        <Alert
          severity={error ? 'error' : 'success'}
          onClose={() => { setError(null); setSuccess(null); }}
          sx={(t) => ({
            width: '100%',
            borderRadius: '18px',
            fontWeight: 500,
            ...iOSFont,
            ...glassSx(t, 0.75),
          })}
        >
          {error || success}
        </Alert>
      </Snackbar>
    </Box>
  );
};