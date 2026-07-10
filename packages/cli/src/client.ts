import type { Config, SyncMeta } from '@tooned/core';

export interface HealthResponse {
  ok: boolean;
  syncMeta: SyncMeta;
}

export interface SyncResponse {
  ok: boolean;
  syncMeta: SyncMeta;
  result: {
    mode: string;
    bootstrapJql: string;
    bootstrapProcessed: number;
    deltaProcessed: number;
    parentRefreshCount: number;
    linkedBugCount: number;
    lastSync: string;
  };
}

export interface StoryListResponse {
  syncMeta: SyncMeta;
  count: number;
  total: number;
  stories: Array<{
    key: string;
    summary: string | null;
    status: string | null;
    syncedAt: string | null;
    sourceUpdatedAt: string | null;
    doneAt: string | null;
    comments: number;
    subtasks: number;
    prs: number;
    payload: string | null;
  }>;
}

export interface StoryDetailResponse {
  syncMeta: SyncMeta;
  story: {
    key: string;
    summary: string | null;
    status: string | null;
    syncedAt: string | null;
    sourceUpdatedAt: string | null;
    doneAt: string | null;
    payload: Record<string, unknown> | null;
    subtasks: Array<{ key: string; summary: string | null; status: string | null; payload: Record<string, unknown> | null }>;
    bugs: Array<{ key: string; summary: string | null; status: string | null; payload: Record<string, unknown> | null }>;
    comments: Array<{ id: string; author: string | null; body: string | null; createdAt: string | null; updatedAt: string | null }>;
    refs: Array<{ id: string; url: string | null; domain: string | null }>;
  };
}

export interface StoryCommitsResponse {
  syncMeta: SyncMeta;
  key: string;
  commits: Array<{
    id: string;
    issueKey: string;
    provider: string | null;
    repository: string | null;
    hash: string | null;
    message: string | null;
    author: string | null;
    authoredAt: string | null;
    url: string | null;
    pullRequestUrl: string | null;
    filesChanged: number | null;
    linesAdded: number | null;
    linesRemoved: number | null;
  }>;
}

export interface StoryRefsResponse {
  syncMeta: SyncMeta;
  key: string;
  refs: Array<{ id: string; url: string | null; domain: string | null }>;
}

export interface StoryHistoryResponse {
  syncMeta: SyncMeta;
  key: string;
  count: number;
  history: Array<{
    id: string;
    field: string | null;
    fromValue: string | null;
    toValue: string | null;
    changedAt: string | null;
  }>;
}

export interface StorySizingResponse {
  syncMeta: SyncMeta;
  key: string;
  sizing: {
    points: number | null;
    openSubtasks: number;
    missingDoD: string[];
    openQuestions: number;
    risk: 'low' | 'medium' | 'high';
  };
}

export interface SprintCurrentResponse {
  syncMeta: SyncMeta;
  sprint: { id: number; name: string; state: string } | null;
  stories: Array<{
    key: string;
    summary: string;
    status: string;
    doneAt: string | null;
    storyPoints: number | null;
    subtaskCount: number;
    assignees: string[];
    timeSpentSeconds: number;
    sprintRefs: Array<{ id: number | null; name: string | null; state: string | null }>;
    isBacklog: boolean;
  }>;
  workload?: {
    storyCount: number;
    storyPoints: number;
    assigneeCount: number;
    subtaskCount: number;
    timeSpentSeconds: number;
    timeSpentHours: number;
  };
  emptyState?: string;
}

export interface SprintNextResponse {
  syncMeta: SyncMeta;
  sprint: { id: number; name: string; state: string } | null;
  stories: SprintCurrentResponse['stories'];
  backlogStories?: SprintCurrentResponse['stories'];
  reviewPack?: {
    generatedAt: string;
    storyCount: number;
    stories: Array<{
      key: string;
      summary: string;
      status: string;
      storyPoints: number | null;
      assignees: string[];
      subtaskCount: number;
      timeSpentHours: number;
      done: boolean;
      sme: string | null;
      descriptionExcerpt: string;
      acceptanceCriteria: string[];
      implementationHint?: string;
    }>;
  };
  emptyState: string | null;
}

export interface StorySummaryResponse {
  syncMeta: SyncMeta;
  key: string;
  force: boolean;
  since?: string;
  summary: Partial<Record<'brief' | 'implementationHint' | 'commentDigest' | 'changeDelta', string>>;
  generated: Array<'brief' | 'implementationHint' | 'commentDigest' | 'changeDelta'>;
  cached: Array<'brief' | 'implementationHint' | 'commentDigest' | 'changeDelta'>;
}

