import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useSettings } from '@/hooks/useSettings';
import { useWindowSize } from '@/hooks/useWindowSize';
import { useGDriveSession } from '@/hooks/useGDriveSession';
import { formatCurrency } from '@/types/finance';

import { SummaryTab } from './SummaryTab';
import { TransactionsTab } from './TransactionTab/TransactionTab';
import { StatsTab } from './StatsTab/StatsTab';
import { AccountsTab } from './AccountsTab/AccountsTab';
import { SettingsTab } from './SettingsTab';
import { CategoriesTab } from './CategoriesTab/CategoriesTab';
import TransactionModal from './TransactionModal/TransactionModal';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Fab from '@mui/material/Fab';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

import {
  Plus,
  LayoutDashboard,
  ArrowRightLeft,
  BarChart3,
  Wallet,
  Settings,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';

const USERNAME_STORAGE_KEY = 'kanjoos_username';

const iOSFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Helvetica, Arial, sans-serif',
};

/**
 * iOS "Liquid Glass" panel style — frosted, translucent, with a specular
 * top highlight and a soft ambient shadow. Exported so you can reuse it
 * in your tab components for a consistent glass look.
 */
export const glassSx = (t: Theme, opacity = 0.6) => {
  const isLight = t.palette.mode === 'light';
  return {
    bgcolor: alpha(t.palette.background.paper, isLight ? opacity : opacity + 0.15),
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: `1px solid ${isLight ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.1)'}`,
    boxShadow: isLight
      ? '0 12px 40px -8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
      : '0 12px 40px -8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  };
};

/** Ambient colour orbs that sit behind everything so the glass has something to blur. */
export const AmbientBackground: React.FC = () => (
  <Box
    aria-hidden
    sx={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}
  >
    <Box
      sx={{
        position: 'absolute',
        top: '-20%',
        left: '-12%',
        width: '55vmax',
        height: '55vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 122, 255, 0.20) 0%, transparent 65%)',
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        bottom: '5%',
        right: '-18%',
        width: '50vmax',
        height: '50vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(175, 82, 222, 0.16) 0%, transparent 65%)',
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        top: '30%',
        right: '15%',
        width: '35vmax',
        height: '35vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52, 199, 89, 0.13) 0%, transparent 65%)',
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        bottom: '-15%',
        left: '10%',
        width: '40vmax',
        height: '40vmax',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 149, 0, 0.10) 0%, transparent 65%)',
      }}
    />
  </Box>
);

