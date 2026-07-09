import { encode } from '@toon-format/toon';
import type { SyncMeta } from './types.js';

export interface TruncatedText {
  value: string;
  totalSize: number;
  truncated: boolean;
}

export function truncateForToon(input: string | null | undefined, maxLength: number = 500): TruncatedText {
  const value = input ?? '';
  const totalSize = value.length;
  if (value.length <= maxLength) {
    return {
      value,
      totalSize,
      truncated: false,
    };
  }

  return {
    value: `${value.slice(0, maxLength)}...`,
    totalSize,
    truncated: true,
  };
}

export function projectSyncMeta(syncMeta: SyncMeta): SyncMeta {
  return {
    lastSync: syncMeta.lastSync,
    dataAgeSeconds: syncMeta.dataAgeSeconds,
    syncStatus: syncMeta.syncStatus,
  };
}

export function projectStoryList(input: {
  stories: Array<{
    key: string;
    summary: string;
    status: string;
    comments?: number;
    subtasks?: number;
    prs?: number;
  }>;
  count: number;
  total: number;
}): {
  count: string;
  stories: Array<{
    key: string;
    summary: string;
    status: string;
    comments?: number;
    subtasks?: number;
    prs?: number;
  }>;
} {
  return {
    count: `${input.count} of ${input.total} total`,
    stories: input.stories,
  };
}

export function projectStoryDetail<
  T extends {
    key: string;
    summary: string;
    status: string;
    description?: string | null;
  },
>(story: T, options?: { full?: boolean; truncateAt?: number }): T & {
  descriptionSize?: number;
  descriptionTruncated?: boolean;
} {
  const full = options?.full ?? false;
  const truncateAt = options?.truncateAt ?? 500;
  const sourceDescription = story.description ?? '';
  if (full || sourceDescription.length === 0) {
    return {
      ...story,
      descriptionSize: sourceDescription.length,
      descriptionTruncated: false,
    };
  }

  const truncated = truncateForToon(sourceDescription, truncateAt);
  return {
    ...story,
    description: truncated.value,
    descriptionSize: truncated.totalSize,
    descriptionTruncated: truncated.truncated,
  };
}

export function encodeToonDocument(syncMeta: SyncMeta, payload: Record<string, unknown>): string {
  return encode({
    syncMeta: projectSyncMeta(syncMeta),
    ...payload,
  });
}
