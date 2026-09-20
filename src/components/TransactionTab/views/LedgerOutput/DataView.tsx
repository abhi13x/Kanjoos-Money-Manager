import React, { memo, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import type { Transaction, Account, Category } from '@/db/schema';
import DayGroupCard from './DayGroupCard';

/**
 * Helper: Resolves category names into "Parent / Child" format so TransactionRow
 * can display Parent Category on top and Child Category underneath.
 */
const resolveCategoryName = (
  tx: Transaction | null | undefined,
  categories: Category[] = []
): string => {
  if (!tx) return 'Uncategorized';

  const catId = tx.categoryId;
  if (!catId || !categories.length) return 'Uncategorized';

  const currentCategory = categories.find((c) => c.id === catId);
  if (!currentCategory) return 'Uncategorized';

  // Check if currentCategory is a subcategory with a parentId
  const parentId = currentCategory.parentId;
  if (parentId) {
    const parentCategory = categories.find((c) => c.id === parentId);
    if (parentCategory) {
      return `${parentCategory.name} / ${currentCategory.name}`;
    }
  }

  return currentCategory.name;
};

export interface DayGroupData {
  groupTitle: string;
  totalIncome: number;
  totalExpense: number;
  netCents: number;
  transactions: Transaction[];
}

export interface DataViewProps {
  groupedTransactions: DayGroupData[];
  accounts?: Account[];
  categories?: Category[];
  format?: (cents: number) => string;
  onDeleteTx?: (id: string) => void;
  onEditTx?: (tx: Transaction) => void;
}

export const DataView: React.FC<DataViewProps> = memo(({
  groupedTransactions = [],
  accounts = [],
  categories = [],
  format,
  onDeleteTx,
  onEditTx,
}) => {
  // FIX: useCallback maintains a stable function reference so DayGroupCard's 
  // React.memo doesn't break due to a new inline function on every render.
  const getCategoryName = useCallback(
    (tx: Transaction | null | undefined) => resolveCategoryName(tx, categories),
    [categories]
  );

  if (!groupedTransactions || groupedTransactions.length === 0) {
    return (
      <Box
        sx={{
          py: 6,
          px: 2,
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          No transactions to display.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {groupedTransactions.map((group) => (
        <DayGroupCard
          key={group.groupTitle}
          groupTitle={group.groupTitle}
          totalIncome={group.totalIncome}
          totalExpense={group.totalExpense}
          netCents={group.netCents}
          transactions={group.transactions}
          accounts={accounts}
          categories={categories}
          format={format}
          getCategoryName={getCategoryName}
          onDeleteTx={onDeleteTx}
          onEditTx={onEditTx}
        />
      ))}
    </Box>
  );
});

DataView.displayName = 'DataView';

export default DataView;