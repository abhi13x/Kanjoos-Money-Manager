import { useState, useCallback, useRef, useEffect } from 'react';
import { GDriveSyncService } from '@/services/gdriveSync';

export interface UseGDriveSessionReturn {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  isPending: boolean; // per-instance pending flag
  /** Checks for a valid token; throws `AUTH_REQUIRED` if none exists. */
  ensureAuthenticated: () => Promise<string>;
  /** Explicitly triggers the Google OAuth popup; returns the token. */
  login: () => Promise<string>;
  /** Disconnect and clear session. */
  disconnect: () => void;
  /** Full sync – will throw `AUTH_REQUIRED` if not logged in. */
  sync: () => Promise<void>;
  /** Export backup – throws `AUTH_REQUIRED` if not logged in. */
  exportBackup: (customFileName?: string) => Promise<string>;
  /** Import backup – throws `AUTH_REQUIRED` if not logged in. */
  importBackup: (customFileName?: string) => Promise<void>;
}

interface GDriveStoreState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
}

interface AuthError extends Error {
  code: string;
}

const SESSION_CHANGE_EVENT = 'kanjoos_gdrive_session_change';

const syncService = GDriveSyncService.getInstance({
  tokenKey: 'kanjoos_gdrive_token',
  expiryKey: 'kanjoos_gdrive_expiry',
  connectedKey: 'kanjoos_gdrive_connected',
  defaultFolders: ['Backups', 'Exports'],
});

const notifySessionChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }
};

const getStoreSnapshot = (): GDriveStoreState => {
  const status = syncService.getStatus();
  const isConnected = syncService.hasCachedSession();
  return {
    isConnected,
    isSyncing: status.isSyncing,
    lastSyncTime: status.lastSyncTime,
    error: status.error,
  };
};

/* ==========================================================
   HOOK IMPLEMENTATION
   ========================================================== */

export const useGDriveSession = (): UseGDriveSessionReturn => {
  const [storeState, setStoreState] = useState<GDriveStoreState>(getStoreSnapshot);
  const [isPending, setIsPending] = useState<boolean>(false);
  const pendingCountRef = useRef(0);

  // FIX: Replaced useSyncExternalStore with standard useState/useEffect
  // to prevent React type recognition errors.
  useEffect(() => {
    const updateState = () => setStoreState(getStoreSnapshot());

    const unsubscribeService = syncService.subscribe(updateState);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || syncService.getStorageKeys().includes(event.key)) {
        updateState();
      }
    };

    window.addEventListener(SESSION_CHANGE_EVENT, updateState);
    window.addEventListener('storage', handleStorage);

    return () => {
      if (typeof unsubscribeService === 'function') {
        unsubscribeService();
      }
      window.removeEventListener(SESSION_CHANGE_EVENT, updateState);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const withPending = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    pendingCountRef.current += 1;
    setIsPending(true);
    try {
      return await fn();
    } finally {
      pendingCountRef.current -= 1;
      if (pendingCountRef.current === 0) setIsPending(false);
    }
  }, []);

  // ─── Private helper – NO popup ──────────────────────────────
  const getOrAcquireToken = useCallback(async (): Promise<string> => {
    const cached = await syncService.getValidToken(false);
    if (cached) return cached;

    const error = new Error('Authentication required. Please log in.') as AuthError;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }, []);

  // ─── Public methods ──────────────────────────────────────────

  const ensureAuthenticated = useCallback(async (): Promise<string> => {
    return withPending(() => getOrAcquireToken());
  }, [getOrAcquireToken, withPending]);

  const login = useCallback(async (): Promise<string> => {
    return withPending(async () => {
      try {
        const token = await syncService.authenticate();
        if (!token) throw new Error('Google sign-in was cancelled.');
        return token;
      } finally {
        notifySessionChange();
      }
    });
  }, [withPending]);

  const disconnect = useCallback(() => {
    syncService.clearSession();
    notifySessionChange();
  }, []);

  const sync = useCallback(async (): Promise<void> => {
    return withPending(async () => {
      try {
        await getOrAcquireToken();
        await syncService.sync();
      } finally {
        notifySessionChange();
      }
    });
  }, [getOrAcquireToken, withPending]);

  const exportBackup = useCallback(
    async (customFileName?: string): Promise<string> => {
      return withPending(async () => {
        try {
          await getOrAcquireToken();
          return await syncService.exportBackupToDrive(undefined, customFileName);
        } finally {
          notifySessionChange();
        }
      });
    },
    [getOrAcquireToken, withPending]
  );

  const importBackup = useCallback(
    async (customFileName?: string): Promise<void> => {
      return withPending(async () => {
        try {
          await getOrAcquireToken();
          await syncService.importBackupFromDrive(undefined, customFileName);
        } finally {
          notifySessionChange();
        }
      });
    },
    [getOrAcquireToken, withPending]
  );

  return {
    ...storeState,
    isPending,
    ensureAuthenticated,
    login,
    disconnect,
    sync,
    exportBackup,
    importBackup,
  };
};