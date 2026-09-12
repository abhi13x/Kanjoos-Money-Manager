export type ConflictResolutionStrategy = 'merge-by-id' | 'local-wins' | 'remote-wins';

export interface GDriveSyncConfig {
  /** OAuth client ID from Google Cloud Console (public/desktop client). */
  clientId?: string;
  /** Registered redirect URI, e.g. `com.kanjoos.app:/oauth2redirect`. */
  redirectUri?: string;
  scopes?: string;

  tokenKey?: string;
  expiryKey?: string;
  connectedKey?: string;
  refreshKey?: string;
  lastSyncKey?: string;
  deletedKey?: string;

  defaultFolders?: string[];
  autoSyncIntervalMs?: number;
  conflictStrategy?: ConflictResolutionStrategy;
  maxBackupsToKeep?: number;
}

export interface SyncStatus {
  lastSyncTime: number | null;
  isSyncing: boolean;
  error: string | null;
}

export interface GDriveFile {
  id: string;
  name: string;
  createdTime?: string;
}