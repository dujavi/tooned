import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@tooned/core';
import { closeDb, getDb, getStoryByKey } from './db.js';
import type { JiraClient, JiraIssue } from '@tooned/jira';

const mockCreateJiraClient = vi.fn<() => JiraClient>();
const mockStoryFields = vi.fn(() => ['summary', 'status', 'issuetype', 'parent', 'updated']);
const mockEnrichStoryCommits = vi.fn(async () => undefined);
const mockQueueStoryEnrichmentOnSync = vi.fn(() => undefined);
const mockRunConfluenceSync = vi.fn(async () => ({
  pagesProcessed: 0,
  pagesFailed: 0,
  retaggedRefs: 0,
  bootstrapComplete: true,
}));

vi.mock('@tooned/jira', async () => {
  const actual = await vi.importActual<typeof import('@tooned/jira')>('@tooned/jira');
  return {
    ...actual,
    createJiraClient: mockCreateJiraClient,
    STORY_FIELDS: mockStoryFields,
  };
});

vi.mock('./vcs-enrich.js', () => ({
  enrichStoryCommits: mockEnrichStoryCommits,
}));

vi.mock('./enrichment.js', () => ({
  queueStoryEnrichmentOnSync: mockQueueStoryEnrichmentOnSync,
}));

vi.mock('./confluence-sync.js', () => ({
  runConfluenceSync: mockRunConfluenceSync,
  CONFLUENCE_BOOTSTRAP_COMPLETE_KEY: 'confluenceBootstrapComplete',
}));

const { runSync } = await import('./pipeline.js');

function makeConfig(dataDir: string): Config {
  return {
    ATLASSIAN_EMAIL: 'agent@example.com',
    ATLASSIAN_TOKEN: 'token',
    ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
    ATLASSIAN_BOARD_ID: 7,
    BITBUCKET_USERNAME: undefined,
    BITBUCKET_TOKEN: undefined,
    BITBUCKET_WORKSPACE: undefined,
    GITHUB_TOKEN: undefined,
    TOONED_SERVICE_PORT: 7420,
    TOONED_DATA_DIR: dataDir,
    TOONED_SYNC_INTERVAL_MS: 300_000,
    JIRA_PROJECT_KEY: 'CRM',
    JIRA_MAX_CONCURRENT: 4,
    TOONED_CONFIG_PATH: undefined,
    LLM_API_KEY: undefined,
    LLM_BASE_URL: undefined,
    LLM_MODEL: undefined,
    TOONED_ENRICH_ON_SYNC: undefined,
    project: {
      jira: {
        projectKey: 'CRM',
        boardId: 7,
        storyIssueType: 'Story',
        bootstrapJql: 'project = CRM AND issuetype = Story',
      },
      fields: {
        sprint: '10020',
        storyPoints: '10016',
      },
      dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
      vcs: { urlDomains: { form: [], confluence: [] }, accounts: [], repos: [], maxFileBytes: 262_144 },
      confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 524_288 },
      parsing: {},
    },
    fieldMap: {
      sprint: '10020',
      storyPoints: '10016',
    },
    dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
  };
}

function makeSubtaskIssue(): JiraIssue {
  return {
    id: '2001',
    key: 'CRM-700-sub-1',
    fields: {
      summary: 'Subtask updated',
      status: { name: 'In Progress' },
      issuetype: { name: 'Sub-task' },
      parent: { key: 'CRM-700' },
      updated: '2026-07-09T19:00:00.000Z',
      description: null,
      comment: { comments: [] },
      attachment: [],
      issuelinks: [],
    },
  };
}

function makeParentStory(): JiraIssue {
  return {
    id: '1700',
    key: 'CRM-700',
    fields: {
      summary: 'Parent story refreshed',
      status: { name: 'In Progress' },
      issuetype: { name: 'Story' },
      updated: '2026-07-09T19:01:00.000Z',
      description: 'Story body',
      comment: { comments: [] },
      attachment: [],
      issuelinks: [],
      assignee: { displayName: 'Agent Demo' },
      timespent: 0,
    },
  };
}

describe('runSync parent refresh', () => {
  let dataDir = '';

  afterEach(() => {
    vi.clearAllMocks();
    closeDb();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  it('refreshes parent stories when subtasks update in delta sync', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-sync-parent-refresh-'));
    getDb(dataDir);

    const subtaskIssue = makeSubtaskIssue();
    const parentIssue = makeParentStory();

    const mockClient: JiraClient = {
      getMyself: vi.fn(async () => ({ accountId: 'acct', displayName: 'Agent' })),
      getBoardConfiguration: vi.fn(async () => ({})),
      getSprints: vi.fn(async () => []),
      getBacklogIssues: vi.fn(async () => []),
      getFilter: vi.fn(async () => ({ id: '1' })),
      countIssues: vi.fn(async () => 0),
      searchIssues: vi
        .fn()
        .mockResolvedValueOnce({ issues: [], nextPageToken: null })
        .mockResolvedValueOnce({ issues: [subtaskIssue], nextPageToken: null }),
      getIssue: vi.fn(async () => parentIssue),
      getChangelog: vi.fn(async () => []),
      getDevStatus: vi.fn(async () => ({})),
    };
    mockCreateJiraClient.mockReturnValue(mockClient);

    const result = await runSync(makeConfig(dataDir), { force: true });

    expect(result.parentRefreshCount).toBe(1);
    expect(mockClient.getIssue).toHaveBeenCalledWith('CRM-700', expect.any(Array));
    expect(getStoryByKey(getDb(dataDir), 'CRM-700')).not.toBeNull();
  });

  it('queues enrichment on delta sync without blocking completion', async () => {
    vi.useFakeTimers();
    try {
      dataDir = mkdtempSync(join(tmpdir(), 'tooned-sync-enrich-'));
      getDb(dataDir);

      const storyIssue = makeParentStory();
      const mockClient: JiraClient = {
        getMyself: vi.fn(async () => ({ accountId: 'acct', displayName: 'Agent' })),
        getBoardConfiguration: vi.fn(async () => ({})),
        getSprints: vi.fn(async () => []),
        getBacklogIssues: vi.fn(async () => []),
        getFilter: vi.fn(async () => ({ id: '1' })),
        countIssues: vi.fn(async () => 0),
        searchIssues: vi
          .fn()
          .mockResolvedValueOnce({ issues: [], nextPageToken: null })
          .mockResolvedValueOnce({ issues: [storyIssue], nextPageToken: null }),
        getIssue: vi.fn(async () => storyIssue),
        getChangelog: vi.fn(async () => []),
        getDevStatus: vi.fn(async () => ({})),
      };
      mockCreateJiraClient.mockReturnValue(mockClient);

      let enrichmentFinished = false;
      mockQueueStoryEnrichmentOnSync.mockImplementation(() => {
        void new Promise<void>((resolve) =>
          setTimeout(() => {
            enrichmentFinished = true;
            resolve();
          }, 40),
        );
      });

      const result = await runSync({
        ...makeConfig(dataDir),
        TOONED_ENRICH_ON_SYNC: true,
      }, { force: true });

      expect(result.deltaProcessed).toBe(1);
      expect(mockQueueStoryEnrichmentOnSync).toHaveBeenCalledTimes(1);
      expect(enrichmentFinished).toBe(false);
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }
  });
});
