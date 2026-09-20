import React from 'react';
import { Box, Button, Chip, IconButton, Stack, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Edit, Trash2, TrendingUp, Banknote } from 'lucide-react';
import type { Account, InvestmentSubType } from '@/db/schema';
import type { InvestmentProjection } from '@/services/investmentFormulas';
import { SUB_TYPE_LABELS } from '../features/accountHelpers';

const accountRowSx = {
  p: 2,
};

const accountNameSx = {
  fontWeight: 600,
  fontSize: 17,
  letterSpacing: '-0.4px',
  color: 'text.primary',
};

const accountMetaSx = {
  fontSize: 13,
  color: '#8E8E93',
  fontWeight: 400,
  lineHeight: 1.4,
};

const projectionBoxSx = {
  mt: 1.25,
  p: 1.5,
  borderRadius: '10px',
  border: '1px solid',
  borderColor: alpha('#007AFF', 0.15),
};

const balanceSx = {
  fontWeight: 600,
  fontSize: 17,
  letterSpacing: '-0.4px',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export interface AccountRowProps {
  account: Account;
  projection: InvestmentProjection | null;
  subType: InvestmentSubType | null;
  format: (cents: number) => string;
  onEdit: (account: Account) => void;
  onDelete: (id: string) => void;
  onPayEMI?: (account: Account) => void; // Added: EMI Payment handler
}

/** A single row in the account list: name, balance, optional investment projection, edit/delete actions. */
export const AccountRow: React.FC<AccountRowProps> = ({ 
  account: acc, 
  projection, 
  subType, 
  format, 
  onEdit, 
  onDelete, 
  onPayEMI 
}) => {
  const theme = useTheme();
  const isCredit = acc.type === 'credit_card';
  const isLoan = acc.type === 'loan' || acc.type === 'mortgage';

  return (
    <Box sx={accountRowSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography sx={accountNameSx}>{acc.name}</Typography>
            {subType && (
              <Chip
                label={SUB_TYPE_LABELS[subType]}
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: 11,
                  height: 20,
                  borderRadius: '6px',
                  bgcolor: alpha('#007AFF', 0.1),
                  color: '#007AFF',
                }}
              />
            )}
          </Box>

          <Typography sx={accountMetaSx}>
            {acc.type.replace(/_/g, ' ').toUpperCase()}
            {(acc.interestRate ?? acc.expectedReturnRate)
              ? ` · ${acc.expectedReturnRate ? 'Return' : 'Interest'}: ${acc.interestRate ?? acc.expectedReturnRate}%`
              : ''}
            {acc.repeatInvestmentDate ? ` · SIP: Day ${acc.repeatInvestmentDate}` : ''}
            {acc.tenureMonths ? ` · Tenure: ${acc.tenureMonths}m` : ''}
          </Typography>

          {projection && (
            <Box sx={{ ...projectionBoxSx, bgcolor: alpha('#007AFF', 0.04) }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <TrendingUp size={14} color="#007AFF" aria-hidden />
                <Typography sx={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: '#007AFF' }}>
                  Investment Projection
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: '#8E8E93', lineHeight: 1.5 }}>
                Maturity: <strong>{format(projection.maturityValueCents)}</strong>
                {' · '}Gain: <strong>{format(projection.interestEarnedCents)}</strong>
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
          {/* Simplified redundant ternary */}
          <Typography sx={{ ...balanceSx, color: isCredit || isLoan ? '#FF3B30' : 'text.primary' }}>
            {format(acc.currentBalance)}
          </Typography>

          {/* Added: Pay EMI Button */}
          {isLoan && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Banknote size={14} aria-hidden />}
              onClick={() => onPayEMI?.(acc)}
              sx={{ 
                mb: 0.5, 
                textTransform: 'none', 
                fontWeight: 700, 
                borderRadius: '10px', 
                color: '#34C759', 
                borderColor: alpha('#34C759', 0.4),
                '&:hover': { bgcolor: alpha('#34C759', 0.05), borderColor: '#34C759' }
              }}
            >
              Pay EMI
            </Button>
          )}

          <Stack direction="row" spacing={0.5}>
            <IconButton
              onClick={() => onEdit(acc)}
              aria-label={`Edit ${acc.name}`}
              sx={{
                width: 44,
                height: 44,
                bgcolor: alpha(theme.palette.action.hover, 0.06),
                borderRadius: '50%',
              }}
            >
              <Edit size={16} color="#007AFF" aria-hidden />
            </IconButton>
            <IconButton
              onClick={() => onDelete(acc.id)}
              aria-label={`Delete ${acc.name}`}
              sx={{
                width: 44,
                height: 44,
                bgcolor: alpha('#FF3B30', 0.08),
                borderRadius: '50%',
              }}
            >
              <Trash2 size={16} color="#FF3B30" aria-hidden />
            </IconButton>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};