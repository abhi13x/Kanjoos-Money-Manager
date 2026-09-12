const MAX_TOMBSTONES = 2000;

/** Tracks locally-deleted entity ids so a Google Drive sync doesn't resurrect them from a stale backup. */
export class GDriveTombstoneStore {
  private deletedKey: string;

  constructor(deletedKey: string) {
    this.deletedKey = deletedKey;
  }

  configure(deletedKey?: string): void {
    if (deletedKey) this.deletedKey = deletedKey;
  }

  /** Marks a single ID as deleted and bumps it to the most recent position. */
  markAsDeleted(id: string): void {
    if (!id) return;
    this.markAsDeletedBatch([id]);
  }

  /**
   * Marks multiple IDs as deleted in a single atomic localStorage operation.
   * Refreshes insertion order so active tombstones are not evicted during trimming.
   */
  markAsDeletedBatch(ids: Iterable<string>): void {
    try {
      const deleted = this.getDeletedIds();

      for (const id of ids) {
        if (!id || typeof id !== 'string') continue;
        // Delete first to reset insertion order and bump to the end of the Set
        deleted.delete(id);
        deleted.add(id);
      }

      // Keep only the most recent tombstones so storage stays bounded
      const trimmed = Array.from(deleted).slice(-MAX_TOMBSTONES);
      localStorage.setItem(this.deletedKey, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to record deleted IDs locally:', e);
    }
  }

  getDeletedIds(): Set<string> {
    try {
      const raw = localStorage.getItem(this.deletedKey);
      if (!raw) return new Set();

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed) : new Set();
    } catch {
      return new Set();
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.deletedKey);
    } catch (e) {
      console.warn('Failed to clear tombstone store:', e);
    }
  }

  /** The localStorage key name this store reads/writes. */
  getStorageKey(): string {
    return this.deletedKey;
  }
}