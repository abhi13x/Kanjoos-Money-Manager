import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useSettings } from '@/hooks/useSettings';
import { useWindowSize } from '@/hooks/useWindowSize';
import { useGDriveSession } from '@/hooks/useGDriveSession';
import { formatCurrency } from '@/types/finance';
import { glassSx, iOSFont, AmbientBackground } from '@/theme/glass';

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

// Glass tokens now live in '@/theme/glass' (a leaf module, safe to import from
// anywhere). Re-exported here for backward compatibility with anything that
// still imports them from Dashboard — prefer '@/theme/glass' going forward.
export { glassSx, iOSFont, AmbientBackground } from '@/theme/glass';

const USERNAME_STORAGE_KEY = 'kanjoos_username';

/** Named tab indices — replaces magic numbers scattered through the JSX. */
const TAB = { SUMMARY: 0, TRANSACTIONS: 1, STATS: 2, ACCOUNTS: 3, SETTINGS: 4 } as const;

/** Z-index scale — keeps dock / FAB / header / toast stacking coherent. */
const Z = { DOCK: 1000, FAB: 1050, HEADER: 1100, TOAST: 1400 } as const;

const SYNC_COLORS = { syncing: '#FF9500', connected: '#34C759', offline: '#8E8E93' } as const;

interface DriveStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncTime?: number | string | Date | null;
}

const driveStatusColor = (s: DriveStatus) =>
  s.isSyncing ? SYNC_COLORS.syncing : s.isConnected ? SYNC_COLORS.connected : SYNC_COLORS.offline;

const driveStatusText = (s: DriveStatus) => {
  if (s.isSyncing) return 'Syncing…';
  if (!s.isConnected) return 'Disconnected';
  const last = s.lastSyncTime
    ? new Date(s.lastSyncTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
    : 'never';
  return `Last sync: ${last}`;
};

/** Drive connection chip — one implementation shared by both headers (was duplicated). */
const DriveStatusChip: FC<{ status: DriveStatus; compact?: boolean }> = ({ status, compact = false }) => {
  const color = driveStatusColor(status);
  const iconSize = compact ? 20 : 22;

  return (
    <Tooltip title={driveStatusText(status)} placement="bottom" arrow>
      <Box
        aria-label={driveStatusText(status)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 0.75 : 1,
          cursor: 'default',
          px: compact ? 1.5 : 1.75,
          py: 0.75,
          borderRadius: compact ? '12px' : '14px',
          bgcolor: (t) => alpha(t.palette.text.primary, 0.08),
          transition: 'background-color 0.2s ease-in-out',
          userSelect: 'none',
        }}
      >
        {status.isSyncing ? (
          <RefreshCw size={iconSize} color={SYNC_COLORS.syncing} className="animate-spin" />
        ) : (
          <Badge
            variant="dot"
            color="success"
            invisible={!status.isConnected}
            sx={{
              '& .MuiBadge-badge': {
                backgroundColor: color,
                boxShadow: `0 0 0 2px ${alpha(color, 0.2)}`,
              },
            }}
          >
            {status.isConnected ? (
              <Cloud size={iconSize} color={SYNC_COLORS.connected} />
            ) : (
              <CloudOff size={iconSize} color={SYNC_COLORS.offline} />
            )}
          </Badge>
        )}
        <Typography
          variant="caption"
          sx={{ color: '#8E8E93', fontWeight: 500, fontSize: compact ? 11 : 13 }}
        >
          {status.isSyncing ? 'Syncing' : status.isConnected ? 'Drive' : 'Offline'}
        </Typography>
      </Box>
    </Tooltip>
  );
};

/** Brand block — one implementation shared by both headers (was duplicated). */
const Brand: FC<{ username: string; desktop?: boolean }> = ({ username, desktop = false }) => (
  <Box>
    <Typography
      component="h1"
      variant="h5"
      sx={{
        fontWeight: 800,
        letterSpacing: desktop ? '-0.03em' : '-0.04em',
        color: '#007AFF',
        fontSize: desktop ? 28 : 24,
        lineHeight: 1.2,
        userSelect: 'none',
      }}
    >
      KANJOOS
    </Typography>
    <Typography
      variant={desktop ? 'body2' : 'caption'}
      sx={{
        color: '#8E8E93',
        fontWeight: 500,
        fontSize: desktop ? 15 : 13,
        display: 'block',
        mt: -0.5,
      }}
    >
      Welcome back, {username}
    </Typography>
  </Box>
);

