import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@tooned/core';
import { createBitbucketClient, isBitbucketConfigured } from './index.js';

const baseConfig: Config = {
  ATLASSIAN_EMAIL: 'user@example.com',
  ATLASSIAN_TOKEN: 'token',
  ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
  ATLASSIAN_BOARD_ID: 1,
  BITBUCKET_USERNAME: 'bb-user',
  BITBUCKET_TOKEN: 'bb-token',
  BITBUCKET_WORKSPACE: 'workspace',
  GITHUB_TOKEN: undefined,
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
    vcs: {
      bitbucket: { workspace: 'workspace' },
      urlDomains: { form: [], confluence: [] },
      accounts: [],
      repos: [],
    },
    confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 524_288 },
    parsing: {},
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bitbucket client', () => {
  it('returns null client when credentials are missing', () => {
    expect(
      isBitbucketConfigured({
        ...baseConfig,
        BITBUCKET_TOKEN: undefined,
      }),
    ).toBe(false);
    expect(
      createBitbucketClient({
        ...baseConfig,
        BITBUCKET_TOKEN: undefined,
      }),
    ).toBeNull();
  });

  it('fetches pull request and commit metadata', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 7,
            title: 'Sanitized PR',
            source: { commit: { hash: 'ABCDEF123456' } },
            links: { html: { href: 'https://bitbucket.org/acme/tools/pull-requests/7' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hash: 'ABCDEF123456',
            message: 'Sanitized commit',
            date: '2026-01-01T00:00:00.000Z',
            author: { raw: 'Dev User <dev@example.com>' },
            links: { html: { href: 'https://bitbucket.org/acme/tools/commits/ABCDEF123456' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            values: [{ lines_added: 4, lines_removed: 2 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const client = createBitbucketClient(baseConfig);
    expect(client).not.toBeNull();
    if (!client) {
      return;
    }

    const pullRequest = await client.getPullRequest({ repository: 'acme/tools', id: 7 });
    expect(pullRequest.headSha).toBe('abcdef123456');

    const commit = await client.getCommit({ repository: 'acme/tools', hash: 'ABCDEF123456' });
    expect(commit.hash).toBe('abcdef123456');
    expect(commit.diffstat).toEqual({
      filesChanged: 1,
      linesAdded: 4,
      linesRemoved: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lists repositories and source files', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            values: [
              {
                slug: 'tools',
                full_name: 'acme/tools',
                name: 'tools',
                mainbranch: { name: 'main' },
              },
            ],
            next: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            values: [
              { path: 'src', type: 'commit_directory' },
              { path: 'README.md', type: 'commit_file' },
            ],
            next: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            values: [{ path: 'index.ts', type: 'commit_file' }],
            next: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response('export const ok = true;\n', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      );

    const client = createBitbucketClient(baseConfig);
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
    expect(paths).toEqual(
      expect.arrayContaining([
        { path: 'src', type: 'directory' },
        { path: 'README.md', type: 'file' },
        { path: 'index.ts', type: 'file' },
      ]),
    );

    const content = await client.getSourceFile({
      repository: 'acme/tools',
      path: 'src/index.ts',
      ref: 'main',
    });
    expect(content).toBe('export const ok = true;\n');
  });
});
