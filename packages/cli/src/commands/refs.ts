import { fetchRefsSearch } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError } from './shared.js';

export async function runRefsSearch(query: string): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchRefsSearch(config, query);
    if (result.refs.length === 0) {
      console.log(
        formatToon(result.syncMeta, {
          refs: `0 refs found for "${query}"`,
          help: ['Run `tooned search "<query>"` to search stories and notes'],
        }),
      );
      return 0;
    }

    console.log(
      formatToon(result.syncMeta, {
        query,
        count: `${result.refs.length} refs`,
        refs: result.refs,
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
