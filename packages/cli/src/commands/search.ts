import { fetchSearch } from '../client.js';
import { formatEmptySearchToon, formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError } from './shared.js';

export async function runSearch(
  query: string,
  options: { inScope?: 'all' | 'comments' | 'notes'; sprint?: string; status?: string; since?: string },
): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const result = await fetchSearch(config, {
      query,
      inScope: options.inScope,
      sprint: options.sprint,
      status: options.status,
      since: options.since,
    });
    if (result.results.length === 0) {
      console.log(formatEmptySearchToon(result.syncMeta, query));
      return 0;
    }

    console.log(
      formatToon(result.syncMeta, {
        query,
        count: `${result.count} matches`,
        results: result.results.map((row) => ({
          key: row.key,
          summary: row.summary ?? '',
          status: row.status ?? '',
          comments: row.comments,
          subtasks: row.subtasks,
          prs: row.prs,
        })),
        help: ['Run `tooned stories view <KEY>` for story details'],
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
