import type { Config } from '@tooned/core';
import { parseConfluenceUrl } from '@tooned/jira';

export class ConfluenceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ConfluenceError';
  }
}

export interface ConfluenceSpace {
  id: number;
  key: string;
  name: string;
  type?: string;
}

export interface ConfluencePage {
  id: string;
  type: string;
  title: string;
  status?: string;
  space?: {
    key?: string;
    name?: string;
  };
  version?: {
    number?: number;
    when?: string;
  };
  body?: {
    storage?: {
      value?: string;
      representation?: string;
    };
  };
  metadata?: {
    labels?: {
      results?: Array<{ name?: string }>;
    };
  };
  ancestors?: Array<{ id?: string; title?: string }>;
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  mediaType?: string;
  fileSize?: number;
  download?: string;
}

export interface ConfluenceSearchHit {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  space?: {
    key?: string;
    name?: string;
  };
}

export interface ConfluenceSearchPage {
  results: ConfluenceSearchHit[];
  nextCursor: string | null;
}

export interface ConfluenceClient {
  listSpaces(): Promise<ConfluenceSpace[]>;
  searchCql(cql: string, cursor?: string): Promise<ConfluenceSearchPage>;
  getPage(pageId: string, expand?: string[]): Promise<ConfluencePage>;
  listAttachments(pageId: string): Promise<ConfluenceAttachment[]>;
  resolveTinyLink(tinyId: string): Promise<string | null>;
  downloadAttachmentContent(downloadPath: string, maxBytes: number): Promise<string | null>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function wikiBaseUrl(config: Config): string {
  return `${normalizeBaseUrl(config.ATLASSIAN_BASE_URL)}/wiki`;
}

function authHeader(config: Config): string {
  const credentials = Buffer.from(`${config.ATLASSIAN_EMAIL}:${config.ATLASSIAN_TOKEN}`).toString(
    'base64',
  );
  return `Basic ${credentials}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMillis(response: Response): number | null {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) {
    return null;
  }
  const asSeconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(asSeconds)) {
    return Math.max(asSeconds * 1000, 0);
  }
  const asDate = new Date(retryAfter);
  const millis = asDate.getTime() - Date.now();
  if (Number.isNaN(millis)) {
    return null;
  }
  return Math.max(millis, 0);
}

async function confluenceFetch<T>(config: Config, path: string, init?: RequestInit): Promise<T> {
  const url = `${wikiBaseUrl(config)}${path}`;
  const maxAttempts = 5;
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: authHeader(config),
          ...(init?.headers ?? {}),
        },
      });
    } catch (error) {
      lastNetworkError = error;
      if (attempt < maxAttempts - 1) {
        await sleep(250 * Math.pow(2, attempt));
        continue;
      }
      const message = error instanceof Error ? error.message : 'Network request failed';
      throw new ConfluenceError(`Could not reach Confluence: ${message}`);
    }

    if (response.status === 429 || response.status === 503) {
      if (attempt < maxAttempts - 1) {
        const retryAfterMillis = parseRetryAfterMillis(response) ?? 500 * Math.pow(2, attempt);
        await sleep(retryAfterMillis);
        continue;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new ConfluenceError(
        'Confluence authentication failed — check ATLASSIAN_EMAIL and ATLASSIAN_TOKEN',
        response.status,
      );
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { message?: string };
        detail = body.message ?? detail;
      } catch {
        // ignore parse errors
      }
      throw new ConfluenceError(
        `Confluence request failed (${response.status}): ${detail}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  const message = lastNetworkError instanceof Error ? lastNetworkError.message : 'Request failed';
  throw new ConfluenceError(`Could not reach Confluence: ${message}`);
}

class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

interface SpacePageResponse {
  results?: ConfluenceSpace[];
  start?: number;
  limit?: number;
  size?: number;
}

interface SearchResponse {
  results?: RawSearchHit[];
  _links?: {
    next?: string;
  };
  nextCursor?: string;
  cqlQuery?: string;
}

interface RawSearchHit {
  id?: string;
  title?: string;
  type?: string;
  status?: string;
  space?: {
    key?: string;
    name?: string;
  };
  content?: {
    id?: string;
    type?: string;
    status?: string;
    title?: string;
    space?: {
      key?: string;
      name?: string;
    };
  };
}

function normalizeSearchHit(hit: RawSearchHit): ConfluenceSearchHit {
  const content = hit.content;
  return {
    id: content?.id ?? hit.id ?? '',
    title: content?.title ?? hit.title,
    type: content?.type ?? hit.type,
    status: content?.status ?? hit.status,
    space: content?.space ?? hit.space,
  };
}

interface AttachmentPageResponse {
  results?: ConfluenceAttachment[];
  start?: number;
  limit?: number;
  size?: number;
}

function extractCursor(nextLink: string | undefined): string | null {
  if (!nextLink) {
    return null;
  }
  try {
    const parsed = new URL(nextLink, 'https://example.invalid');
    return parsed.searchParams.get('cursor');
  } catch {
    return null;
  }
}

export function createConfluenceClient(config: Config): ConfluenceClient {
  const limiter = new ConcurrencyLimiter(Math.max(config.JIRA_MAX_CONCURRENT, 1));
  const runLimited = <T>(task: () => Promise<T>): Promise<T> => limiter.run(task);

  return {
    async listSpaces() {
      const spaces: ConfluenceSpace[] = [];
      let start = 0;
      const limit = 50;

      for (;;) {
        const query = new URLSearchParams({
          start: String(start),
          limit: String(limit),
        });
        const page = await runLimited(() =>
          confluenceFetch<SpacePageResponse>(config, `/rest/api/space?${query.toString()}`),
        );
        const results = page.results ?? [];
        spaces.push(...results);
        const nextStart = start + results.length;
        const reachedEnd = results.length === 0 || (page.size !== undefined && nextStart >= page.size);
        if (reachedEnd) {
          break;
        }
        start = nextStart;
      }

      return spaces;
    },

    async searchCql(cql, cursor) {
      const query = new URLSearchParams({
        cql,
        limit: '50',
      });
      if (cursor) {
        query.set('cursor', cursor);
      }

      const page = await runLimited(() =>
        confluenceFetch<SearchResponse>(config, `/rest/api/search?${query.toString()}`),
      );

      return {
        results: (page.results ?? []).map(normalizeSearchHit).filter((hit) => hit.id.length > 0),
        nextCursor: page.nextCursor ?? extractCursor(page._links?.next),
      };
    },

    async getPage(pageId, expand) {
      const query = new URLSearchParams();
      if (expand && expand.length > 0) {
        query.set('expand', expand.join(','));
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return runLimited(() =>
        confluenceFetch<ConfluencePage>(
          config,
          `/rest/api/content/${encodeURIComponent(pageId)}${suffix}`,
        ),
      );
    },

    async listAttachments(pageId) {
      const attachments: ConfluenceAttachment[] = [];
      let start = 0;
      const limit = 50;

      for (;;) {
        const query = new URLSearchParams({
          start: String(start),
          limit: String(limit),
        });
        const page = await runLimited(() =>
          confluenceFetch<AttachmentPageResponse>(
            config,
            `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?${query.toString()}`,
          ),
        );
        const results = page.results ?? [];
        attachments.push(...results);
        const nextStart = start + results.length;
        const reachedEnd = results.length === 0 || (page.size !== undefined && nextStart >= page.size);
        if (reachedEnd) {
          break;
        }
        start = nextStart;
      }

      return attachments;
    },

    async resolveTinyLink(tinyId) {
      const tinyUrl = `${wikiBaseUrl(config)}/x/${encodeURIComponent(tinyId)}`;
      let response: Response;
      try {
        response = await fetch(tinyUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            Authorization: authHeader(config),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Network request failed';
        throw new ConfluenceError(`Could not resolve Confluence tiny link: ${message}`);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          return parseConfluenceUrl(location)?.pageId ?? null;
        }
      }

      return null;
    },

    async downloadAttachmentContent(downloadPath, maxBytes) {
      const url = downloadPath.startsWith('http')
        ? downloadPath
        : `${wikiBaseUrl(config)}${downloadPath.startsWith('/') ? downloadPath : `/${downloadPath}`}`;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: authHeader(config),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Network request failed';
        throw new ConfluenceError(`Could not download Confluence attachment: ${message}`);
      }

      if (!response.ok) {
        throw new ConfluenceError(
          `Confluence attachment download failed (${response.status})`,
          response.status,
        );
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxBytes) {
        return null;
      }

      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    },
  };
}

export function confluenceWikiBaseUrl(config: Config): string {
  return wikiBaseUrl(config);
}