export const Dashboard: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<number>(0);
  const [settingsView, setSettingsView] = useState<'main' | 'categories'>('main');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const { isMobile, isTablet } = useWindowSize();
  const [syncError, setSyncError] = useState<string | null>(null);
  const { isConnected, isSyncing, lastSyncTime } = useGDriveSession();

  const [username, setUsername] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(USERNAME_STORAGE_KEY) || 'Abhishek';
    }
    return 'Abhishek';
  });

  useEffect(() => {
    const handleUsernameSync = () => {
      const stored = localStorage.getItem(USERNAME_STORAGE_KEY);
      if (stored) setUsername(stored);
    };
    window.addEventListener('kanjoos_username_updated', handleUsernameSync);
    window.addEventListener('storage', handleUsernameSync);
    return () => {
      window.removeEventListener('kanjoos_username_updated', handleUsernameSync);
      window.removeEventListener('storage', handleUsernameSync);
    };
  }, []);

  useEffect(() => {
    const handleSyncError = (event: CustomEvent<{ message: string }>) => {
      setSyncError(event.detail.message);
    };
    window.addEventListener('kanjoos_sync_error', handleSyncError as EventListener);
    return () => {
      window.removeEventListener('kanjoos_sync_error', handleSyncError as EventListener);
    };
  }, []);

  const { defaultCurrency } = useSettings();
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];

  const formatAmount = (cents: number) => formatCurrency(cents, defaultCurrency);
  const isLoading = !accounts || !categories || !transactions;

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: (t) => t.palette.background.default,
          ...iOSFont,
        }}
      >
        <AmbientBackground />
        <Paper
          elevation={0}
          sx={(t) => ({
            p: 5,
            borderRadius: '28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            ...glassSx(t),
          })}
        >
          <CircularProgress size={36} thickness={4.5} />
          <Typography variant="caption" sx={{ color: '#8E8E93', fontWeight: 500, fontSize: 13 }}>
            Loading your finances…
          </Typography>
        </Paper>
      </Box>
    );
  }

  const isDesktop = !isMobile && !isTablet;

  // Build status badge color
  const getStatusColor = () => {
    if (isSyncing) return '#FF9500'; // orange
    if (isConnected) return '#34C759'; // green
    return '#8E8E93'; // grey
  };

  const getStatusText = () => {
    if (isSyncing) return 'Syncing...';
    if (isConnected) {
      const last = lastSyncTime ? new Date(lastSyncTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'never';
      return `Last sync: ${last}`;
    }
    return 'Disconnected';
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: (t) => t.palette.background.default,
        color: (t) => t.palette.text.primary,
        ...iOSFont,
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
        pb: {
          xs: 'calc(96px + env(safe-area-inset-bottom, 0px))',
          md: 'calc(104px + env(safe-area-inset-bottom, 0px))',
        },
        pt: isDesktop ? '108px' : 0,
      }}
    >
      <AmbientBackground />

      {/* Desktop Header — floating glass bar */}
      {isDesktop && (
        <AppBar
          position="fixed"
          elevation={0}
          sx={(t) => ({
            top: 16,
            left: 16,
            right: 16,
            zIndex: 1100,
            borderRadius: '24px',
            backgroundImage: 'none', // kill MUI's default AppBar gradient
            ...glassSx(t),
          })}
        >
          <Toolbar sx={{ px: 3, height: 68, ...iOSFont }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Box>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: '#007AFF',
                    fontSize: 28,
                    lineHeight: 1.2,
                  }}
                >
                  KANJOOS
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#8E8E93',
                    fontWeight: 500,
                    fontSize: 15,
                    mt: -0.5,
                  }}
                >
                  Welcome back, {username}
                </Typography>
              </Box>

              {/* Drive Status Indicator — glass chip */}
              <Tooltip title={getStatusText()} placement="bottom" arrow>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'default',
                    px: 1.75,
                    py: 0.75,
                    borderRadius: '14px',
                    bgcolor: (t) => alpha(t.palette.text.primary, 0.08),
                    transition: 'background-color 0.2s ease-in-out',
                  }}
                >
                  {isSyncing ? (
                    <RefreshCw size={22} color="#FF9500" className="animate-spin" />
                  ) : (
                    <Badge
                      variant="dot"
                      color="success"
                      invisible={!isConnected}
                      sx={{
                        '& .MuiBadge-badge': {
                          backgroundColor: getStatusColor(),
                          boxShadow: `0 0 0 2px ${alpha(getStatusColor(), 0.2)}`,
                        },
                      }}
                    >
                      {isConnected ? (
                        <Cloud size={22} color="#34C759" />
                      ) : (
                        <CloudOff size={22} color="#8E8E93" />
                      )}
                    </Badge>
                  )}
                  <Typography variant="caption" sx={{ color: '#8E8E93', fontWeight: 500, fontSize: 13 }}>
                    {isSyncing ? 'Syncing' : isConnected ? 'Drive' : 'Offline'}
                  </Typography>
                </Box>
              </Tooltip>
            </Box>
          </Toolbar>
        </AppBar>
      )}

      {/* Mobile Header — frosted glass nav bar */}
      {!isDesktop && (
        <Box
          component="header"
          sx={(t) => ({
            position: 'sticky',
            top: 0,
            zIndex: 1100,
            bgcolor: alpha(t.palette.background.paper, t.palette.mode === 'light' ? 0.55 : 0.6),
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            // hairline bottom edge instead of a hard border
            boxShadow: `inset 0 -1px 0 ${t.palette.mode === 'light' ? 'rgba(60, 60, 67, 0.1)' : 'rgba(255, 255, 255, 0.08)'}`,
            pt: 'calc(12px + env(safe-area-inset-top, 0px))',
            pb: 1.5,
            ...iOSFont,
          })}
        >
          <Container
            maxWidth="lg"
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              px: 2.5,
            }}
          >
            <Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  color: '#007AFF',
                  fontSize: 24,
                  lineHeight: 1.2,
                }}
              >
                KANJOOS
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#8E8E93',
                  fontWeight: 500,
                  fontSize: 13,
                  display: 'block',
                  mt: -0.5,
                }}
              >
                Welcome back, {username}
              </Typography>
            </Box>

            <Tooltip title={getStatusText()} placement="bottom" arrow>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  cursor: 'default',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: '12px',
                  bgcolor: (t) => alpha(t.palette.text.primary, 0.08),
                  transition: 'background-color 0.2s ease-in-out',
                }}
              >
                {isSyncing ? (
                  <RefreshCw size={20} color="#FF9500" className="animate-spin" />
                ) : (
                  <Badge
                    variant="dot"
                    color="success"
                    invisible={!isConnected}
                    sx={{
                      '& .MuiBadge-badge': {
                        backgroundColor: getStatusColor(),
                        boxShadow: `0 0 0 2px ${alpha(getStatusColor(), 0.2)}`,
                      },
                    }}
                  >
                    {isConnected ? (
                      <Cloud size={20} color="#34C759" />
                    ) : (
                      <CloudOff size={20} color="#8E8E93" />
                    )}
                  </Badge>
                )}
                <Typography variant="caption" sx={{ color: '#8E8E93', fontWeight: 500, fontSize: 11 }}>
                  {isSyncing ? 'Syncing' : isConnected ? 'Drive' : 'Offline'}
                </Typography>
              </Box>
            </Tooltip>
          </Container>
        </Box>
      )}

      {/* Main Content */}
      <Container
        maxWidth="lg"
        sx={{ py: isDesktop ? 4 : 2.5, px: { xs: 2, sm: 3 }, position: 'relative', zIndex: 1 }}
      >
        {currentTab === 0 && (
          <SummaryTab accounts={accounts} transactions={transactions} format={formatAmount} />
        )}
        {currentTab === 1 && (
          <TransactionsTab
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            format={formatAmount}
          />
        )}
        {currentTab === 2 && (
          <StatsTab transactions={transactions} categories={categories} format={formatAmount} />
        )}
        {currentTab === 3 && <AccountsTab accounts={accounts} format={formatAmount} />}
        {currentTab === 4 && (
          <>
            <Box sx={{ display: settingsView === 'categories' ? 'block' : 'none' }}>
              <CategoriesTab categories={categories} onBack={() => setSettingsView('main')} />
            </Box>
            <Box sx={{ display: settingsView === 'main' ? 'block' : 'none' }}>
              <SettingsTab onNavigateToCategories={() => setSettingsView('categories')} />
            </Box>
          </>
        )}
      </Container>

      {/* Bottom Navigation — floating glass dock */}
      <Paper
        elevation={0}
        sx={(t) => ({
          position: 'fixed',
          bottom: { xs: 'calc(12px + env(safe-area-inset-bottom, 0px))', md: 20 },
          left: { xs: 14, sm: 24 },
          right: { xs: 14, sm: 24 },
          maxWidth: { sm: 640 },
          margin: '0 auto',
          zIndex: 1000,
          borderRadius: '28px',
          overflow: 'hidden',
          ...iOSFont,
          ...glassSx(t, 0.55),
        })}
      >
        <BottomNavigation
          showLabels
          value={currentTab}
          onChange={(_e, val) => {
            setCurrentTab(val);
            if (val === 4) setSettingsView('main');
          }}
          sx={{
            height: 64,
            bgcolor: 'transparent',
            '& .MuiBottomNavigationAction-root': {
              minWidth: 'auto',
              py: 0.75,
              m: 0.5,
              borderRadius: '20px',
              color: '#8E8E93',
              transition: 'color 0.2s ease-in-out, background-color 0.2s ease-in-out',
              '& .MuiBottomNavigationAction-label': {
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                '&.Mui-selected': {
                  fontSize: 11,
                  fontWeight: 700,
                },
              },
              '&.Mui-selected': {
                color: '#007AFF',
                bgcolor: 'rgba(0, 122, 255, 0.14)',
              },
            },
          }}
        >
          <BottomNavigationAction label="Summary" icon={<LayoutDashboard size={20} strokeWidth={2.2} />} />
          <BottomNavigationAction label="Transactions" icon={<ArrowRightLeft size={20} strokeWidth={2.2} />} />
          <BottomNavigationAction label="Stats" icon={<BarChart3 size={20} strokeWidth={2.2} />} />
          <BottomNavigationAction label="Accounts" icon={<Wallet size={20} strokeWidth={2.2} />} />
          <BottomNavigationAction label="Settings" icon={<Settings size={20} strokeWidth={2.2} />} />
        </BottomNavigation>
      </Paper>

      {/* FAB — glossy iOS squircle with glow */}
      {(currentTab === 0 || currentTab === 1) && (
        <Fab
          color="primary"
          aria-label="add transaction"
          onClick={() => setIsModalOpen(true)}
          sx={{
            position: 'fixed',
            right: { xs: 18, sm: 28 },
            bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            zIndex: 1050,
            borderRadius: '20px',
            bgcolor: '#007AFF',
            backgroundImage:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(0, 0, 0, 0.12) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            boxShadow: '0 12px 32px rgba(0, 122, 255, 0.45), 0 4px 12px rgba(0, 0, 0, 0.18)',
            '&:active': { transform: 'scale(0.94)' },
            transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
          }}
        >
          <Plus size={24} strokeWidth={2.5} />
        </Fab>
      )}

      <TransactionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Sync Error Snackbar — glass toast, lifted above the dock */}
      <Snackbar
        open={!!syncError}
        autoHideDuration={6000}
        onClose={() => setSyncError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          zIndex: 1400,
          // !important overrides the Snackbar's inline anchor positioning
          bottom: 'calc(108px + env(safe-area-inset-bottom, 0px)) !important',
        }}
      >
        <Alert
          onClose={() => setSyncError(null)}
          severity="error"
          sx={(t) => ({
            width: '100%',
            borderRadius: '18px',
            fontWeight: 500,
            ...iOSFont,
            ...glassSx(t, 0.75),
          })}
        >
          {syncError}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Dashboard;