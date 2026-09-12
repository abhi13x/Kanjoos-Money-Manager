import { db, type Account, type Category, type Transaction } from '../db/schema';
import { GDriveTokenAuth } from '@/services/gdrive/tokenAuth';
import { DriveApiClient } from '@/services/gdrive/driveApiClient';
import { GDriveTombstoneStore } from '@/services/gdrive/tombstoneStore';
import { mergeEntities, areEntityListsEqual, areIdListsEqual } from '@/services/gdrive/mergeEntities';
import { sanitizeEntityList, sanitizeIdList } from '@/services/gdrive/backupValidation';
import type {
  ConflictResolutionStrategy,
  GDriveSyncConfig,
  SyncStatus,
  SyncState,
  GDriveFile
} from '@/services/gdrive/gdriveTypes';

export type { ConflictResolutionStrategy, GDriveSyncConfig, SyncStatus, GDriveFile };

const DEFAULT_AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_BACKUPS = 10;

export class GDriveSyncService {
  private static instance: GDriveSyncService;

  private lastSyncKey = 'kanjoos_gdrive_last_sync';
  private defaultFolders = ['Backups', 'Exports'];
  private autoSyncIntervalMs = DEFAULT_AUTO_SYNC_INTERVAL_MS;
  private maxBackupsToKeep = DEFAULT_MAX_BACKUPS;
  private conflictStrategy: ConflictResolutionStrategy = 'merge-by-id';

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private lastError: string | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  private tokenAuth: GDriveTokenAuth;
  private tombstones: GDriveTombstoneStore;
  private driveApi: DriveApiClient;

  private constructor() {
    this.tokenAuth = new GDriveTokenAuth({
      tokenKey: 'kanjoos_gdrive_token',
      expiryKey: 'kanjoos_gdrive_expiry',
      connectedKey: 'kanjoos_gdrive_connected',
      scopes: 'https://www.googleapis.com/auth/drive.appdata',
      onAuthenticated: (token) => {
        this.startAutoSync();
        this.ensureAppFolders(token).catch((err) =>
          console.warn('Background folder creation failed:', err)
        );
      },
    });

    this.tombstones = new GDriveTombstoneStore('kanjoos_gdrive_deleted_ids');

    this.driveApi = new DriveApiClient({
      resolveToken: (token) => this.tokenAuth.ensureValidToken(token),
      onUnauthorized: async () => {
        // Attempt only silent token renewal during automated API calls
        const renewed = await this.tokenAuth.getValidToken(false);
        if (!renewed) {
          this.clearSession();
        }
      },
    });
  }

  public static getInstance(config?: GDriveSyncConfig): GDriveSyncService {
    if (!GDriveSyncService.instance) {
      GDriveSyncService.instance = new GDriveSyncService();
    }
    if (config) {
      GDriveSyncService.instance.configure(config);
    }
    return GDriveSyncService.instance;
  }

  public configure(config: Partial<GDriveSyncConfig>): void {
    this.tokenAuth.configure({
      tokenKey: config.tokenKey,
      expiryKey: config.expiryKey,
      connectedKey: config.connectedKey,
      scopes: config.scopes,
    });
    this.tombstones.configure(config.deletedKey);

    if (config.lastSyncKey) this.lastSyncKey = config.lastSyncKey;
    if (config.defaultFolders) this.defaultFolders = config.defaultFolders;
    if (config.maxBackupsToKeep !== undefined) this.maxBackupsToKeep = config.maxBackupsToKeep;
    if (config.conflictStrategy) this.conflictStrategy = config.conflictStrategy;

    if (config.autoSyncIntervalMs !== undefined) {
      this.autoSyncIntervalMs = config.autoSyncIntervalMs;
      if (this.syncTimer) {
        this.startAutoSync(this.autoSyncIntervalMs);
      }
    }
  }

  // ─── Tombstone Management ──────────────────────────────────
  public markAsDeleted(id: string): void {
    this.tombstones.markAsDeleted(id);
  }

  public getDeletedIds(): Set<string> {
    return this.tombstones.getDeletedIds();
  }

  // ─── Status & Subscriptions ─────────────────────────────────
  public getStatus(): SyncStatus {
    let rawTime: string | null = null;
    try {
      rawTime = localStorage.getItem(this.lastSyncKey);
    } catch {
      // Fall through with lastSyncTime unknown
    }

    const state: SyncState = this.isSyncing
      ? 'syncing'
      : this.lastError
        ? 'error'
        : rawTime
          ? 'success'
          : 'idle';

    return {
      state,
      lastSyncTime: rawTime ? Number(rawTime) : null,
      isSyncing: this.isSyncing,
      error: this.lastError,
    };
  }

