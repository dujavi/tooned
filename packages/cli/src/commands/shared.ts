import {
  buildSyncMeta,
  formatConfigError,
  loadConfig,
  projectStoryDetail,
  truncateForToon,
  type Config,
  type SyncMeta,
} from '@tooned/core';
import { closeDb, getDb, getSyncStateValue } from '@tooned/sync';
import { ServiceClientError } from '../client.js';
import { formatConfigErrorToon, formatServiceDownToon, formatToon } from '../output.js';

interface SyncStateRecord {
  lastSync?: string | null;
  syncStatus?: 'idle' | 'syncing' | 'error';
}

export function parseFields(fields: string | undefined): string[] {
  if (!fields) {
    return [];
  }
  return fields
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pickFields<T extends Record<string, unknown>>(value: T, fields: string[]): Record<string, unknown> {
  if (fields.length === 0) {
    return value;
  }
  const selected: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in value) {
      selected[field] = value[field];
    }
  }
  return selected;
}

export function loadConfigOrEmitError(): Config | null {
  try {
    return loadConfig();
  } catch (error) {
    console.log(formatConfigErrorToon(formatConfigError(error)));
    return null;
  }
}

export function localSyncMeta(config: Config): SyncMeta {
  const db = getDb(config.TOONED_DATA_DIR);
  const syncState = getSyncStateValue<SyncStateRecord>(db, 'sync') ?? {};
  const syncMeta = buildSyncMeta(syncState.lastSync ?? null, syncState.syncStatus ?? 'idle');
  closeDb();
  return syncMeta;
}

export function handleServiceError(config: Config, error: unknown): number {
  if (error instanceof ServiceClientError && (error.code === 'connection_refused' || error.code === 'timeout')) {
    console.log(formatServiceDownToon(config.TOONED_SERVICE_PORT, error.code));
    return 1;
  }

  const syncMeta = localSyncMeta(config);
  const message = error instanceof Error ? error.message : 'Command failed';
  console.log(formatToon(syncMeta, { error: message }));
  return 1;
}

export function maybeTruncate(text: string | null | undefined, full: boolean): {
  value: string;
  size: number;
  truncated: boolean;
} {
  if (full) {
    const value = text ?? '';
    return { value, size: value.length, truncated: false };
  }
  const truncated = truncateForToon(text ?? '');
  return {
    value: truncated.value,
    size: truncated.totalSize,
    truncated: truncated.truncated,
  };
}

export function toStoryDetail<T extends { key: string; summary: string; status: string; description?: string | null }>(
  story: T,
  full: boolean,
): T & { descriptionSize?: number; descriptionTruncated?: boolean } {
  return projectStoryDetail(story, { full, truncateAt: 500 });
}
