import {
  closeDb,
  getConfluencePageCount,
  getCodeFileCount,
  getDb,
  getStoryCount,
  getSyncStateValue,
  CODE_BOOTSTRAP_COMPLETE_KEY,
  CODE_LAST_SYNC_KEY,
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
    const codeReposConfigured = config.project.vcs.repos.length > 0;
    const codeFileCount = codeReposConfigured ? getCodeFileCount(db) : undefined;
    const confluenceBootstrapComplete =
      getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false;
    const confluenceLastSync = getSyncStateValue<string>(db, CONFLUENCE_LAST_SYNC_KEY) ?? null;
    const codeBootstrapComplete = codeReposConfigured
      ? (getSyncStateValue<boolean>(db, CODE_BOOTSTRAP_COMPLETE_KEY) ?? false)
      : undefined;
    const codeLastSync = codeReposConfigured
      ? (getSyncStateValue<string>(db, CODE_LAST_SYNC_KEY) ?? null)
      : undefined;
    closeDb();
    console.log(
      formatToon(status.syncMeta, {
        serviceRunning: true,
        storyCount,
        pageCount,
        ...(codeReposConfigured
          ? {
              codeFileCount,
              codeBootstrapComplete,
              codeLastSync,
            }
          : {}),
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
