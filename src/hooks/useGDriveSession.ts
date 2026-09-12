import { useState, useCallback, useEffect } from 'react';
import { GDriveSyncService } from '@/services/gdriveSync';
import type { GDriveSyncConfig, SyncStatus } from '@/services/gdrive/gdriveTypes';

export function useGDriveSession(config?: GDriveSyncConfig) {
  const syncService = GDriveSyncService.getInstance(config);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncService.getStatus());
  const [isPending, setIsPending] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(syncService.hasStoredCredentials());
  const [error, setError] = useState<string | null>(null);

  // Subscribe to sync service state updates
  useEffect(() => {
    const unsubscribe = syncService.subscribe((status) => {
      setSyncStatus(status);
      setIsConnected(syncService.hasStoredCredentials());
    });
    return () => unsubscribe();
  }, [syncService]);

  const ensureAuthenticated = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      // 1. Try silent token retrieval
      let token = await syncService.getValidToken(false);

      // 2. If no valid token exists, trigger interactive login popup
      if (!token) {
        token = await syncService.authenticate();
      }

      if (!token) {
        throw new Error('User is not authenticated with Google Drive.');
      }

      setIsConnected(true);
      return token;
    } catch (err) {
      setIsConnected(false);
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [syncService]);

  const disconnect = useCallback(() => {
    syncService.clearSession();
    setIsConnected(false);
    setError(null);
  }, [syncService]);

  const sync = useCallback(async () => {
    setError(null);
    try {
      await syncService.sync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setError(msg);
      throw err;
    }
  }, [syncService]);

  const exportBackup = useCallback(async (): Promise<string> => {
    setIsPending(true);
    setError(null);
    try {
      return await syncService.exportBackupToDrive();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backup creation failed';
      setError(msg);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [syncService]);

  const importBackup = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      await syncService.importBackupFromDrive();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [syncService]);

  return {
    isConnected,
    isSyncing: syncStatus.isSyncing,
    isPending,
    lastSyncTime: syncStatus.lastSyncTime,
    error: error || syncStatus.error,
    ensureAuthenticated,
    disconnect,
    sync,
    exportBackup,
    importBackup,
  };
}

export default useGDriveSession;