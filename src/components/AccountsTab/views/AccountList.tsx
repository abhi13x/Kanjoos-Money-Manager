import React, { useMemo } from 'react';
import { Box, Divider, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Inbox } from 'lucide-react';
import type { Account, AccountType, InvestmentSubType } from '@/db/schema';
import type { InvestmentProjection } from '@/services/investmentFormulas';
import { getAccountSignedBalance } from '../features/accountHelpers';
import { AccountRow } from './AccountRow';

const groupHeaderSx = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 0.75,
  px: 1,
};

const groupLabelSx = {
  fontWeight: 600,
  color: '#8E8E93',
  letterSpacing: '0.2px',
  fontSize: 13,
  textTransform: 'uppercase',
};

const accountPaperSx = {
  borderRadius: '16px',
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: alpha('#3C3C43', 0.12),
  overflow: 'hidden',
};

export interface CategorizedAccountGroup {
  label: string;
  types: AccountType[];
  accounts: Account[];
}

export interface AccountWithProjection {
  account: Account;
  projection: InvestmentProjection | null;
  subType: InvestmentSubType | null;
}

export interface AccountListProps {
  accounts: Account[];
  categorizedAccounts: CategorizedAccountGroup[];
  accountData: AccountWithProjection[];
  format: (cents: number) => string;
  onEdit: (account: Account) => void;
  onDelete: (id: string) => void;
  onPayEMI?: (account: Account) => void;
}

/** Renders the empty state, or the accounts grouped by category with per-group subtotals. */
export const AccountList: React.FC<AccountListProps> = ({
  accounts,
  categorizedAccounts,
  accountData,
  format,
  onEdit,
  onDelete,
  onPayEMI,
}) => {
  // FIX: Create a Map for O(1) lookups of projection/subType data instead of 
  // using array.find() inside the render loop.
  const accountDataMap = useMemo(() => {
    const map = new Map<string, AccountWithProjection>();
    accountData.forEach((data) => map.set(data.account.id, data));
    return map;
  }, [accountData]);

  if (accounts.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
          px: 4,
          textAlign: 'center',
        }}
      >
        <Inbox size={56} color="#8E8E93" />
        <Typography sx={{ mt: 2, fontSize: 17, fontWeight: 600, color: 'text.primary' }}>
          No Accounts Added
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 15, color: '#8E8E93' }}>
          Tap “Add” to create your first balance tracking item.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {categorizedAccounts.map((cat) => {
        const catAccounts = cat.accounts;
        if (catAccounts.length === 0) return null;

        const categorySubtotal = catAccounts.reduce(
          (sum, acc) => sum + getAccountSignedBalance(acc),
          0
        );

        return (
          // FIX: Use cat.label as a stable key instead of array index
          <Box key={cat.label}>
            <Box sx={groupHeaderSx}>
              <Typography variant="overline" sx={groupLabelSx}>
                {cat.label}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: categorySubtotal < 0 ? '#FF3B30' : '#8E8E93',
                }}
              >
                {format(categorySubtotal)}
              </Typography>
            </Box>

            <Paper elevation={0} sx={accountPaperSx}>
              {catAccounts.map((acc, accIdx) => {
                // O(1) lookup from the Map
                const data = accountDataMap.get(acc.id);
                const isLast = accIdx === catAccounts.length - 1;
                return (
                  <React.Fragment key={acc.id}>
                    <AccountRow
                      account={acc}
                      projection={data?.projection || null}
                      subType={data?.subType || null}
                      format={format}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onPayEMI={onPayEMI}
                    />
                    {!isLast && <Divider sx={{ ml: 2, borderColor: alpha('#3C3C43', 0.12) }} />}
                  </React.Fragment>
                );
              })}
            </Paper>
          </Box>
        );
      })}
    </Box>
  );
};