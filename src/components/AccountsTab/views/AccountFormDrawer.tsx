import React from 'react';
import {
  Box,
  Button,
  Drawer,
  InputBase,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Account, AccountType, CompoundingFrequency, InvestmentSubType } from '@/db/schema';
import { SUB_TYPE_OPTIONS, iOSFont, needsMonthlyInvestment } from '../features/accountHelpers';

const iosInputSx = {
  bgcolor: alpha('#767680', 0.12),
  borderRadius: '10px',
  px: 1.75,
  py: 1,
  fontSize: 16,
  color: 'text.primary',
  width: '100%',
  ...iOSFont,
  '& .MuiInputBase-input': {
    p: 0,
    '&::placeholder': {
      color: '#8E8E93',
      opacity: 1,
    },
  },
};

interface IOSFieldProps {
  label: string;
  children: React.ReactNode;
}

const IOSField: React.FC<IOSFieldProps> = ({ label, children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
    <Typography
      sx={{
        fontSize: 13,
        fontWeight: 500,
        color: '#8E8E93',
        ml: 0.5,
        ...iOSFont,
      }}
    >
      {label}
    </Typography>
    {children}
  </Box>
);

export interface AccountFormValues {
  name: string;
  type: AccountType;
  balance: string;
  repeatDay: string;
  interest: string;
  ccStatement: string;
  ccDue: string;
  monthlyInvestment: string;
  startDate: string;
  tenureMonths: string;
  investmentSubType: InvestmentSubType | '';
  compoundingFrequency: CompoundingFrequency;
}

export interface AccountFormSetters {
  setName: (v: string) => void;
  setBalance: (v: string) => void;
  setRepeatDay: (v: string) => void;
  setInterest: (v: string) => void;
  setCcStatement: (v: string) => void;
  setCcDue: (v: string) => void;
  setMonthlyInvestment: (v: string) => void;
  setStartDate: (v: string) => void;
  setTenureMonths: (v: string) => void;
  setInvestmentSubType: (v: InvestmentSubType | '') => void;
  setCompoundingFrequency: (v: CompoundingFrequency) => void;
}

export interface AccountFormDrawerProps {
  isOpen: boolean;
  editingAccount: Account | null;
  values: AccountFormValues;
  setters: AccountFormSetters;
  onTypeChange: (type: AccountType) => void;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
}

/** iOS-style bottom sheet with the add/edit account form. */
export const AccountFormDrawer: React.FC<AccountFormDrawerProps> = ({
  isOpen,
  editingAccount,
  values,
  setters,
  onTypeChange,
  onClose,
  onSave,
}) => {
  const {
    name, type, balance, repeatDay, interest, ccStatement, ccDue,
    monthlyInvestment, startDate, tenureMonths, investmentSubType, compoundingFrequency,
  } = values;
  const {
    setName, setBalance, setRepeatDay, setInterest, setCcStatement, setCcDue,
    setMonthlyInvestment, setStartDate, setTenureMonths, setInvestmentSubType, setCompoundingFrequency,
  } = setters;

  return (
    <Drawer
      anchor="bottom"
      open={isOpen}
      onClose={onClose}
      slotProps={{
        backdrop: {
          sx: { bgcolor: 'rgba(0, 0, 0, 0.4)' },
        },
        paper: {
          sx: {
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            maxHeight: '90vh',
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            ...iOSFont,
          },
        },
      }}
    >
      {/* Grab Handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.25, pb: 1 }}>
        <Box
          sx={{
            width: 36,
            height: 5,
            borderRadius: '2.5px',
            bgcolor: alpha('#767680', 0.3),
          }}
        />
      </Box>

      {/* iOS Navigation Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          pb: 2,
          borderBottom: '1px solid',
          borderColor: alpha('#3C3C43', 0.12),
        }}
      >
        <Button
          onClick={onClose}
          sx={{
            color: '#007AFF',
            fontSize: 17,
            textTransform: 'none',
            minWidth: 'auto',
            p: 0,
            fontWeight: 400,
          }}
        >
          Cancel
        </Button>
        <Typography sx={{ fontWeight: 600, fontSize: 17, color: 'text.primary' }}>
          {editingAccount ? 'Edit Account' : 'New Account'}
        </Typography>
        <Button
          onClick={onSave}
          sx={{
            color: '#007AFF',
            fontSize: 17,
            textTransform: 'none',
            minWidth: 'auto',
            p: 0,
            fontWeight: 600,
          }}
        >
          Done
        </Button>
      </Box>

      {/* Sheet Content / Form */}
      <Box
        component="form"
        onSubmit={onSave}
        sx={{
          p: 2.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          overflowY: 'auto',
        }}
      >
        <IOSField label="ACCOUNT NAME">
          <InputBase
            placeholder="e.g. HDFC Savings"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            sx={iosInputSx}
          />
        </IOSField>

        
        <IOSField label="ACCOUNT TYPE">
          <Select
            value={type}
            onChange={(e) => onTypeChange(e.target.value as AccountType)}
            input={<InputBase sx={iosInputSx} />}
            fullWidth
          >
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="savings">Savings Account</MenuItem>
            <MenuItem value="wallet">Wallet</MenuItem>
            <MenuItem value="credit_card">Credit Card</MenuItem>
            <MenuItem value="debit_card">Debit Card</MenuItem>
            {/* ✅ ADDED LOAN & MORTGAGE */}
            <MenuItem value="loan">Loan</MenuItem>
            <MenuItem value="mortgage">Mortgage</MenuItem>
            <MenuItem value="mutual_fund">Mutual Fund</MenuItem>
            <MenuItem value="stock">Stocks</MenuItem>
            <MenuItem value="fd_rd">Fixed Deposit / RD</MenuItem>
            <MenuItem value="scheme">Scheme (NPS, PPF, EPFO)</MenuItem>
          </Select>
        </IOSField>

        {SUB_TYPE_OPTIONS[type]?.length > 1 && (
          <IOSField label="INVESTMENT TYPE">
            <Select
              value={investmentSubType}
              onChange={(e) => setInvestmentSubType(e.target.value as InvestmentSubType)}
              input={<InputBase sx={iosInputSx} />}
              fullWidth
            >
              {SUB_TYPE_OPTIONS[type].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </IOSField>
        )}

        <IOSField label="CURRENT BALANCE (₹)">
          <InputBase
            type="number"
            placeholder="0.00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            required
            fullWidth
            sx={iosInputSx}
          />
        </IOSField>

       {/* ✅ UPDATED: Added 'loan', 'mortgage' to the array so these fields render */}
        {['mutual_fund', 'stock', 'fd_rd', 'scheme', 'loan', 'mortgage'].includes(type) && (
          <>
            <IOSField
              label={
                ['mutual_fund', 'stock'].includes(type)
                  ? 'EXPECTED RETURN (% P.A.)'
                  : 'INTEREST RATE (% P.A.)'
              }
            >
              <InputBase
                type="number"
                inputProps={{ step: '0.01' }}
                placeholder="e.g. 7.5"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                required
                fullWidth
                sx={iosInputSx}
              />
            </IOSField>

            <IOSField label="TENURE (MONTHS)">
              <InputBase
                type="number"
                placeholder="e.g. 12"
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
                required
                fullWidth
                sx={iosInputSx}
              />
            </IOSField>

            <IOSField label={type === 'loan' || type === 'mortgage' ? 'FIRST EMI DATE' : 'START DATE'}>
              <InputBase
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                fullWidth
                sx={iosInputSx}
              />
            </IOSField>
          </>
        )}

        {needsMonthlyInvestment(investmentSubType) && (
          <IOSField label="MONTHLY INVESTMENT (₹)">
            <InputBase
              type="number"
              placeholder="0.00"
              value={monthlyInvestment}
              onChange={(e) => setMonthlyInvestment(e.target.value)}
              required
              fullWidth
              sx={iosInputSx}
            />
          </IOSField>
        )}

        {type === 'fd_rd' && investmentSubType === 'fd' && (
          <IOSField label="COMPOUNDING FREQUENCY">
            <ToggleButtonGroup
              value={compoundingFrequency}
              exclusive
              onChange={(_, val) => val && setCompoundingFrequency(val)}
              fullWidth
              sx={{
                bgcolor: alpha('#767680', 0.12),
                p: '2px',
                borderRadius: '9px',
                border: 'none',
                '& .MuiToggleButton-root': {
                  border: 'none',
                  borderRadius: '7px',
                  py: 0.75,
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  color: 'text.primary',
                  '&.Mui-selected': {
                    bgcolor: 'background.paper',
                    boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.12)',
                  },
                },
              }}
            >
              <ToggleButton value="monthly">Monthly</ToggleButton>
              <ToggleButton value="quarterly">Quarterly</ToggleButton>
              <ToggleButton value="annually">Annually</ToggleButton>
            </ToggleButtonGroup>
          </IOSField>
        )}

        {['mutual_fund', 'stock', 'fd_rd', 'scheme'].includes(type) && (
          <IOSField label="REPEAT INVESTMENT DAY (1-31)">
            <InputBase
              type="number"
              placeholder="e.g. 5"
              value={repeatDay}
              onChange={(e) => setRepeatDay(e.target.value)}
              fullWidth
              sx={iosInputSx}
            />
          </IOSField>
        )}

        {type === 'credit_card' && (
          <>
            <IOSField label="STATEMENT DATE (1-31)">
              <InputBase
                type="number"
                placeholder="e.g. 1"
                value={ccStatement}
                onChange={(e) => setCcStatement(e.target.value)}
                required
                fullWidth
                sx={iosInputSx}
              />
            </IOSField>

            <IOSField label="DUE DATE (1-31)">
              <InputBase
                type="number"
                placeholder="e.g. 20"
                value={ccDue}
                onChange={(e) => setCcDue(e.target.value)}
                required
                fullWidth
                sx={iosInputSx}
              />
            </IOSField>
          </>
        )}
      </Box>
    </Drawer>
  );
};
