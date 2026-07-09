import type { SyncMeta, SyncStatus } from './types.js';

export function buildSyncMeta(
  lastSync: string | null,
  syncStatus: SyncStatus,
  now: Date = new Date(),
): SyncMeta {
  const dataAgeSeconds =
    lastSync === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(lastSync).getTime()) / 1000));

  return {
    lastSync,
    dataAgeSeconds,
    syncStatus,
  };
}
