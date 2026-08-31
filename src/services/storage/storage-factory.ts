import type { StorageService } from './storage-service';
import { IndexedDbStorage } from './indexeddb-storage';

export async function createStorageService(): Promise<StorageService> {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    const { TauriSqliteStorage } = await import('./tauri-sqlite-storage');
    return new TauriSqliteStorage();
  }
  return new IndexedDbStorage();
}
