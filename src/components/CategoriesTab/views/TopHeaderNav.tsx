import { Box, Button, IconButton, Typography } from '@mui/material';
import { ArrowLeft, Plus } from 'lucide-react';
import type { FC } from 'react';
import type { Category } from '@/db/schema';
import { glassSx, iOSFont } from '@/theme/glass'; // adjust path to your shared module

export const TopHeaderNav: FC<{
  selectedParentCategory: Category | null;
  activeTab: 'income' | 'expense';
  onBack: () => void;
  setSelectedParentCategory: (category: Category | null) => void;
  setAddModalState: (state: { open: boolean; type: 'income' | 'expense'; parentCategory?: Category | null }) => void;
}> = ({ selectedParentCategory, activeTab, onBack, setSelectedParentCategory, setAddModalState }) => {
  return (
    <Box
      sx={(t) => ({
        // 1fr / auto / 1fr grid keeps the title perfectly centered
        // even when the back label width changes ("Settings" vs "Expenses")
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        px: 1.25,
        py: 1,
        mb: 2,
        borderRadius: '22px',
        ...iOSFont,
        ...glassSx(t, 0.55),
      })}
    >
      {/* Back button — iOS style: plain blue chevron + label, no chrome */}
      <Button
        color="primary"
        startIcon={<ArrowLeft size={20} strokeWidth={2.5} />}
        onClick={() => {
          if (selectedParentCategory) {
            setSelectedParentCategory(null);
          } else {
            onBack();
          }
        }}
        sx={{
          justifySelf: 'start',
          fontWeight: 600,
          textTransform: 'none',
          fontSize: 15,
          letterSpacing: '-0.01em',
          color: '#007AFF',
          minWidth: 0,
          px: 1.25,
          borderRadius: '12px',
          '& .MuiButton-startIcon': { mr: 0.25, ml: -0.75 },
          '&:hover': { bgcolor: 'rgba(0, 122, 255, 0.10)' },
          '&:active': { transform: 'scale(0.97)' },
          transition: 'background-color 0.2s ease-in-out, transform 0.15s ease-in-out',
        }}
      >
        {selectedParentCategory
          ? activeTab === 'expense'
            ? 'Expenses'
            : 'Income'
          : 'Settings'}
      </Button>

      {/* Centered title */}
      <Typography
        variant="h6"
        noWrap
        sx={{
          fontWeight: 800,
          fontSize: 17,
          letterSpacing: '-0.02em',
          maxWidth: '60%',
        }}
      >
        {selectedParentCategory
          ? selectedParentCategory.name
          : activeTab === 'expense'
          ? 'Expenses'
          : 'Income'}
      </Typography>

      {/* Add button — tinted glass squircle, like a mini version of the main FAB */}
      <IconButton
        color="primary"
        aria-label="add category"
        onClick={() => {
          if (selectedParentCategory) {
            setAddModalState({
              open: true,
              type: activeTab,
              parentCategory: selectedParentCategory,
            });
          } else {
            setAddModalState({
              open: true,
              type: activeTab,
              parentCategory: null,
            });
          }
        }}
        sx={{
          justifySelf: 'end',
          width: 40,
          height: 40,
          borderRadius: '14px',
          color: '#007AFF',
          bgcolor: 'rgba(0, 122, 255, 0.15)',
          border: '1px solid rgba(0, 122, 255, 0.22)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.25)',
          transition: 'background-color 0.2s ease-in-out, transform 0.15s ease-in-out',
          '&:hover': {
            bgcolor: 'rgba(0, 122, 255, 0.25)',
          },
          '&:active': { transform: 'scale(0.92)' },
        }}
      >
        <Plus size={22} strokeWidth={2.5} />
      </IconButton>
    </Box>
  );
};