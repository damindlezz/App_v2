/** Central storage/runtime bounds. Backups explicitly request limit=0. */
export const STORAGE_RETENTION = Object.freeze({
  exerciseResults: 5000,
  historyEntries: 5000,
  sessions: 2000
});

export const RUNTIME_DATA_LIMITS = Object.freeze({
  exerciseResults: 1200,
  historyEntries: 100,
  sessions: 2000
});
