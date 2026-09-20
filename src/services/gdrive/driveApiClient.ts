import type { GDriveFile } from './gdriveTypes';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveApiClientConfig {
  /** Resolves (and if necessary, silently renews) an access token, throwing if unavailable. */
  resolveToken: (token?: string | null) => Promise<string>;
  /** Called when the Drive API reports the current token is invalid/expired. */
  onUnauthorized: () => Promise<void> | void;
}

/** Thin, stateless wrapper around the Google Drive REST API (appDataFolder scope). */
export class DriveApiClient {
  private resolveToken: (token?: string | null) => Promise<string>;
  private onUnauthorized: () => Promise<void> | void;

  constructor(config: DriveApiClientConfig) {
    this.resolveToken = config.resolveToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  private escapeQuery(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async driveFetch<T = unknown>(
    url: string,
    token: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      await this.onUnauthorized();
      throw new Error('Authentication failed or token expired. Please reconnect.');
    }

    if (response.status === 403 || response.status === 429) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      const reason = errorData.error?.errors?.[0]?.reason || '';
      const message = errorData.error?.message || response.statusText;

      if (reason.includes('rateLimit') || reason.includes('quota') || response.status === 429) {
        throw new Error(`Google Drive rate limit exceeded: ${message}`);
      }

      throw new Error(`Google API Forbidden (403): ${message}`);
    }

    if (!response.ok) {
      throw new Error(`Google Drive API Error (${response.status}): ${response.statusText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /** Generates a lexicographically sortable timestamped backup file name (e.g., `BKP_20260912_120000_000.json`). */
  generateBackupFileName(): string {
    const now = new Date();
    const pad = (num: number, len = 2) => String(num).padStart(len, '0');

    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const HH = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const fff = pad(now.getMilliseconds(), 3);

    return `BKP_${YYYY}${MM}${DD}_${HH}${mm}${ss}_${fff}.json`;
  }

  async getOrCreateFolder(token: string | null, folderName: string): Promise<string> {
    const activeToken = await this.resolveToken(token);
    const safeName = this.escapeQuery(folderName);
    const query = encodeURIComponent(
      `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and 'appDataFolder' in parents and trashed = false`
    );

    const searchData = await this.driveFetch<{ files?: GDriveFile[] }>(
      `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`,
      activeToken
    );

    if (searchData.files?.[0]?.id) {
      return searchData.files[0].id;
    }

    const folderData = await this.driveFetch<{ id: string }>(
      `${DRIVE_API_BASE}/files?fields=id`,
      activeToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['appDataFolder'],
        }),
      }
    );

    return folderData.id;
  }

  async ensureAppFolders(
    token: string | null,
    folderNames: string[]
  ): Promise<Record<string, string>> {
    const activeToken = await this.resolveToken(token);
    const folderEntries: Array<[string, string]> = [];

    // Process sequentially to prevent concurrent duplicate folder creation
    for (const name of folderNames) {
      const folderId = await this.getOrCreateFolder(activeToken, name);
      folderEntries.push([name, folderId]);
    }

    return Object.fromEntries(folderEntries);
  }

  async pruneOldBackups(token: string, parentFolderId: string, maxBackupsToKeep: number): Promise<void> {
    const query = encodeURIComponent(
      `'${this.escapeQuery(parentFolderId)}' in parents and trashed = false and name contains 'BKP_'`
    );

    const result = await this.driveFetch<{ files?: GDriveFile[] }>(
      `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${query}&orderBy=createdTime%20desc&pageSize=100&fields=files(id,name,createdTime)`,
      token
    );

    const files = result.files || [];
    if (files.length > maxBackupsToKeep) {
      const filesToDelete = files.slice(maxBackupsToKeep);

      // Delete sequentially to prevent HTTP 429 / 403 Rate Limit errors
      for (const file of filesToDelete) {
        try {
          await this.driveFetch(`${DRIVE_API_BASE}/files/${file.id}`, token, { method: 'DELETE' });
        } catch (err) {
          console.warn(`Failed to prune backup file ${file.id}:`, err);
        }
      }
    }
  }

  async findBackupFile(
    token: string,
    fileName: string,
    parentFolderId = 'appDataFolder'
  ): Promise<GDriveFile | null> {
    const safeName = this.escapeQuery(fileName);
    const safeParent = this.escapeQuery(parentFolderId);
    const query = encodeURIComponent(
      `name = '${safeName}' and '${safeParent}' in parents and trashed = false`
    );

    const result = await this.driveFetch<{ files?: GDriveFile[] }>(
      `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`,
      token
    );

    return result.files?.[0] || null;
  }

  async findLatestBackupFile(
    token: string,
    parentFolderId = 'appDataFolder'
  ): Promise<GDriveFile | null> {
    const safeParent = this.escapeQuery(parentFolderId);
    const query = encodeURIComponent(
      `'${safeParent}' in parents and trashed = false and name contains 'BKP_'`
    );

    const result = await this.driveFetch<{ files?: GDriveFile[] }>(
      `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${query}&orderBy=createdTime%20desc&pageSize=1&fields=files(id,name,createdTime)`,
      token
    );

    return result.files?.[0] || null;
  }

  async createFile(
    token: string,
    contentBlob: Blob,
    fileName: string,
    parentFolderId = 'appDataFolder'
  ): Promise<GDriveFile> {
    const metadata = {
      name: fileName,
      parents: [parentFolderId],
      mimeType: 'application/json',
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', contentBlob);

    return this.driveFetch<GDriveFile>(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name`,
      token,
      { method: 'POST', body: form }
    );
  }

  async readFile<T = unknown>(token: string, fileId: string): Promise<T> {
    return this.driveFetch<T>(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, token);
  }
}