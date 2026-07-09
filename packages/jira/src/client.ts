import type { Config } from '@tooned/core';
import { getFieldId } from '@tooned/core';

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

export interface JiraMyself {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface BoardConfiguration {
  filter?: {
    id?: string | number;
    query?: string;
    self?: string;
  };
}

export interface JiraFilter {
  id: string;
  jql?: string;
  name?: string;
}

export interface JiraSearchResult {
  count: number;
}

export interface JiraSearchPage {
  issues: JiraIssue[];
  nextPageToken: string | null;
}

export type JiraSprintState = 'active' | 'future' | 'closed';

export interface JiraSprint {
  id: number;
  self?: string;
  state?: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  completeDate?: string | null;
  originBoardId?: number;
  goal?: string | null;
}

export interface JiraBacklogIssue {
  id: string;
  key: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown>;
}

export interface JiraChangelogItem {
  id: string;
  field: string;
  fieldId?: string;
  fromString?: string | null;
  toString?: string | null;
}

export interface JiraChangelogHistory {
  id: string;
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraClient {
  getMyself(): Promise<JiraMyself>;
  getBoardConfiguration(boardId: number): Promise<BoardConfiguration>;
  getSprints(boardId: number, state: JiraSprintState): Promise<JiraSprint[]>;
  getBacklogIssues(boardId: number): Promise<JiraBacklogIssue[]>;
  getFilter(filterId: string | number): Promise<JiraFilter>;
  countIssues(jql: string): Promise<number>;
  searchIssues(input: {
    jql: string;
    fields: string[];
    nextPageToken?: string;
    maxResults?: number;
  }): Promise<JiraSearchPage>;
  getIssue(key: string, fields: string[], expand?: string[]): Promise<JiraIssue>;
  getChangelog(issueId: string): Promise<JiraChangelogHistory[]>;
  getDevStatus(issueId: string, applicationType: string, dataType: string): Promise<unknown>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
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

async function jiraFetch<T>(config: Config, path: string, init?: RequestInit): Promise<T> {
  const url = `${normalizeBaseUrl(config.ATLASSIAN_BASE_URL)}${path}`;
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
      throw new JiraError(`Could not reach Jira: ${message}`);
    }

    if (response.status === 429 || response.status === 503) {
      if (attempt < maxAttempts - 1) {
        const retryAfterMillis = parseRetryAfterMillis(response) ?? 500 * Math.pow(2, attempt);
        await sleep(retryAfterMillis);
        continue;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new JiraError('Jira authentication failed — check ATLASSIAN_EMAIL and ATLASSIAN_TOKEN', response.status);
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { errorMessages?: string[]; message?: string };
        detail = body.errorMessages?.join('; ') ?? body.message ?? detail;
      } catch {
        // ignore parse errors
      }
      throw new JiraError(`Jira request failed (${response.status}): ${detail}`, response.status);
    }

    return (await response.json()) as T;
  }

