import type { GDriveFile } from './gdriveTypes';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveApiClientConfig {
  resolveToken: (token?: string | null) => Promise<string>;
  /**
   * Attempts a **silent** token refresh. Must never open interactive UI.
   * Returns a fresh token on success, or `null` if the user must re-connect.
   */
  onUnauthorized: () => Promise<string | null>;
}

export class DriveApiClient {
  private resolveToken: (token?: string | null) => Promise<string>;
  private onUnauthorized: () => Promise<string | null>;

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
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      if (isRetry) {
        throw new Error('Authentication failed or token expired. Please reconnect.');
      }
      const fresh = await this.onUnauthorized();
      if (!fresh) {
        throw new Error('Authentication failed or token expired. Please reconnect.');
      }
      // Safe to retry: request bodies are FormData / strings, both reusable.
      return this.driveFetch<T>(url, fresh, options, true);
    }

    if (response.status === 403) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        `Google API Forbidden: ${errorData.error?.message || 'Check Drive API configuration'}`
      );
    }

    if (!response.ok) {
      throw new Error(`Google Drive API Error (${response.status}): ${response.statusText}`);
    }

    if (response.status === 204) return {} as T;

    return response.json() as Promise<T>;
  }

  generateBackupFileName(): string {
    const now = new Date();
    const pad = (num: number, len = 2) => String(num).padStart(len, '0');
    const DD = pad(now.getDate());
    const MM = pad(now.getMonth() + 1);
    const YY = String(now.getFullYear()).slice(-2);
    const HH = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const fff = pad(now.getMilliseconds(), 3);
    return `BKP_${DD}${MM}${YY}_${HH}${mm}${ss}_${fff}.json`;
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

    if (searchData.files?.[0]?.id) return searchData.files[0].id;

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
    const entries = await Promise.all(
      folderNames.map(async (name) => [name, await this.getOrCreateFolder(activeToken, name)] as const)
    );
    return Object.fromEntries(entries);
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
      await Promise.all(
        files.slice(maxBackupsToKeep).map((file) =>
          this.driveFetch(`${DRIVE_API_BASE}/files/${file.id}`, token, { method: 'DELETE' }).catch(
            (err) => console.warn(`Failed to prune backup file ${file.id}:`, err)
          )
        )
      );
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
    const metadata = { name: fileName, parents: [parentFolderId] };
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