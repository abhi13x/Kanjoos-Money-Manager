import React from 'react';
import { Box, InputAdornment, MenuItem, TextField } from '@mui/material';
import type { MenuProps } from '@mui/material/Menu';
import { CreditCard, ArrowRightLeft, Tag, CornerDownRight } from 'lucide-react';
import type { Account, Category } from '@/db/schema';

interface AccountOption extends Account {
  // Inherits type, name, id, etc. from Account
}

interface AccAndCategoryProps {
  type: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  subCategoryId: string;
  accounts: AccountOption[];
  parentCategories: Category[];
  availableSubcategories: Category[];
  setAccountId: (id: string) => void;
  setToAccountId: (id: string) => void;
  setCategoryId: (id: string) => void;
  setSubCategoryId: (id: string) => void;
}

// Helper to format account names with a visual flag for liability accounts
const formatAccountName = (acc: Account) => {
  const isLoan = acc.type === 'loan' || acc.type === 'mortgage';
  const isCredit = acc.type === 'credit_card';
  if (isLoan) return `${acc.name} (Loan)`;
  if (isCredit) return `${acc.name} (Credit)`;
  return acc.name;
};

export const AccAndCategory: React.FC<AccAndCategoryProps> = ({ 
  type,
  accountId, 
  toAccountId, 
  categoryId, 
  subCategoryId,
  accounts, 
  parentCategories,
  availableSubcategories,
  setAccountId, 
  setToAccountId, 
  setCategoryId,
  setSubCategoryId,
}) => {
  const isTransfer = type === 'transfer';
  
  // Pre-filter available destination accounts so we don't run filter twice in JSX
  const availableToAccounts = accounts.filter((acc) => acc.id !== accountId);

  // FIX: Strictly typed MenuProps using MUI's built-in type
  const menuProps: Partial<MenuProps> = {
    slotProps: {
      paper: {
        sx: {
          maxHeight: 300,
          borderRadius: '14px',
          mt: 0.5,
          '& .MuiMenuItem-root': {
            fontSize: 14,
            py: 1,
          },
        },
      },
    },
  };

  return (
    <Box 
      sx={{ 
        display: 'grid', 
        gridTemplateColumns: { 
          xs: '1fr', 
          sm: '1fr 1fr' 
        }, 
        gap: 2 
      }}
    >
      {/* Primary Account Selection */}
      <TextField
        select
        label={isTransfer ? 'From Account' : 'Account'}
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        required
        fullWidth
        slotProps={{
          select: { MenuProps: menuProps },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <CreditCard size={18} aria-hidden />
              </InputAdornment>
            ),
            sx: { borderRadius: '14px' }
          }
        }}
      >
        {accounts.length === 0 ? (
          <MenuItem disabled value="">
            No accounts found
          </MenuItem>
        ) : (
          accounts.map((acc) => (
            <MenuItem key={acc.id} value={acc.id}>
              {formatAccountName(acc)}
            </MenuItem>
          ))
        )}
      </TextField>

      {/* Transfer Destination or Main Category */}
      {isTransfer ? (
        <TextField
          select
          label="To Account"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          required
          fullWidth
          disabled={availableToAccounts.length === 0}
          slotProps={{
            select: { MenuProps: menuProps },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <ArrowRightLeft size={18} aria-hidden />
                </InputAdornment>
              ),
              sx: { borderRadius: '14px' }
            }
          }}
        >
          {availableToAccounts.length === 0 ? (
            <MenuItem disabled value="">
              Need another account
            </MenuItem>
          ) : (
            availableToAccounts.map((acc) => (
              <MenuItem key={acc.id} value={acc.id}>
                {formatAccountName(acc)}
              </MenuItem>
            ))
          )}
        </TextField>
      ) : (
        <TextField
          select
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          fullWidth
          slotProps={{
            select: { MenuProps: menuProps },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Tag size={18} aria-hidden />
                </InputAdornment>
              ),
              sx: { borderRadius: '14px' }
            }
          }}
        >
          {parentCategories.length === 0 ? (
            <MenuItem disabled value="">
              No categories found
            </MenuItem>
          ) : (
            parentCategories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))
          )}
        </TextField>
      )}

      {/* Dynamic Subcategory Selection */}
      {!isTransfer && (
        <TextField
          select
          label="Subcategory (Optional)"
          value={subCategoryId}
          onChange={(e) => setSubCategoryId(e.target.value)}
          disabled={!categoryId || availableSubcategories.length === 0}
          fullWidth
          sx={{
            gridColumn: { xs: '1 / -1', sm: '1 / -1' }
          }}
          slotProps={{
            select: { MenuProps: menuProps },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <CornerDownRight size={18} aria-hidden />
                </InputAdornment>
              ),
              sx: { borderRadius: '14px' }
            }
          }}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {availableSubcategories.map((sub) => (
            <MenuItem key={sub.id} value={sub.id}>
              {sub.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
};

export default AccAndCategory;