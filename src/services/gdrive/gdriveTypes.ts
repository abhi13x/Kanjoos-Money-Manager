export type ConflictResolutionStrategy = 'merge-by-id' | 'local-wins' | 'remote-wins';

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export interface GDriveSyncConfig {
  tokenKey?: string;
  expiryKey?: string;
  connectedKey?: string;
  lastSyncKey?: string;
  deletedKey?: string;
  scopes?: string;
  defaultFolders?: string[];
  autoSyncIntervalMs?: number;
  conflictStrategy?: ConflictResolutionStrategy;
  maxBackupsToKeep?: number;
}

export interface SyncStatus {
  state: SyncState;
  lastSyncTime: number | null;
  isSyncing: boolean;
  error: string | null;
  progress?: number;
}

export interface GDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
}

export interface GDriveFileListResponse {
  kind?: string;
  nextPageToken?: string;
  incompleteSearch?: boolean;
  files?: GDriveFile[];
}

export interface GDriveApiErrorDetail {
  domain?: string;
  reason?: string;
  message?: string;
  locationType?: string;
  location?: string;
}

export interface GDriveApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    errors?: GDriveApiErrorDetail[];
  };
}

export type AppFolderMap = Record<string, string>;

export interface BackupFileInfo extends GDriveFile {
  timestamp?: number;
}