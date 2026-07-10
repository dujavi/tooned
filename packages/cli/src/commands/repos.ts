import { closeDb, getDb, listReposIndexed } from '@tooned/sync';
import { fetchRepos, ServiceClientError } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError, localSyncMeta } from './shared.js';

export async function runReposList(): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const response = await fetchRepos(config);
    console.log(
      formatToon(response.syncMeta, {
        codeFileCount: response.codeFileCount,
        count: response.count,
        repos: response.repos,
        help: ['Run `tooned code view <account>/<repo>:<path>` for file content'],
      }),
    );
    return 0;
  } catch (error) {
    if (!(error instanceof ServiceClientError)) {
      return handleServiceError(config, error);
    }
  }

  const db = getDb(config.TOONED_DATA_DIR);
  const repos = listReposIndexed(db);
  closeDb();
  console.log(
    formatToon(localSyncMeta(config), {
      count: repos.length,
      repos,
      help: ['Run `tooned code view <account>/<repo>:<path>` for file content'],
    }),
  );
  return 0;
}