  const message = lastNetworkError instanceof Error ? lastNetworkError.message : 'Request failed';
  throw new JiraError(`Could not reach Jira: ${message}`);
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

function buildStoryFields(config: Config): string[] {
  const standardFields = [
    'summary',
    'description',
    'status',
    'issuetype',
    'parent',
    'updated',
    'created',
    'priority',
    'labels',
    'comment',
    'attachment',
    'issuelinks',
    'subtasks',
    'assignee',
    'timespent',
    'timeoriginalestimate',
    'aggregatetimespent',
    'aggregatetimeoriginalestimate',
    'fixVersions',
  ];
  const mappedCustomFields = Object.keys(config.fieldMap)
    .map((name) => getFieldId(config.fieldMap, name))
    .filter((value): value is string => Boolean(value));

  return [...new Set([...standardFields, ...mappedCustomFields])];
}

interface JiraSearchJqlResponse {
  issues?: JiraIssue[];
  nextPageToken?: string;
}

interface JiraSprintPageResponse {
  values?: JiraSprint[];
  maxResults?: number;
  startAt?: number;
  total?: number;
  isLast?: boolean;
}

interface JiraBacklogPageResponse {
  issues?: JiraBacklogIssue[];
  maxResults?: number;
  startAt?: number;
  total?: number;
  isLast?: boolean;
}

interface JiraChangelogResponse {
  values: JiraChangelogHistory[];
  startAt: number;
  maxResults: number;
  total: number;
  isLast?: boolean;
}

export function createJiraClient(config: Config): JiraClient {
  const limiter = new ConcurrencyLimiter(Math.max(config.JIRA_MAX_CONCURRENT, 1));
  const runLimited = <T>(task: () => Promise<T>): Promise<T> => limiter.run(task);
  const storyFields = buildStoryFields(config);

  return {
    async getMyself() {
      return runLimited(() => jiraFetch<JiraMyself>(config, '/rest/api/3/myself'));
    },

    async getBoardConfiguration(boardId) {
      return runLimited(() =>
        jiraFetch<BoardConfiguration>(
          config,
          `/rest/agile/1.0/board/${boardId}/configuration`,
        ),
      );
    },

    async getSprints(boardId, state) {
      const sprints: JiraSprint[] = [];
      let startAt = 0;
      const maxResults = 50;

      for (;;) {
        const query = new URLSearchParams({
          state,
          startAt: String(startAt),
          maxResults: String(maxResults),
        });
        const page = await runLimited(() =>
          jiraFetch<JiraSprintPageResponse>(
            config,
            `/rest/agile/1.0/board/${boardId}/sprint?${query.toString()}`,
          ),
        );
        const values = page.values ?? [];
        sprints.push(...values);

        const nextStartAt = startAt + values.length;
        const reachedTotal = page.total !== undefined ? nextStartAt >= page.total : values.length === 0;
        if (page.isLast === true || reachedTotal) {
          break;
        }
        startAt = nextStartAt;
      }

      return sprints;
    },

    async getBacklogIssues(boardId) {
      const issues: JiraBacklogIssue[] = [];
      let startAt = 0;
      const maxResults = 50;

      for (;;) {
        const query = new URLSearchParams({
          startAt: String(startAt),
          maxResults: String(maxResults),
          fields: 'key',
        });
        const page = await runLimited(() =>
          jiraFetch<JiraBacklogPageResponse>(
            config,
            `/rest/agile/1.0/board/${boardId}/backlog?${query.toString()}`,
          ),
        );
        const values = page.issues ?? [];
        issues.push(...values);

        const nextStartAt = startAt + values.length;
        const reachedTotal = page.total !== undefined ? nextStartAt >= page.total : values.length === 0;
        if (page.isLast === true || reachedTotal) {
          break;
        }
        startAt = nextStartAt;
      }

      return issues;
    },

    async getFilter(filterId) {
      return runLimited(() => jiraFetch<JiraFilter>(config, `/rest/api/3/filter/${filterId}`));
    },

    async countIssues(jql) {
      const result = await runLimited(() =>
        jiraFetch<JiraSearchResult>(config, '/rest/api/3/search/approximate-count', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jql }),
        }),
      );
      return result.count;
    },

    async searchIssues(input) {
      const maxResults = input.maxResults ?? 50;
      const fields = input.fields.length > 0 ? input.fields : storyFields;
      const payload = {
        jql: input.jql,
        fields,
        maxResults,
        nextPageToken: input.nextPageToken,
      };

      const result = await runLimited(() =>
        jiraFetch<JiraSearchJqlResponse>(config, '/rest/api/3/search/jql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
      );

      return {
        issues: result.issues ?? [],
        nextPageToken: result.nextPageToken ?? null,
      };
    },

    async getIssue(key, fields, expand) {
      const query = new URLSearchParams();
      const resolvedFields = fields.length > 0 ? fields : storyFields;
      query.set('fields', resolvedFields.join(','));
      if (expand && expand.length > 0) {
        query.set('expand', expand.join(','));
      }
      return runLimited(() =>
        jiraFetch<JiraIssue>(config, `/rest/api/3/issue/${encodeURIComponent(key)}?${query.toString()}`),
      );
    },

    async getChangelog(issueId) {
      const all: JiraChangelogHistory[] = [];
      let startAt = 0;
      const maxResults = 100;

      for (;;) {
        const response = await runLimited(() =>
          jiraFetch<JiraChangelogResponse>(
            config,
            `/rest/api/3/issue/${encodeURIComponent(issueId)}/changelog?startAt=${startAt}&maxResults=${maxResults}`,
          ),
        );
        all.push(...response.values);
        startAt += response.values.length;
        if (response.isLast === true || startAt >= response.total || response.values.length === 0) {
          break;
        }
      }

      return all;
    },

    async getDevStatus(issueId, applicationType, dataType) {
      const path = `/rest/dev-status/latest/issue/detail?issueId=${encodeURIComponent(issueId)}&applicationType=${encodeURIComponent(applicationType)}&dataType=${encodeURIComponent(dataType)}`;
      return runLimited(() => jiraFetch<unknown>(config, path));
    },
  };
}

export const STORY_FIELDS = buildStoryFields;
