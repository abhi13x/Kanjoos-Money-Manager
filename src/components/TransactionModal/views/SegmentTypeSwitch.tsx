import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { TrendingDown, TrendingUp, ArrowRightLeft } from 'lucide-react';
import type { TransactionType } from '../TransactionModal';
import { iOSFont } from '@/theme/glass';

interface SegmentTypeSwitcherProps {
  type: TransactionType;
  handleTypeChange: (event: React.MouseEvent<HTMLElement>, newType: TransactionType | null) => void;
}

export const SegmentTypeSwitcher: React.FC<SegmentTypeSwitcherProps> = ({
  type,
  handleTypeChange,
}) => {
  return (
    <ToggleButtonGroup
      value={type}
      exclusive
      onChange={handleTypeChange}
      fullWidth
      sx={{
        bgcolor: 'action.hover',
        p: 0.5,
        borderRadius: '16px',
        border: 'none',
        ...iOSFont,
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          borderRadius: '12px !important',
          fontWeight: 700,
          fontSize: '0.85rem',
          py: 1,
          textTransform: 'capitalize',
          transition: 'all 0.2s ease',
          '&.Mui-selected': {
            boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
            ...(type === 'expense' && { bgcolor: 'error.soft', color: 'error.main' }),
            ...(type === 'income' && { bgcolor: 'success.soft', color: 'success.main' }),
            ...(type === 'transfer' && { bgcolor: 'primary.soft', color: 'primary.main' }),
          },
        },
      }}
    >
      <ToggleButton value="expense" aria-label="expense">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingDown size={18} aria-hidden />
          Expense
        </Box>
      </ToggleButton>
      <ToggleButton value="income" aria-label="income">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp size={18} aria-hidden />
          Income
        </Box>
      </ToggleButton>
      <ToggleButton value="transfer" aria-label="transfer">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArrowRightLeft size={18} aria-hidden />
          Transfer
        </Box>
      </ToggleButton>
    </ToggleButtonGroup>
  );
};

export default SegmentTypeSwitcher;