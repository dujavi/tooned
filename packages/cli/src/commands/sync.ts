import { buildSyncMeta } from '@tooned/core';
import { resolveSyncSources, runSync, type SyncRunOptions, type SyncSource } from '@tooned/sync';
import { ServiceClientError, triggerSync } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError, localSyncMeta } from './shared.js';

export interface SyncCommandOptions {
  force?: boolean;
  jira?: boolean;
  confluence?: boolean;
  repos?: boolean;
}

export function buildSyncRunOptions(options: SyncCommandOptions): SyncRunOptions {
  const selected: SyncSource[] = [];
  if (options.jira) selected.push('jira');
  if (options.confluence) selected.push('confluence');
  if (options.repos) selected.push('repos');

  return {
    force: Boolean(options.force),
    sources: selected.length > 0 ? selected : undefined,
  };
}

function formatSyncResult(result: {
  sources: SyncSource[];
  mode: string;
  bootstrapProcessed: number;
  deltaProcessed: number;
  parentRefreshCount: number;
  linkedBugCount: number;
  lastSync: string;
}) {
  return {
    sources: result.sources,
    mode: result.mode,
    bootstrapProcessed: result.bootstrapProcessed,
    deltaProcessed: result.deltaProcessed,
    parentRefreshCount: result.parentRefreshCount,
    linkedBugCount: result.linkedBugCount,
    lastSync: result.lastSync,
  };
}

export async function runSyncCommand(options: SyncCommandOptions): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  const syncOptions = buildSyncRunOptions(options);
  const sources = resolveSyncSources(syncOptions);

  try {
    const serviceResult = await triggerSync(config, syncOptions);
    console.log(
      formatToon(serviceResult.syncMeta, {
        sync: formatSyncResult({
          ...serviceResult.result,
          sources: (serviceResult.result.sources as SyncSource[] | undefined) ?? sources,
        }),
        help: ['Run `tooned status` to confirm sync freshness'],
      }),
    );
    return 0;
  } catch (error) {
    if (!(error instanceof ServiceClientError) || error.code === 'invalid_response') {
      return handleServiceError(config, error);
    }
  }

  try {
    const localResult = await runSync(config, syncOptions);
    console.log(
      formatToon(buildSyncMeta(localResult.lastSync, 'idle'), {
        sync: formatSyncResult(localResult),
        help: ['Run `tooned serve` for background syncing'],
      }),
    );
    return 0;
  } catch (error) {
    const syncMeta = localSyncMeta(config);
    console.log(
      formatToon(syncMeta, {
        error: error instanceof Error ? error.message : 'sync failed',
      }),
    );
    return 1;
  }
}