export const Dashboard: FC = () => {
  const [currentTab, setCurrentTab] = useState<number>(TAB.SUMMARY);
  const [settingsView, setSettingsView] = useState<'main' | 'categories'>('main');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { isMobile, isTablet } = useWindowSize();
  const { isConnected, isSyncing, lastSyncTime } = useGDriveSession();
  const { defaultCurrency } = useSettings();

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

  // "N" opens the add-transaction modal (desktop power-user shortcut) while
  // the FAB is visible. Guarded so it never fires while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (currentTab === TAB.SUMMARY || currentTab === TAB.TRANSACTIONS) {
        setIsModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTab]);

  // IMPORTANT: no `|| []` fallbacks! useLiveQuery returns undefined while the
  // first query is pending; the old fallback swallowed that, so the loading
  // screen never actually showed — tabs rendered with empty data instead.
  const accounts = useLiveQuery(() => db.accounts.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());

  // Stable identity: lets React.memo'd child tabs skip re-renders when
  // unrelated Dashboard state (e.g. username) changes.
  const formatAmount = useCallback(
    (cents: number) => formatCurrency(cents, defaultCurrency),
    [defaultCurrency]
  );

  if (accounts === undefined || categories === undefined || transactions === undefined) {
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
  const driveStatus: DriveStatus = { isConnected, isSyncing, lastSyncTime };
  const fabVisible = currentTab === TAB.SUMMARY || currentTab === TAB.TRANSACTIONS;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: (t) => t.palette.background.default,
        color: (t) => t.palette.text.primary,
        ...iOSFont,
        WebkitTapHighlightColor: 'transparent',
        // NOTE: no global userSelect: 'none' — users should be able to copy
        // amounts/notes. Selection is disabled on chrome (headers/dock) instead.
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
            zIndex: Z.HEADER,
            borderRadius: '24px',
            backgroundImage: 'none', // kill MUI's default AppBar gradient
            userSelect: 'none',
            ...glassSx(t),
          })}
        >
          <Toolbar sx={{ px: 3, height: 68, ...iOSFont }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Brand username={username} desktop />
              <DriveStatusChip status={driveStatus} />
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
            zIndex: Z.HEADER,
            bgcolor: alpha(t.palette.background.paper, t.palette.mode === 'light' ? 0.55 : 0.6),
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            // hairline bottom edge instead of a hard border
            boxShadow: `inset 0 -1px 0 ${t.palette.mode === 'light' ? 'rgba(60, 60, 67, 0.1)' : 'rgba(255, 255, 255, 0.08)'}`,
            pt: 'calc(12px + env(safe-area-inset-top, 0px))',
            pb: 1.5,
            userSelect: 'none',
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
            <Brand username={username} />
            <DriveStatusChip status={driveStatus} compact />
          </Container>
        </Box>
      )}

      {/* Main Content */}
      <Container
        maxWidth="lg"
        sx={{ py: isDesktop ? 4 : 2.5, px: { xs: 2, sm: 3 }, position: 'relative', zIndex: 1 }}
      >
        {currentTab === TAB.SUMMARY && (
          <SummaryTab accounts={accounts} transactions={transactions} format={formatAmount} />
        )}
        {currentTab === TAB.TRANSACTIONS && (
          <TransactionsTab
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            format={formatAmount}
          />
        )}
        {currentTab === TAB.STATS && (
          <StatsTab transactions={transactions} categories={categories} format={formatAmount} />
        )}
        {currentTab === TAB.ACCOUNTS && <AccountsTab accounts={accounts} format={formatAmount} />}
        {currentTab === TAB.SETTINGS && (
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
          zIndex: Z.DOCK,
          borderRadius: '28px',
          overflow: 'hidden',
          userSelect: 'none',
          ...iOSFont,
          ...glassSx(t, 0.55),
        })}
      >
        <BottomNavigation
          showLabels
          aria-label="Main navigation"
          value={currentTab}
          onChange={(_e, val) => {
            setCurrentTab(val);
            if (val === TAB.SETTINGS) setSettingsView('main');
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

      {/* FAB — glossy iOS squircle with glow and springy pop-in */}
      {fabVisible && (
        <Fab
          color="primary"
          aria-label="add transaction"
          aria-keyshortcuts="N"
          onClick={() => setIsModalOpen(true)}
          sx={{
            position: 'fixed',
            right: { xs: 18, sm: 28 },
            bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            zIndex: Z.FAB,
            borderRadius: '20px',
            bgcolor: '#007AFF',
            backgroundImage:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(0, 0, 0, 0.12) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            boxShadow: '0 12px 32px rgba(0, 122, 255, 0.45), 0 4px 12px rgba(0, 0, 0, 0.18)',
            '@keyframes fabIn': {
              from: { opacity: 0, transform: 'scale(0.55)' },
              to: { opacity: 1, transform: 'scale(1)' },
            },
            animation: 'fabIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
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
          zIndex: Z.TOAST,
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