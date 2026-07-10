import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubClient, isGitHubConfigured } from './index.js';
import type { Config } from '@tooned/core';

const baseConfig: Config = {
  ATLASSIAN_EMAIL: 'user@example.com',
  ATLASSIAN_TOKEN: 'token',
  ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
  ATLASSIAN_BOARD_ID: 1,
  BITBUCKET_USERNAME: undefined,
  BITBUCKET_TOKEN: undefined,
  BITBUCKET_WORKSPACE: undefined,
  GITHUB_TOKEN: 'gh-token',
  TOONED_SERVICE_PORT: 7420,
  TOONED_DATA_DIR: './data',
  TOONED_SYNC_INTERVAL_MS: 300_000,
  JIRA_PROJECT_KEY: 'CRM',
  JIRA_MAX_CONCURRENT: 5,
  TOONED_CONFIG_PATH: undefined,
  LLM_API_KEY: undefined,
  LLM_BASE_URL: undefined,
  LLM_MODEL: undefined,
  TOONED_ENRICH_ON_SYNC: false,
  fieldMap: {},
  dodTemplates: [],
  project: {
    jira: { projectKey: 'CRM', boardId: 1, storyIssueType: 'Story' },
    fields: {},
    dodTemplates: [],
    vcs: { urlDomains: { form: [], confluence: [] } },
    confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 524_288 },
    parsing: {},
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('github client', () => {
  it('returns null client when token is missing', () => {
    expect(
      isGitHubConfigured({
        ...baseConfig,
        GITHUB_TOKEN: undefined,
      }),
    ).toBe(false);
    expect(
      createGitHubClient({
        ...baseConfig,
        GITHUB_TOKEN: undefined,
      }),
    ).toBeNull();
  });

  it('fetches pull request and commit metadata', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number: 11,
            title: 'Sanitized PR',
            html_url: 'https://github.com/acme/tools/pull/11',
            head: { sha: 'ABCDEF123456' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sha: 'ABCDEF123456',
            html_url: 'https://github.com/acme/tools/commit/ABCDEF123456',
            commit: {
              message: 'Sanitized commit',
              author: { name: 'dev-user', date: '2026-01-01T00:00:00.000Z' },
            },
            author: { login: 'dev-user' },
            stats: { additions: 10, deletions: 3 },
            files: [{ filename: 'a.ts' }, { filename: 'b.ts' }],
          }),
          { status: 200 },
        ),
      );

    const client = createGitHubClient(baseConfig);
    expect(client).not.toBeNull();
    if (!client) {
      return;
    }

    const pullRequest = await client.getPullRequest({ repository: 'acme/tools', id: 11 });
    expect(pullRequest.headSha).toBe('abcdef123456');

    const commit = await client.getCommit({ repository: 'acme/tools', hash: 'ABCDEF123456' });
    expect(commit.hash).toBe('abcdef123456');
    expect(commit.diffstat).toEqual({
      filesChanged: 2,
      linesAdded: 10,
      linesRemoved: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
