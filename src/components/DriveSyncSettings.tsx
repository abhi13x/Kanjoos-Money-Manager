import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  useTheme,
  alpha,
} from '@mui/material';
import {
  CloudOff,
  Upload,
  Download,
  LogOut,
  LogIn,
  CheckCircle,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import { useGDriveSession } from '@/hooks/useGDriveSession';

// ─── Constants ────────────────────────────────────────────────
const iOSFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Helvetica, Arial, sans-serif',
};

const statusCardSx = {
  p: 2.5,
  borderRadius: '16px',
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  mb: 3,
};

// ─── Helpers ──────────────────────────────────────────────────
const formatRelativeTime = (timestamp: number | null): string => {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  if (diff < 0) return 'Just now';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// ─── Main Component ───────────────────────────────────────────
interface DriveSyncSettingsProps {
  onBack: () => void;
}

export const DriveSyncSettings: React.FC<DriveSyncSettingsProps> = ({ onBack }) => {
  const theme = useTheme();
  const {
    isConnected,
    isSyncing,
    lastSyncTime,
    error: hookError,
    isPending,
    ensureAuthenticated,
    disconnect,
    sync,
    exportBackup,
    importBackup,
  } = useGDriveSession();

  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [showHookError, setShowHookError] = useState(false);
  const [, setTick] = useState(0);

  const isBusy = isSyncing || isPending;

  // Keep hook error synced with dismissable state
  useEffect(() => {
    if (hookError) {
      setShowHookError(true);
    }
  }, [hookError]);

  // Interval timer to keep relative timestamps fresh every minute
  useEffect(() => {
    if (!lastSyncTime) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  const formattedLastSync = useMemo(() => {
    if (!lastSyncTime) return null;
    return {
      absolute: new Date(lastSyncTime).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      relative: formatRelativeTime(lastSyncTime),
    };
  }, [lastSyncTime]);

  // Helper wrapper ensuring valid auth before executing actions
  const executeWithAuth = useCallback(
    async (action: () => Promise<void>, successMsg?: string) => {
      setLocalError(null);
      setSuccess(null);
      try {
        await ensureAuthenticated();
        await action();
        if (successMsg) setSuccess(successMsg);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Operation failed');
      }
    },
    [ensureAuthenticated]
  );

  // ─── Handlers ────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    setLocalError(null);
    setSuccess(null);
    try {
      await ensureAuthenticated();
      setSuccess('Connected to Google Drive');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [ensureAuthenticated]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setSuccess('Disconnected from Google Drive');
  }, [disconnect]);

  const handleSync = useCallback(() => {
    executeWithAuth(sync, 'Sync completed successfully');
  }, [executeWithAuth, sync]);

  const handleBackup = useCallback(() => {
    executeWithAuth(async () => {
      const fileName = await exportBackup();
      setSuccess(`Backup saved: ${fileName}`);
    });
  }, [executeWithAuth, exportBackup]);

  const handleRestore = useCallback(() => {
    setConfirmRestore(false);
    executeWithAuth(importBackup, 'Database restored from latest backup');
  }, [executeWithAuth, importBackup]);

  // ─── Render ──────────────────────────────────────────────────
  return (
    <Box sx={{ ...iOSFont }}>
      {/* Navigation Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          pb: 2,
          borderBottom: '1px solid',
          borderColor: 'rgba(60,60,67,0.08)',
        }}
      >
        <IconButton
          onClick={onBack}
          aria-label="Go back to settings"
          sx={{
            p: 0.5,
            color: 'text.primary',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <ChevronLeft size={24} />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px' }}>
          Google Drive Sync
        </Typography>
      </Box>

      {/* Status Card */}
      <Paper
        elevation={0}
        sx={{
          ...statusCardSx,
          bgcolor: isConnected
            ? alpha(theme.palette.success.main, 0.06)
            : alpha(theme.palette.grey[500], 0.06),
          border: '1px solid',
          borderColor: isConnected
            ? alpha(theme.palette.success.main, 0.2)
            : alpha(theme.palette.grey[500], 0.12),
        }}
      >
        {isBusy ? (
          <CircularProgress size={32} thickness={5} aria-label="Syncing" />
        ) : isConnected ? (
          <CheckCircle size={32} color={theme.palette.success.main} />
        ) : (
          <CloudOff size={32} color={theme.palette.grey[500]} />
        )}
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 17 }}>
            {isBusy ? 'Syncing...' : isConnected ? 'Connected' : 'Not Connected'}
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
            {isConnected && formattedLastSync
              ? `Last sync: ${formattedLastSync.relative} (${formattedLastSync.absolute})`
              : 'No sync yet'}
          </Typography>
        </Box>
      </Paper>

      {/* Feedback Messages */}
      {(localError || success) && (
        <Alert
          severity={localError ? 'error' : 'success'}
          onClose={() => {
            setLocalError(null);
            setSuccess(null);
          }}
          sx={{ borderRadius: '14px', mb: 3 }}
          role="status"
        >
          {localError || success}
        </Alert>
      )}

      {/* Action List */}
      <List disablePadding>
        {!isConnected ? (
          <ListItemButton
            onClick={handleConnect}
            disabled={isBusy}
            sx={{ py: 1.5, px: 2, borderRadius: '12px', bgcolor: 'action.hover' }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'primary.main' }}>
              {isBusy ? <CircularProgress size={20} /> : <LogIn size={20} />}
            </ListItemIcon>
            <ListItemText
              primary="Sign in with Google"
              secondary={isBusy ? 'Authenticating...' : undefined}
            />
          </ListItemButton>
        ) : (
          <>
            <ListItemButton
              onClick={handleSync}
              disabled={isBusy}
              sx={{ py: 1.5, px: 2, borderRadius: '12px' }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'primary.main' }}>
                {isBusy ? <CircularProgress size={20} /> : <RefreshCw size={20} />}
              </ListItemIcon>
              <ListItemText
                primary="Sync Now"
                secondary={isBusy ? 'Merging changes...' : 'Pull & push latest changes'}
              />
            </ListItemButton>

            <Divider sx={{ my: 1 }} />

            <ListItemButton
              onClick={handleBackup}
              disabled={isBusy}
              sx={{ py: 1.5, px: 2, borderRadius: '12px' }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'primary.main' }}>
                {isBusy ? <CircularProgress size={20} /> : <Upload size={20} />}
              </ListItemIcon>
              <ListItemText
                primary="Backup Now"
                secondary={isBusy ? 'Uploading...' : 'Upload latest data to Drive'}
              />
            </ListItemButton>

            <Divider sx={{ my: 1 }} />

            <ListItemButton
              onClick={() => setConfirmRestore(true)}
              disabled={isBusy}
              sx={{ py: 1.5, px: 2, borderRadius: '12px' }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'warning.main' }}>
                <Download size={20} />
              </ListItemIcon>
              <ListItemText
                primary="Restore Latest Backup"
                secondary="Overwrite local data with Drive version"
              />
            </ListItemButton>

            <Divider sx={{ my: 1 }} />

            <ListItemButton
              onClick={handleDisconnect}
              disabled={isBusy}
              sx={{ py: 1.5, px: 2, borderRadius: '12px', color: 'error.main' }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
                <LogOut size={20} />
              </ListItemIcon>
              <ListItemText primary="Disconnect Google Account" />
            </ListItemButton>
          </>
        )}
      </List>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={confirmRestore}
        onClose={() => !isBusy && setConfirmRestore(false)}
        slotProps={{
          paper: {
            sx: { borderRadius: '18px', p: 1, maxWidth: 400 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Overwrite all local data?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14 }}>
            This will replace all your current accounts, transactions, and categories with the version from Drive.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setConfirmRestore(false)}
            disabled={isBusy}
            sx={{ borderRadius: '12px', textTransform: 'none', flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRestore}
            disabled={isBusy}
            sx={{ borderRadius: '12px', textTransform: 'none', flex: 1 }}
            startIcon={isBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {isBusy ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dismissable Snackbar for Hook Errors */}
      <Snackbar
        open={showHookError && !localError}
        autoHideDuration={6000}
        onClose={() => setShowHookError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => setShowHookError(false)}
          sx={{ borderRadius: '14px', ...iOSFont }}
        >
          {hookError}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DriveSyncSettings;