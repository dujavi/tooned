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
    vcs: { urlDomains: { form: [], confluence: [] }, accounts: [], repos: [] },
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

  it('lists repositories and source files', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: 'tools',
              full_name: 'acme/tools',
              default_branch: 'main',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: { sha: 'tree-sha' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tree: [
              { path: 'src', type: 'tree' },
              { path: 'src/index.ts', type: 'blob' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: Buffer.from('export const ok = true;\n', 'utf8').toString('base64'),
            encoding: 'base64',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const client = createGitHubClient(baseConfig);
    expect(client).not.toBeNull();
    if (!client) {
      return;
    }

    const repositories = await client.listRepositories('acme');
    expect(repositories).toEqual([
      {
        slug: 'tools',
        fullName: 'acme/tools',
        name: 'tools',
        defaultBranch: 'main',
      },
    ]);

    const paths = await client.listSourcePaths({ repository: 'acme/tools', ref: 'main' });
    expect(paths).toEqual([
      { path: 'src', type: 'directory' },
      { path: 'src/index.ts', type: 'file' },
    ]);

    const content = await client.getSourceFile({
      repository: 'acme/tools',
      path: 'src/index.ts',
      ref: 'main',
    });
    expect(content).toBe('export const ok = true;\n');
  });
});
