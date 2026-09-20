import React, { useMemo } from 'react';
import { Box, Grid, Card, CardContent, Typography, List, ListItem, ListItemText, Chip, Divider, useTheme } from '@mui/material';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Calendar, CreditCard as CardIcon, LineChart } from 'lucide-react';
import type { Account, Transaction } from '@/db/schema';
import { getInvestmentSummaries, getTotalProjectedInterest, getTotalProjectedMaturity } from '@/services/investmentService';
// ✅ ADDED: Import EMI calculator
import { calculateEMIForAccount } from '@/services/financeService'; 

interface SummaryTabProps {
  accounts?: Account[];
  transactions?: Transaction[];
  format: (cents: number) => string;
}

// iOS System Color Palette Tints
const IOS_COLORS = {
  green: { main: '#34C759', bg: 'rgba(52, 199, 89, 0.12)' },
  red: { main: '#FF3B30', bg: 'rgba(255, 59, 48, 0.12)' },
  blue: { main: '#007AFF', bg: 'rgba(0, 122, 255, 0.12)' },
  orange: { main: '#FF9500', bg: 'rgba(255, 149, 0, 0.12)' },
  purple: { main: '#AF52DE', bg: 'rgba(175, 82, 222, 0.12)' },
};

// Common iOS Grouped Card Style
const iosCardSx = {
  borderRadius: '20px',
  border: '1px solid',
  borderColor: 'rgba(0, 0, 0, 0.08)',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
  backdropFilter: 'blur(20px)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  overflow: 'hidden',
};

