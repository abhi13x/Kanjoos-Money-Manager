import { useState, useCallback, useRef, useEffect } from 'react';
import { GDriveSyncService } from '@/services/gdriveSync';

export interface UseGDriveSessionReturn {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  isPending: boolean;
  ensureAuthenticated: () => Promise<string>;
  login: () => Promise<string>;
  loginRedirect: () => void; // NEW: Redirect flow
  disconnect: () => void;
  sync: () => Promise<void>;
  exportBackup: (customFileName?: string) => Promise<string>;
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
const TOKEN_KEY = 'kanjoos_gdrive_token';
const EXPIRY_KEY = 'kanjoos_gdrive_expiry';
const CONNECTED_KEY = 'kanjoos_gdrive_connected';

const syncService = GDriveSyncService.getInstance({
  tokenKey: TOKEN_KEY,
  expiryKey: EXPIRY_KEY,
  connectedKey: CONNECTED_KEY,
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

export const useGDriveSession = (): UseGDriveSessionReturn => {
  const [storeState, setStoreState] = useState<GDriveStoreState>(getStoreSnapshot);
  const [isPending, setIsPending] = useState<boolean>(false);
  const pendingCountRef = useRef(0);

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
      if (typeof unsubscribeService === 'function') unsubscribeService();
      window.removeEventListener(SESSION_CHANGE_EVENT, updateState);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // FIX: Handle Redirect Callback (when Google sends us back)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const expiresIn = params.get('expires_in');
      
      if (accessToken && expiresIn) {
        // Save token to localStorage so GDriveSyncService can use it
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(EXPIRY_KEY, (Date.now() + Number(expiresIn) * 1000).toString());
        localStorage.setItem(CONNECTED_KEY, 'true');
        
        // Clear the URL hash so it doesn't loop
        window.history.replaceState(null, '', window.location.pathname);
        
        // Notify the app that we are logged in
        notifySessionChange();
      }
    }
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

  const getOrAcquireToken = useCallback(async (): Promise<string> => {
    const cached = await syncService.getValidToken(false);
    if (cached) return cached;

    const error = new Error('Authentication required. Please log in.') as AuthError;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }, []);

  const ensureAuthenticated = useCallback(async (): Promise<string> => {
    return withPending(() => getOrAcquireToken());
  }, [getOrAcquireToken, withPending]);

  const login = useCallback(async (): Promise<string> => {
    return withPending(async () => {
      const token = await syncService.getValidToken(true);
      if (!token) throw new Error('Google sign-in was cancelled.');
      notifySessionChange();
      return token;
    });
  }, [withPending]);

  // NEW: Redirect Flow (Bypasses mobile popup blockers completely)
  const loginRedirect = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.origin + window.location.pathname;
    const scope = 'https://www.googleapis.com/auth/drive.appdata';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&include_granted_scopes=true&state=kanjoos_auth`;
    
    // This leaves the app and goes to Google
    window.location.href = url;
  }, []);

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
    loginRedirect,
    disconnect,
    sync,
    exportBackup,
    importBackup,
  };
};