export interface SearchResponse {
  syncMeta: SyncMeta;
  pageCount?: number;
  confluenceBootstrapComplete?: boolean;
  confluenceLastSync?: string | null;
  query: string;
  scope: 'all' | 'stories' | 'docs' | 'code' | 'comments' | 'notes';
  count: number;
  results: Array<{
    source?: 'story' | 'doc' | 'code';
    key?: string;
    pageId?: string;
    title?: string;
    summary?: string | null;
    status?: string | null;
    spaceKey?: string | null;
    url?: string | null;
    sourceUpdatedAt?: string | null;
    repository?: string;
    path?: string;
    excerpt?: string | null;
    comments?: number;
    subtasks?: number;
    prs?: number;
  }>;
  codeSearchStatus?: 'not_configured' | 'empty';
  help?: string[];
}

export interface ReposListResponse {
  syncMeta: SyncMeta;
  codeFileCount?: number;
  codeBootstrapComplete?: boolean;
  codeLastSync?: string | null;
  count: number;
  repos: Array<{
    accountId: string;
    provider: string;
    repository: string;
    ref: string;
    fileCount: number;
  }>;
}

export interface CodeViewResponse {
  syncMeta: SyncMeta;
  file: {
    fileId: string;
    accountId: string;
    provider: string;
    repository: string;
    path: string;
    ref: string;
    language: string | null;
    sizeBytes: number | null;
    excerpt: string;
    content: string | null;
  };
}

export interface PagesListResponse {
  syncMeta: SyncMeta;
  pageCount: number;
  confluenceBootstrapComplete: boolean;
  confluenceLastSync: string | null;
  count: number;
  pages: Array<{
    pageId: string;
    title: string | null;
    spaceKey: string | null;
    url: string | null;
    sourceUpdatedAt: string | null;
  }>;
}

export interface PageDetailResponse {
  syncMeta: SyncMeta;
  pageCount: number;
  confluenceBootstrapComplete: boolean;
  confluenceLastSync: string | null;
  page: {
    pageId: string;
    title: string | null;
    spaceKey: string | null;
    url: string | null;
    labels: string[];
    ancestorTitles: string | null;
    version: number | null;
    sourceUpdatedAt: string | null;
    syncedAt: string | null;
    excerpt: string;
    bodyMd: string | null;
    bodySize: number;
    refs: Array<{ id: string; issueKey: string | null; url: string | null; domain: string | null }>;
  };
}

export interface RefSearchResponse {
  syncMeta: SyncMeta;
  query: string;
  refs: Array<{
    id: string;
    issueKey: string;
    url: string | null;
    domain: string | null;
  }>;
}

export type ServiceClientErrorCode = 'connection_refused' | 'timeout' | 'invalid_response';

export class ServiceClientError extends Error {
  constructor(
    message: string,
    readonly code: ServiceClientErrorCode,
  ) {
    super(message);
    this.name = 'ServiceClientError';
  }
}

function toBaseUrl(config: Config): string {
  return `http://127.0.0.1:${config.TOONED_SERVICE_PORT}`;
}

function withQuery(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function fetchJson<T>(config: Config, path: string, init?: RequestInit): Promise<T> {
  const url = `${toBaseUrl(config)}${path}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    if (message.includes('abort') || message.includes('timeout') || message.includes('UND_ERR_CONNECT_TIMEOUT')) {
      throw new ServiceClientError(
        `Service not responding at port ${config.TOONED_SERVICE_PORT}`,
        'timeout',
      );
    }
    if (message.includes('ECONNREFUSED') || message.toLowerCase().includes('fetch failed')) {
      throw new ServiceClientError(
        `Service not running at port ${config.TOONED_SERVICE_PORT}`,
        'connection_refused',
      );
    }
    throw new ServiceClientError(
      `Failed to reach service at port ${config.TOONED_SERVICE_PORT}`,
      'invalid_response',
    );
  }

  if (!response.ok) {
    let message = `Service returned HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // best effort
    }
    throw new ServiceClientError(
      message,
      'invalid_response',
    );
  }

  return (await response.json()) as T;
}

export async function fetchHealth(config: Config): Promise<HealthResponse> {
  return fetchJson<HealthResponse>(config, '/health', { signal: AbortSignal.timeout(3000) });
}