export const SummaryTab: React.FC<SummaryTabProps> = ({
  accounts = [],
  transactions = [],
  format,
}) => {
  const theme = useTheme();

  // Financial calculations
  const totalIncome = useMemo(() => {
    return transactions
      .filter((tx) => tx?.type === 'income')
      .reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
  }, [transactions]);

  const totalExpense = useMemo(() => {
    return transactions
      .filter((tx) => tx?.type === 'expense')
      .reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
  }, [transactions]);

  // Shows true net cash flow (including deficit)
  const netSavings = useMemo(() => totalIncome - totalExpense, [totalIncome, totalExpense]);

  const totalAssets = useMemo(() => {
    const assetTypes = ['cash', 'savings', 'wallet', 'mutual_fund', 'stock', 'fd_rd', 'scheme'];
    return accounts
      .filter((acc) => acc?.type && assetTypes.includes(acc.type))
      .reduce((sum, acc) => sum + (acc.currentBalance ?? acc.initialBalance ?? 0), 0);
  }, [accounts]);

  const creditCards = useMemo(() => {
    return accounts.filter((acc) => acc?.type === 'credit_card');
  }, [accounts]);

  const totalCCDebt = useMemo(() => {
    return creditCards.reduce((sum, acc) => sum + Math.abs(acc.currentBalance ?? 0), 0);
  }, [creditCards]);

   const upcomingPayments = useMemo(() => {
    const today = new Date().getDate();
    // ✅ ADDED: 'loan', 'mortgage' to scheduled types
    const scheduledTypes = ['mutual_fund', 'stock', 'fd_rd', 'scheme', 'credit_card', 'loan', 'mortgage'];

    return accounts
      .filter((acc) => acc?.type && scheduledTypes.includes(acc.type))
      .map((acc) => {
        const dueDay = acc.repeatInvestmentDate ?? acc.dueDate ?? 5;
        const status = dueDay >= today ? 'Upcoming' : 'Overdue';

        // ✅ ADDED: Calculate EMI amount if it's a loan
        let amount = 0;
        if (acc.type === 'credit_card') {
          amount = acc.currentBalance ?? 0;
        } else if (acc.type === 'loan' || acc.type === 'mortgage') {
          try {
            amount = calculateEMIForAccount(acc).emi; 
          } catch { amount = 0; }
        } else {
          amount = acc.monthlyInvestment ?? 0;
        }

        return {
          id: acc.id,
          name: acc.name ?? 'Unnamed Account',
          type: acc.type,
          dueDay,
          status,
          amount,
        };
      })
      .sort((a, b) => a.dueDay - b.dueDay);
  }, [accounts]);

  const investmentSummaries = useMemo(() => getInvestmentSummaries(accounts) ?? [], [accounts]);
  const totalProjectedMaturity = useMemo(() => getTotalProjectedMaturity(accounts) ?? 0, [accounts]);
  const totalProjectedInterest = useMemo(() => getTotalProjectedInterest(accounts) ?? 0, [accounts]);

  const metrics = [
    { label: 'Total Income', val: totalIncome, icon: <TrendingUp size={20} />, palette: IOS_COLORS.green },
    { label: 'Total Expense', val: totalExpense, icon: <TrendingDown size={20} />, palette: IOS_COLORS.red },
    { label: 'Net Savings', val: netSavings, icon: <PiggyBank size={20} />, palette: netSavings < 0 ? IOS_COLORS.red : IOS_COLORS.blue },
    { label: 'Total Assets', val: totalAssets, icon: <Wallet size={20} />, palette: IOS_COLORS.purple },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
      {/* 4 Core Financial Metrics */}
      <Grid container spacing={2}>
        {metrics.map((m, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Card sx={iosCardSx}>
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', letterSpacing: '-0.1px', fontSize: '0.75rem' }}>
                    {m.label}
                  </Typography>
                  <Box sx={{ p: 1, bgcolor: m.palette.bg, color: m.palette.main, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {m.icon}
                  </Box>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, color: m.palette.main, letterSpacing: '-0.5px' }}>
                  {format(m.val)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Investment Projections */}
      {investmentSummaries.length > 0 && (
        <Card sx={iosCardSx}>
          <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1, letterSpacing: '-0.3px' }}>
              <LineChart size={18} color={IOS_COLORS.blue.main} /> Investment Projections
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2, p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderRadius: '14px' }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Total Maturity Value
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: IOS_COLORS.green.main, letterSpacing: '-0.3px' }}>
                  {format(totalProjectedMaturity)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Total Interest / Gains
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: IOS_COLORS.blue.main, letterSpacing: '-0.3px' }}>
                  {format(totalProjectedInterest)}
                </Typography>
              </Grid>
            </Grid>
            <List disablePadding>
              {investmentSummaries.map(({ account, subType, projection }, index) => {
                const rate = account.interestRate ?? account.expectedReturnRate ?? 0;
                const tenure = account.tenureMonths ?? 0;
                const maturityVal = projection?.maturityValueCents ?? 0;
                const interestEarned = projection?.interestEarnedCents ?? 0;

                return (
                  <React.Fragment key={account.id}>
                    <ListItem sx={{ px: 0, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ListItemText
                        primary={account.name ?? 'Unnamed Account'}
                        secondary={`${(subType ?? '').toUpperCase()} · ${tenure} mo @ ${rate}%`}
                        slotProps={{
                          primary: { sx: { fontWeight: 600, fontSize: '0.875rem' } },
                          secondary: { sx: { fontSize: '0.75rem', color: 'text.secondary' } },
                        }}
                      />
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                          {format(maturityVal)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: IOS_COLORS.green.main, fontWeight: 600 }}>
                          +{format(interestEarned)}
                        </Typography>
                      </Box>
                    </ListItem>
                    {index < investmentSummaries.length - 1 && <Divider sx={{ borderColor: 'rgba(0, 0, 0, 0.05)' }} />}
                  </React.Fragment>
                );
              })}
            </List>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        {/* Credit Card Usage Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ ...iosCardSx, height: '100%' }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1, letterSpacing: '-0.3px' }}>
                <CardIcon size={18} color={IOS_COLORS.orange.main} /> Credit Card Usage
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, color: totalCCDebt > 0 ? IOS_COLORS.orange.main : 'text.primary', mb: 2, letterSpacing: '-0.5px' }}>
                {format(totalCCDebt)}
              </Typography>
              <List disablePadding>
                {creditCards.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                    No credit cards linked.
                  </Typography>
                ) : (
                  creditCards.map((card, index) => (
                    <React.Fragment key={card.id}>
                      <ListItem sx={{ px: 0, py: 1.25, display: 'flex', justifyContent: 'space-between' }}>
                        <ListItemText
                          primary={card.name ?? 'Credit Card'}
                          secondary={`Due: Day ${card.dueDate ?? '-'} | Statement: Day ${card.statementDate ?? '-'}`}
                          slotProps={{
                            primary: { sx: { fontWeight: 600, fontSize: '0.875rem' } },
                            secondary: { sx: { fontSize: '0.75rem', color: 'text.secondary' } },
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: IOS_COLORS.red.main, fontSize: '0.875rem' }}>
                          {format(Math.abs(card.currentBalance ?? 0))}
                        </Typography>
                      </ListItem>
                      {index < creditCards.length - 1 && <Divider sx={{ borderColor: 'rgba(0, 0, 0, 0.05)' }} />}
                    </React.Fragment>
                  ))
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Upcoming Outflows */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ ...iosCardSx, height: '100%' }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1, letterSpacing: '-0.3px' }}>
                <Calendar size={18} color={IOS_COLORS.purple.main} /> Upcoming Payments & SIPs
              </Typography>
              <List disablePadding>
                {upcomingPayments.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                    No recurring investments or scheduled accounts.
                  </Typography>
                ) : (
                  upcomingPayments.map((p, index) => {
                    const isUpcoming = p.status === 'Upcoming';
                    const pillPalette = isUpcoming ? IOS_COLORS.blue : IOS_COLORS.red;

                    return (
                      <React.Fragment key={p.id}>
                        <ListItem sx={{ px: 0, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ListItemText
                            primary={p.name}
                            secondary={`Due on Day ${p.dueDay} of this month`}
                            slotProps={{
                              primary: { sx: { fontWeight: 600, fontSize: '0.875rem' } },
                              secondary: { sx: { fontSize: '0.75rem', color: 'text.secondary' } },
                            }}
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            {p.amount !== 0 && (
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                                {format(Math.abs(p.amount))}
                              </Typography>
                            )}
                            <Chip
                              label={p.status}
                              size="small"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.6875rem',
                                borderRadius: '999px',
                                height: '22px',
                                bgcolor: pillPalette.bg,
                                color: pillPalette.main,
                                border: 'none',
                              }}
                            />
                          </Box>
                        </ListItem>
                        {index < upcomingPayments.length - 1 && <Divider sx={{ borderColor: 'rgba(0, 0, 0, 0.05)' }} />}
                      </React.Fragment>
                    );
                  })
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};