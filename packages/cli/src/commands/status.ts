import { closeDb, getDb, getStoryCount } from '@tooned/sync';
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
    closeDb();
    console.log(
      formatToon(status.syncMeta, {
        serviceRunning: true,
        storyCount,
        help: ['Run `tooned sprint current --workload` for current capacity'],
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
