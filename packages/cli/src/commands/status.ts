import {
  closeDb,
  getDb,
  getConfluencePageCount,
  getStoryCount,
  getSyncStateValue,
  CONFLUENCE_BOOTSTRAP_COMPLETE_KEY,
  CONFLUENCE_LAST_SYNC_KEY,
} from '@tooned/sync';
import { fetchStatus } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError } from './shared.js';

export async function runStatus(): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) {
    return 1;
  }
  try {
    const status = await fetchStatus(config);
    const db = getDb(config.TOONED_DATA_DIR);
    const storyCount = getStoryCount(db);
    const pageCount = getConfluencePageCount(db);
    const confluenceBootstrapComplete =
      getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false;
    const confluenceLastSync = getSyncStateValue<string>(db, CONFLUENCE_LAST_SYNC_KEY) ?? null;
    closeDb();
    console.log(
      formatToon(status.syncMeta, {
        serviceRunning: true,
        storyCount,
        pageCount,
        confluenceBootstrapComplete,
        confluenceLastSync,
        help: ['Run `tooned sprint current --workload` for current capacity'],
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
