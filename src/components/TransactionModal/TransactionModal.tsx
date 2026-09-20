import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction } from '@/db/schema';
import { addTransactionWithSync, updateTransactionWithSync } from '@/services/financeService';
import {
  Dialog, DialogTitle, DialogContent, Box, IconButton, TextField,
  Button, InputAdornment, Typography
} from '@mui/material';
import { X, FileText } from 'lucide-react';
import { AccAndCategory } from './views/AccAndCategory';
import { DatePicker } from './views/DatePicker';
import { SegmentTypeSwitcher } from './views/SegmentTypeSwitch';
import { Recurring } from './views/Recurring';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTransaction?: Transaction | null;
}

export type TransactionType = 'expense' | 'income' | 'transfer';
export type RepeatInterval = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const VALID_INTERVALS: RepeatInterval[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

/** FIX: Safely converts a timestamp to a 'YYYY-MM-DD' string in LOCAL time,
 *  preventing date shifts when saving or loading across timezones. */
const toLocalDateString = (timestamp: number): string => {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  editTransaction,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [date, setDate] = useState(() => toLocalDateString(Date.now()));
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState<RepeatInterval>('monthly');

  // IndexedDB Dexie Live Queries — fallback to empty array to maintain stable references
  const rawAccounts = useLiveQuery(() => db.accounts.toArray(), [], [] as never[]);
  const accounts = useMemo(() => rawAccounts ?? [], [rawAccounts]);
  const rawCategories = useLiveQuery(() => db.categories.toArray(), [], [] as never[]);
  const categories = useMemo(() => rawCategories ?? [], [rawCategories]);

  // Reset/populate form fields whenever the modal opens for a (new) transaction, or once
  // categories finish loading (derived-state-during-render, avoids a setState-in-effect cascade)
  const initKey = isOpen ? `${editTransaction?.id ?? 'new'}:${categories.length > 0}` : 'closed';
  const [lastInitKey, setLastInitKey] = useState<string | null>(null);

  if (lastInitKey !== initKey) {
    setLastInitKey(initKey);

    if (isOpen && editTransaction) {
      setType(editTransaction.type ?? 'expense');
      setAmount(editTransaction.amount ? (editTransaction.amount / 100).toFixed(2) : '');
      setAccountId(editTransaction.accountId ?? '');
      setToAccountId(editTransaction.toAccountId ?? '');
      setDate(
        editTransaction.date
          ? toLocalDateString(editTransaction.date)
          : toLocalDateString(Date.now())
      );
      setNote(editTransaction.note ?? '');
      setDescription(editTransaction.description ?? '');
      setIsRecurring(editTransaction.isRecurring ?? false);

      const rawInterval = editTransaction.repeatInterval as RepeatInterval;
      setRepeatInterval(VALID_INTERVALS.includes(rawInterval) ? rawInterval : 'monthly');

      const targetCatId = editTransaction.categoryId ?? '';
      const foundCat = categories.find((c) => c.id === targetCatId);
      if (foundCat?.parentId) {
        setCategoryId(foundCat.parentId);
        setSubCategoryId(foundCat.id);
      } else {
        setCategoryId(targetCatId);
        setSubCategoryId('');
      }
    } else if (isOpen) {
      setType('expense');
      setAmount('');
      setAccountId('');
      setToAccountId('');
      setCategoryId('');
      setSubCategoryId('');
      setDate(toLocalDateString(Date.now()));
      setNote('');
      setDescription('');
      setIsRecurring(false);
      setRepeatInterval('monthly');
    }
  }

  const parentCategories = useMemo(() => {
    if (type === 'transfer') return [];
    return categories.filter((cat) => cat.type === type && !cat.parentId);
  }, [categories, type]);

  const availableSubcategories = useMemo(() => {
    if (!categoryId || type === 'transfer') return [];
    return categories.filter((cat) => cat.parentId === categoryId);
  }, [categories, categoryId, type]);

  const handleTypeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newType: TransactionType | null
  ) => {
    if (newType !== null) {
      setType(newType);
      setCategoryId('');
      setSubCategoryId('');
    }
  };

  const handleCategoryChange = (newParentId: string) => {
    setCategoryId(newParentId);
    setSubCategoryId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !accountId) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const amountCents = Math.round(parsedAmount * 100);
    const finalCategoryId = subCategoryId || categoryId;

    const [year, month, day] = date.split('-').map(Number);
    const localDateTimestamp = new Date(year, month - 1, day).getTime();

    const payload = {
      amount: amountCents,
      type,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type === 'transfer' ? undefined : (finalCategoryId || undefined),
      date: localDateTimestamp,
      note: note.trim(),
      description: description.trim(),
      isRecurring,
      repeatInterval: isRecurring ? repeatInterval : ('none' as const),
      updatedAt: Date.now(),
      
      // FIX: Preserve EMI tracking fields if the user is editing an existing EMI transaction.
      // This prevents the links from breaking if they just want to rename the note.
      loanAccountId: editTransaction?.loanAccountId,
      installmentNumber: editTransaction?.installmentNumber,
    };

    try {
      if (editTransaction?.id) {
        await updateTransactionWithSync(editTransaction.id, payload);
      } else {
        await addTransactionWithSync({ ...payload, id: crypto.randomUUID() } as Transaction);
      }
      onClose();
    } catch (err) {
      console.error('Failed to sync transaction:', err);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            borderRadius: '24px',
            p: 1,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.12)'
          }
        }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 800 }}>
          {editTransaction ? 'Edit Transaction' : 'New Transaction'}
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary', width: 44, height: 44 }}>
          <X size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2.5, py: 1 }}>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SegmentTypeSwitcher type={type} handleTypeChange={handleTypeChange} />

          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            fullWidth
            placeholder="0.00"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: 'text.secondary' }}>₹</Typography>
                  </InputAdornment>
                ),
                sx: { fontSize: '1.25rem', fontWeight: 800, borderRadius: '14px' }
              }
            }}
          />

          <AccAndCategory
            type={type}
            accounts={accounts}
            parentCategories={parentCategories}
            availableSubcategories={availableSubcategories}
            accountId={accountId}
            toAccountId={toAccountId}
            categoryId={categoryId}
            subCategoryId={subCategoryId}
            setAccountId={setAccountId}
            setToAccountId={setToAccountId}
            setCategoryId={handleCategoryChange}
            setSubCategoryId={setSubCategoryId}
          />

          <DatePicker date={date} setDate={setDate} />

          <TextField
            label="Short Note"
            placeholder="e.g., Grocery shopping, Uber ride"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            slotProps={{ input: { sx: { borderRadius: '14px' } } }}
          />

          <TextField
            label="Extended Description"
            placeholder="Additional context or references..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                    <FileText size={18} />
                  </InputAdornment>
                ),
                sx: { borderRadius: '14px' }
              }
            }}
          />

          <Recurring
            isRecurring={isRecurring}
            setIsRecurring={setIsRecurring}
            repeatInterval={repeatInterval}
            setRepeatInterval={setRepeatInterval}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disableElevation
            sx={{ py: 1.6, borderRadius: '16px', fontWeight: 800, fontSize: '1rem', mb: 1 }}
          >
            {editTransaction ? 'Update Transaction' : 'Save Transaction'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionModal;