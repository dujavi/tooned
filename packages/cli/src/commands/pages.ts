import { truncateForToon } from '@tooned/core';
import { createConfluenceClient, resolvePageId } from '@tooned/confluence';
import { parseConfluenceUrl } from '@tooned/jira';
import { closeDb, getDb, getPageById, listPages } from '@tooned/sync';
import { fetchPage, fetchPages, ServiceClientError } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError, localSyncMeta } from './shared.js';

async function resolvePageIdentifier(
  input: string,
  config: NonNullable<ReturnType<typeof loadConfigOrEmitError>>,
): Promise<string | null> {
  if (/^\d+$/.test(input)) {
    return input;
  }

  const parsed = parseConfluenceUrl(input);
  if (parsed?.pageId) {
    return parsed.pageId;
  }

  if (parsed?.kind === 'tiny') {
    const client = createConfluenceClient(config);
    return resolvePageId(input, client);
  }

  return null;
}

export async function runPagesList(options: { space?: string; limit?: number }): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const response = await fetchPages(config, options);
    console.log(
      formatToon(response.syncMeta, {
        pageCount: response.pageCount,
        count: response.count,
        pages: response.pages,
        help: ['Run `tooned pages view <pageId>` for page details'],
      }),
    );
    return 0;
  } catch (error) {
    if (!(error instanceof ServiceClientError)) {
      return handleServiceError(config, error);
    }
  }

  const db = getDb(config.TOONED_DATA_DIR);
  const pages = listPages(db, { space: options.space, limit: options.limit ?? 20 });
  closeDb();
  console.log(
    formatToon(localSyncMeta(config), {
      count: pages.length,
      pages: pages.map((page) => ({
        pageId: page.pageId,
        title: page.title,
        spaceKey: page.spaceKey,
        url: page.url,
        sourceUpdatedAt: page.sourceUpdatedAt,
      })),
      help: ['Run `tooned pages view <pageId>` for page details'],
    }),
  );
  return 0;
}

export async function runPagesView(input: string, options: { full?: boolean }): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  const pageId = await resolvePageIdentifier(input, config);
  if (!pageId) {
    console.log(
      formatToon(localSyncMeta(config), {
        error: `Could not resolve Confluence page: ${input}`,
        help: [
          'Use a numeric page ID or a /wiki/ URL',
          'Folder URLs are not pages and cannot be viewed',
        ],
      }),
    );
    return 1;
  }

  try {
    const response = await fetchPage(config, pageId);
    const body = options.full
      ? response.page.bodyMd ?? ''
      : truncateForToon(response.page.bodyMd ?? response.page.excerpt ?? '').value;
    console.log(
      formatToon(response.syncMeta, {
        pageCount: response.pageCount,
        page: {
          pageId: response.page.pageId,
          title: response.page.title,
          spaceKey: response.page.spaceKey,
          url: response.page.url,
          labels: response.page.labels,
          ancestorTitles: response.page.ancestorTitles,
          body,
          bodySize: response.page.bodySize,
          refs: response.page.refs,
        },
        help: options.full
          ? undefined
          : ['Run `tooned pages view <pageId> --full` for complete body'],
      }),
    );
    return 0;
  } catch (error) {
    if (!(error instanceof ServiceClientError)) {
      return handleServiceError(config, error);
    }
  }

  const db = getDb(config.TOONED_DATA_DIR);
  const page = getPageById(db, pageId);
  closeDb();
  if (!page) {
    console.log(
      formatToon(localSyncMeta(config), {
        error: `Page not found: ${pageId}`,
        help: ['Run `tooned sync --force` to crawl Confluence pages'],
      }),
    );
    return 1;
  }

  let labels: string[] = [];
  if (page.labelsJson) {
    try {
      const parsed = JSON.parse(page.labelsJson) as unknown;
      if (Array.isArray(parsed)) {
        labels = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      labels = [];
    }
  }

  const body = options.full ? page.bodyMd ?? '' : truncateForToon(page.bodyMd ?? '').value;
  console.log(
    formatToon(localSyncMeta(config), {
      page: {
        pageId: page.pageId,
        title: page.title,
        spaceKey: page.spaceKey,
        url: page.url,
        labels,
        ancestorTitles: page.ancestorTitles,
        body,
        bodySize: (page.bodyMd ?? '').length,
      },
      help: options.full ? undefined : ['Run `tooned pages view <pageId> --full` for complete body'],
    }),
  );
  return 0;
}