  public subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.getStatus());
    return () => this.listeners.delete(callback);
  }

  private notifyStatus(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }

  // ─── Auto-Sync Scheduler ────────────────────────────────────
  public startAutoSync(intervalMs = this.autoSyncIntervalMs): void {
    this.stopAutoSync();
    this.autoSyncIntervalMs = intervalMs;

    if (this.autoSyncIntervalMs <= 0) return;

    this.syncTimer = setInterval(() => {
      if (this.hasStoredCredentials()) {
        this.sync().catch((err) => console.warn('Background auto-sync failed:', err));
      }
    }, this.autoSyncIntervalMs);

    window.addEventListener('online', this.handleEventSync);
    document.addEventListener('visibilitychange', this.handleVisibilitySync);

    // Immediate sync on startup if credentials exist
    if (this.hasStoredCredentials()) {
      this.sync().catch((err) => console.warn('Startup auto-sync failed:', err));
    }
  }

  public stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    window.removeEventListener('online', this.handleEventSync);
    document.removeEventListener('visibilitychange', this.handleVisibilitySync);
  }

  private handleEventSync = () => {
    if (this.hasStoredCredentials()) {
      this.sync().catch((err) => console.warn('Event auto-sync failed:', err));
    }
  };

  private handleVisibilitySync = () => {
    if (document.visibilityState === 'visible') {
      this.handleEventSync();
    }
  };

  // ─── Backup File Name Generator ─────────────────────────────
  public generateBackupFileName(): string {
    return this.driveApi.generateBackupFileName();
  }

  // ─── Folder Management ──────────────────────────────────────
  async getOrCreateFolder(token: string | null, folderName: string): Promise<string> {
    return this.driveApi.getOrCreateFolder(token, folderName);
  }

  async ensureAppFolders(
    token: string | null,
    folderNames = this.defaultFolders
  ): Promise<Record<string, string>> {
    return this.driveApi.ensureAppFolders(token, folderNames);
  }

  // ─── Token & Session Management ────────────────────────────
  async ensureValidToken(token?: string | null): Promise<string> {
    return this.tokenAuth.ensureValidToken(token);
  }

  hasCachedSession(): boolean {
    return this.tokenAuth.hasStoredCredentials();
  }

  hasValidAccessToken(): boolean {
    return this.tokenAuth.hasValidAccessToken();
  }

  hasStoredCredentials(): boolean {
    return this.tokenAuth.hasStoredCredentials();
  }

  getStorageKeys(): string[] {
    return [...this.tokenAuth.getStorageKeys(), this.lastSyncKey, this.tombstones.getStorageKey()];
  }

  async authenticate(): Promise<string | null> {
    return this.tokenAuth.authenticate();
  }

  async getValidToken(forceInteractive = false): Promise<string | null> {
    return this.tokenAuth.getValidToken(forceInteractive);
  }

  async requestAuth(prompt: '' | 'consent' | 'select_account' = ''): Promise<string | null> {
    return this.tokenAuth.requestAuth(prompt);
  }

  clearSession(): void {
    this.stopAutoSync();
    this.tokenAuth.clearTokens();
    try {
      localStorage.removeItem(this.lastSyncKey);
    } catch (e) {
      console.warn('Failed to clear last sync timestamp locally:', e);
    }
    this.tombstones.clear();
    this.notifyStatus();
  }

  // ─── File Operations ────────────────────────────────────────
  async findBackupFile(
    token: string,
    fileName: string,
    parentFolderId = 'appDataFolder'
  ): Promise<GDriveFile | null> {
    return this.driveApi.findBackupFile(token, fileName, parentFolderId);
  }

  async findLatestBackupFile(
    token: string,
    parentFolderId = 'appDataFolder'
  ): Promise<GDriveFile | null> {
    return this.driveApi.findLatestBackupFile(token, parentFolderId);
  }

  async createFile(
    token: string,
    contentBlob: Blob,
    fileName: string,
    parentFolderId = 'appDataFolder'
  ): Promise<GDriveFile> {
    return this.driveApi.createFile(token, contentBlob, fileName, parentFolderId);
  }

  async readFile<T = unknown>(token: string, fileId: string): Promise<T> {
    return this.driveApi.readFile<T>(token, fileId);
  }

  // ─── Sync Engine ────────────────────────────────────────────
  async sync(): Promise<void> {
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.lastError = null;
    this.notifyStatus();

    try {
      const activeToken = await this.ensureValidToken();
      const folders = await this.ensureAppFolders(activeToken);
      const backupFolderId = folders['Backups'] || 'appDataFolder';

      const latestRemoteFile = await this.findLatestBackupFile(activeToken, backupFolderId);

      if (this.conflictStrategy === 'local-wins' || !latestRemoteFile) {
        await this.exportBackupToDrive(activeToken);
      } else if (this.conflictStrategy === 'remote-wins') {
        await this.importBackupFromDrive(activeToken, latestRemoteFile.name);
      } else {
        const remoteData = await this.readFile<{
          accounts?: unknown;
          transactions?: unknown;
          categories?: unknown;
          deletedIds?: unknown;
        }>(activeToken, latestRemoteFile.id);

        sanitizeIdList(remoteData.deletedIds).forEach((id) => this.markAsDeleted(id));

        const localAccounts = await db.accounts.toArray();
        const localTransactions = await db.transactions.toArray();
        const localCategories = await db.categories.toArray();

        const deletedIds = this.getDeletedIds();
        const remoteAccounts = sanitizeEntityList<Account>(remoteData.accounts);
        const remoteTransactions = sanitizeEntityList<Transaction>(remoteData.transactions);
        const remoteCategories = sanitizeEntityList<Category>(remoteData.categories);

        const mergedAccounts = mergeEntities(localAccounts, remoteAccounts, deletedIds);
        const mergedTransactions = mergeEntities(localTransactions, remoteTransactions, deletedIds);
        const mergedCategories = mergeEntities(localCategories, remoteCategories, deletedIds);

        await db.transaction('rw', [db.accounts, db.transactions, db.categories], async () => {
          await db.accounts.clear();
          await db.transactions.clear();
          await db.categories.clear();

          if (mergedAccounts.length) await db.accounts.bulkPut(mergedAccounts);
          if (mergedTransactions.length) await db.transactions.bulkPut(mergedTransactions);
          if (mergedCategories.length) await db.categories.bulkPut(mergedCategories);
        });

        const mergedDeletedIds = Array.from(this.getDeletedIds());
        const remoteUpToDate =
          areEntityListsEqual(mergedAccounts, remoteAccounts) &&
          areEntityListsEqual(mergedTransactions, remoteTransactions) &&
          areEntityListsEqual(mergedCategories, remoteCategories) &&
          areIdListsEqual(mergedDeletedIds, sanitizeIdList(remoteData.deletedIds));

        if (!remoteUpToDate) {
          const mergedBlob = new Blob(
            [
              JSON.stringify(
                {
                  accounts: mergedAccounts,
                  transactions: mergedTransactions,
                  categories: mergedCategories,
                  deletedIds: mergedDeletedIds,
                  exportedAt: new Date().toISOString(),
                },
                null,
                2
              ),
            ],
            { type: 'application/json' }
          );

          await this.createFile(activeToken, mergedBlob, this.generateBackupFileName(), backupFolderId);
        }
      }

      await this.driveApi.pruneOldBackups(activeToken, backupFolderId, this.maxBackupsToKeep);
      localStorage.setItem(this.lastSyncKey, Date.now().toString());
    } catch (err: unknown) {
      this.lastError = err instanceof Error ? err.message : 'Synchronization failed.';
      throw err;
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
    }
  }

  // ─── Backup & Restore ───────────────────────────────────────
  async exportBackupToDrive(token?: string, customFileName?: string): Promise<string> {
    const activeToken = await this.ensureValidToken(token);
    const folders = await this.ensureAppFolders(activeToken);
    const backupFolderId = folders['Backups'] || 'appDataFolder';

    const fileName = customFileName || this.generateBackupFileName();

    const data = {
      accounts: await db.accounts.toArray(),
      transactions: await db.transactions.toArray(),
      categories: await db.categories.toArray(),
      deletedIds: Array.from(this.getDeletedIds()),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

    await this.createFile(activeToken, blob, fileName, backupFolderId);
    await this.driveApi.pruneOldBackups(activeToken, backupFolderId, this.maxBackupsToKeep);
    return fileName;
  }

  async importBackupFromDrive(token?: string, customFileName?: string): Promise<void> {
    const activeToken = await this.ensureValidToken(token);
    const folders = await this.ensureAppFolders(activeToken);
    const backupFolderId = folders['Backups'] || 'appDataFolder';

    const fileToImport = customFileName
      ? await this.findBackupFile(activeToken, customFileName, backupFolderId)
      : await this.findLatestBackupFile(activeToken, backupFolderId);

    if (!fileToImport) {
      throw new Error('No valid backup file found on Google Drive.');
    }

    const data = await this.readFile<{
      accounts?: unknown;
      transactions?: unknown;
      categories?: unknown;
      deletedIds?: unknown;
    }>(activeToken, fileToImport.id);

    sanitizeIdList(data.deletedIds).forEach((id) => this.markAsDeleted(id));

    const accounts = sanitizeEntityList<Account>(data.accounts);
    const transactions = sanitizeEntityList<Transaction>(data.transactions);
    const categories = sanitizeEntityList<Category>(data.categories);

    await db.transaction('rw', [db.accounts, db.transactions, db.categories], async () => {
      await db.accounts.clear();
      await db.transactions.clear();
      await db.categories.clear();

      if (accounts.length) await db.accounts.bulkPut(accounts);
      if (transactions.length) await db.transactions.bulkPut(transactions);
      if (categories.length) await db.categories.bulkPut(categories);
    });
  }
}

// ─── Exported Helpers ─────────────────────────────────────────

export const recordDeletedEntityId = (id: string): void => {
  GDriveSyncService.getInstance().markAsDeleted(id);
};

export const recordDeletedTransactionId = recordDeletedEntityId;