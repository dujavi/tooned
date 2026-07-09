import { buildSyncMeta } from '@tooned/core';
import { runSync } from '@tooned/sync';
import { ServiceClientError, triggerSync } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError, localSyncMeta } from './shared.js';

export async function runSyncCommand(force: boolean): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const serviceResult = await triggerSync(config, force);
    console.log(
      formatToon(serviceResult.syncMeta, {
        sync: {
          mode: serviceResult.result.mode,
          bootstrapProcessed: serviceResult.result.bootstrapProcessed,
          deltaProcessed: serviceResult.result.deltaProcessed,
          parentRefreshCount: serviceResult.result.parentRefreshCount,
          linkedBugCount: serviceResult.result.linkedBugCount,
          lastSync: serviceResult.syncMeta.lastSync ?? null,
        },
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
    const localResult = await runSync(config, { force });
    console.log(
      formatToon(buildSyncMeta(localResult.lastSync, 'idle'), {
        sync: {
          mode: localResult.mode,
          bootstrapProcessed: localResult.bootstrapProcessed,
          deltaProcessed: localResult.deltaProcessed,
          parentRefreshCount: localResult.parentRefreshCount,
          linkedBugCount: localResult.linkedBugCount,
          lastSync: localResult.lastSync,
        },
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
