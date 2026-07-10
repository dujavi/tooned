import { fetchSearch } from '../client.js';
import { formatEmptySearchToon, formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError } from './shared.js';

export type SearchScope = 'all' | 'stories' | 'docs' | 'code' | 'comments' | 'notes';

function mapSearchResult(row: {
  source?: 'story' | 'doc' | 'code';
  key?: string;
  pageId?: string;
  fileId?: string;
  repository?: string;
  path?: string;
  title?: string;
  summary?: string | null;
  status?: string | null;
  spaceKey?: string | null;
  url?: string | null;
  excerpt?: string | null;
  comments?: number;
  subtasks?: number;
  prs?: number;
}): Record<string, unknown> {
  const source = row.source ?? 'story';
  if (source === 'doc') {
    return {
      source,
      pageId: row.pageId ?? '',
      title: row.title ?? row.pageId ?? '',
      spaceKey: row.spaceKey ?? '',
      url: row.url ?? '',
      excerpt: row.excerpt ?? row.summary ?? '',
    };
  }
  if (source === 'code') {
    return {
      source,
      fileId: row.fileId ?? '',
      repository: row.repository ?? '',
      path: row.path ?? row.title ?? '',
      title: row.title ?? row.path ?? '',
      excerpt: row.excerpt ?? row.summary ?? '',
    };
  }

  return {
    source,
    key: row.key ?? '',
    title: row.title ?? row.summary ?? row.key ?? '',
    status: row.status ?? '',
    comments: row.comments ?? 0,
    subtasks: row.subtasks ?? 0,
    prs: row.prs ?? 0,
  };
}

function searchHelp(scope: SearchScope): string[] {
  if (scope === 'docs') {
    return ['Run `tooned pages view <pageId>` for page details'];
  }
  if (scope === 'code') {
    return ['Run `tooned code view <account>/<repo>:<path>` for file content'];
  }
  if (scope === 'all') {
    return [
      'Run `tooned stories view <KEY>` for story details',
      'Run `tooned pages view <pageId>` for doc details',
      'Run `tooned code view <account>/<repo>:<path>` for code details',
    ];
  }
  return ['Run `tooned stories view <KEY>` for story details'];
}

export async function runSearch(
  query: string,
  options: {
    inScope?: SearchScope;
    sprint?: string;
    status?: string;
    since?: string;
    limit?: number;
  },
): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  const scope = options.inScope ?? 'all';

  try {
    const result = await fetchSearch(config, {
      query,
      inScope: scope,
      sprint: options.sprint,
      status: options.status,
      since: options.since,
      limit: options.limit,
    });

    if (scope === 'code' && result.codeSearchStatus) {
      console.log(
        formatToon(result.syncMeta, {
          query,
          scope,
          count: '0 matches',
          results: [],
          pageCount: result.pageCount,
          codeSearchStatus: result.codeSearchStatus,
          help: result.help ?? ['Code search is not available'],
        }),
      );
      return 0;
    }

    if (result.results.length === 0) {
      console.log(
        formatEmptySearchToon(result.syncMeta, query, scope, {
          codeSearchStatus: result.codeSearchStatus,
          help: result.help,
        }),
      );
      return 0;
    }

    console.log(
      formatToon(result.syncMeta, {
        query,
        scope,
        pageCount: result.pageCount,
        count: `${result.count} matches`,
        results: result.results.map(mapSearchResult),
        ...(result.codeSearchStatus ? { codeSearchStatus: result.codeSearchStatus } : {}),
        help: result.help ?? searchHelp(scope),
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
