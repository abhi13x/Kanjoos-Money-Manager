import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Account } from '@/db/schema';
import { calculateEMIForAccount, addEMIPaymentWithSync, type EMIInstallment } from '@/services/financeService';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  MenuItem, TextField, CircularProgress, Divider
} from '@mui/material';
import { X, CreditCard } from 'lucide-react';
import { iOSFont, glassSx } from '@/theme/glass';

interface EMIPaymentDialogProps {
  account: Account | null;
  onClose: () => void;
}

export const EMIPaymentDialog: React.FC<EMIPaymentDialogProps> = ({ account, onClose }) => {
  const [fromAccountId, setFromAccountId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);

  useEffect(() => {
    if (account) {
      const defaultAcc = accounts.find(a => a.id !== account.id);
      setFromAccountId(defaultAcc?.id ?? '');
    }
  }, [account, accounts]);

  const schedule = useMemo(() => {
    if (!account) return null;
    try {
      return calculateEMIForAccount(account);
    } catch (e) {
      console.error("EMI Calc Error:", e);
      return null;
    }
  }, [account]);

  if (!account || !schedule) return null;

  const nextInstallment: EMIInstallment = schedule.schedule[0];

  const handlePay = async () => {
    if (!fromAccountId) return;
    setIsSaving(true);
    try {
      await addEMIPaymentWithSync({
        installment: nextInstallment,
        accountId: fromAccountId,
        loanAccountId: account.id,
        note: `EMI for ${account.name}`,
        description: `Installment #${nextInstallment.installmentNumber}`,
      });
      onClose();
    } catch (err) {
      console.error("Failed to pay EMI:", err);
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!account} onClose={onClose} fullWidth maxWidth="xs"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } },
        paper: { elevation: 0, sx: (t) => ({ borderRadius: '28px', ...glassSx(t, 0.95), ...iOSFont }) }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Pay EMI</Typography>
        <X size={20} onClick={onClose} style={{ cursor: 'pointer', color: '#8E8E93' }} />
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 2 }}>
        <Box sx={{ mb: 3, p: 2, borderRadius: '18px', bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ color: '#8E8E93', fontSize: 14 }}>Installment</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>#{nextInstallment.installmentNumber} of {schedule.schedule.length}</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ color: '#8E8E93', fontSize: 14 }}>Principal</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#34C759' }}>
              +{(nextInstallment.principal / 100).toFixed(2)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ color: '#8E8E93', fontSize: 14 }}>Interest</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#FF3B30' }}>
              -{(nextInstallment.interest / 100).toFixed(2)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography sx={{ color: '#8E8E93', fontSize: 14 }}>GST on Interest</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#FF3B30' }}>
              -{(nextInstallment.gst / 100).toFixed(2)}
            </Typography>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Total Due</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#007AFF' }}>
              {(nextInstallment.totalDue / 100).toFixed(2)}
            </Typography>
          </Box>
        </Box>

        <TextField
          select
          label="Pay From"
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
          fullWidth
          required
          slotProps={{ input: { sx: { borderRadius: '14px' } } }}
        >
          {accounts.filter(a => a.id !== account.id).map((acc) => (
            <MenuItem key={acc.id} value={acc.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CreditCard size={16} />
                {acc.name}
              </Box>
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
        <Button 
          fullWidth 
          onClick={handlePay} 
          disabled={!fromAccountId || isSaving}
          variant="contained" 
          disableElevation
          sx={{ py: 1.5, borderRadius: '14px', fontWeight: 800, fontSize: '1rem', textTransform: 'none' }}
        >
          {isSaving ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : `Pay ${(nextInstallment.totalDue / 100).toFixed(2)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};