export async function triggerSync(config: Config, force: boolean): Promise<SyncResponse> {
  return fetchJson<SyncResponse>(config, '/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ force }),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function fetchStatus(config: Config): Promise<HealthResponse> {
  return fetchJson<HealthResponse>(config, '/sync/status', { signal: AbortSignal.timeout(3000) });
}

export async function fetchStories(
  config: Config,
  options: { status?: string; assignee?: string; sprint?: string; limit?: number },
): Promise<StoryListResponse> {
  return fetchJson<StoryListResponse>(
    config,
    withQuery('/stories', {
      status: options.status,
      assignee: options.assignee,
      sprint: options.sprint,
      limit: options.limit,
    }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchStory(config: Config, key: string): Promise<StoryDetailResponse> {
  return fetchJson<StoryDetailResponse>(config, `/stories/${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchStoryCommits(config: Config, key: string): Promise<StoryCommitsResponse> {
  return fetchJson<StoryCommitsResponse>(config, `/stories/${encodeURIComponent(key)}/commits`, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchStoryRefs(config: Config, key: string): Promise<StoryRefsResponse> {
  return fetchJson<StoryRefsResponse>(config, `/stories/${encodeURIComponent(key)}/refs`, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchStoryHistory(
  config: Config,
  key: string,
  since?: string,
): Promise<StoryHistoryResponse> {
  return fetchJson<StoryHistoryResponse>(
    config,
    withQuery(`/stories/${encodeURIComponent(key)}/history`, { since }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchStorySizing(config: Config, key: string): Promise<StorySizingResponse> {
  return fetchJson<StorySizingResponse>(config, `/stories/${encodeURIComponent(key)}/sizing`, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchSprintCurrent(config: Config, workload: boolean): Promise<SprintCurrentResponse> {
  return fetchJson<SprintCurrentResponse>(
    config,
    withQuery('/sprints/current', { workload }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchSprintNext(
  config: Config,
  options: { reviewPack?: boolean; includeBacklog?: boolean; enriched?: boolean },
): Promise<SprintNextResponse> {
  return fetchJson<SprintNextResponse>(
    config,
    withQuery('/sprints/next', {
      reviewPack: options.reviewPack ?? false,
      includeBacklog: options.includeBacklog ?? false,
      enriched: options.enriched ?? false,
    }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchStorySummary(
  config: Config,
  key: string,
  options: { force?: boolean; comments?: boolean; since?: string } = {},
): Promise<StorySummaryResponse> {
  return fetchJson<StorySummaryResponse>(
    config,
    withQuery(`/stories/${encodeURIComponent(key)}/summary`, {
      force: options.force ?? false,
      comments: options.comments ?? false,
      since: options.since,
    }),
    { signal: AbortSignal.timeout(20_000) },
  );
}

export async function fetchSearch(
  config: Config,
  options: {
    query: string;
    inScope?: 'all' | 'stories' | 'docs' | 'code' | 'comments' | 'notes';
    sprint?: string;
    status?: string;
    since?: string;
    limit?: number;
  },
): Promise<SearchResponse> {
  return fetchJson<SearchResponse>(
    config,
    withQuery('/search', {
      q: options.query,
      in: options.inScope ?? 'all',
      sprint: options.sprint,
      status: options.status,
      since: options.since,
      limit: options.limit,
    }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchPages(
  config: Config,
  options: { space?: string; limit?: number },
): Promise<PagesListResponse> {
  return fetchJson<PagesListResponse>(
    config,
    withQuery('/pages', {
      space: options.space,
      limit: options.limit,
    }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchPage(config: Config, pageId: string): Promise<PageDetailResponse> {
  return fetchJson<PageDetailResponse>(config, `/pages/${encodeURIComponent(pageId)}`, {
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchRepos(config: Config): Promise<ReposListResponse> {
  return fetchJson<ReposListResponse>(config, '/repos', {
    signal: AbortSignal.timeout(5000),
  });
}

export async function fetchCodeFile(
  config: Config,
  options: { fileId?: string; accountId?: string; repository?: string; path?: string },
): Promise<CodeViewResponse> {
  return fetchJson<CodeViewResponse>(
    config,
    withQuery('/code', {
      fileId: options.fileId,
      accountId: options.accountId,
      repository: options.repository,
      path: options.path,
    }),
    { signal: AbortSignal.timeout(5000) },
  );
}

export async function fetchRefsSearch(config: Config, query: string): Promise<RefSearchResponse> {
  return fetchJson<RefSearchResponse>(
    config,
    withQuery('/refs/search', {
      q: query,
    }),
    { signal: AbortSignal.timeout(5000) },
  );
}
