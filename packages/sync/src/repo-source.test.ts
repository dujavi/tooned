import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@tooned/core';
import { resolveRepoContentHandle } from './repo-source.js';

vi.mock('./repo-git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repo-git.js')>();
  return {
    ...actual,
    ensureGitCache: vi.fn(async () => undefined),
    resolveGitRef: vi.fn(async () => 'master'),
    listGitTrackedFiles: vi.fn(async () => ['README.md']),
  };
});

function makeConfig(dataDir: string, localPath: string): Config {
  return {
    ATLASSIAN_EMAIL: 'agent@example.com',
    ATLASSIAN_TOKEN: 'token',
    ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
    ATLASSIAN_BOARD_ID: 7,
    BITBUCKET_WORKSPACE: 'acme',
    TOONED_DATA_DIR: dataDir,
    TOONED_SERVICE_PORT: 7420,
    TOONED_SYNC_INTERVAL_MS: 300_000,
    JIRA_PROJECT_KEY: 'CRM',
    JIRA_MAX_CONCURRENT: 4,
    project: {
      jira: { projectKey: 'CRM', boardId: 7, storyIssueType: 'Story' },
      fields: {},
      dodTemplates: [],
      vcs: {
        urlDomains: { form: [], confluence: [] },
        accounts: [{ id: 'bb', provider: 'bitbucket', workspace: 'acme', tokenEnv: 'BB_TOKEN' }],
        repos: [{ account: 'bb', slug: 'tools', localPath, source: 'auto' }],
        maxFileBytes: 262_144,
      },
      confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 1024 },
      parsing: {},
    },
    fieldMap: {},
    dodTemplates: [],
  } as Config;
}

describe('resolveRepoContentHandle', () => {
  let dataDir = '';
  let localPath = '';

  afterEach(() => {
    if (localPath) {
      rmSync(localPath, { recursive: true, force: true });
      localPath = '';
    }
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
    vi.clearAllMocks();
  });

  it('prefers localPath over API when source is auto', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-source-'));
    localPath = mkdtempSync(join(tmpdir(), 'tooned-repo-'));
    writeFileSync(join(localPath, 'README.md'), '# Tools\n', 'utf8');

    const config = makeConfig(dataDir, localPath);
    const handle = await resolveRepoContentHandle({
      config,
      target: {
        accountId: 'bb',
        provider: 'bitbucket',
        repository: 'acme/tools',
        slug: 'tools',
        defaultBranch: 'master',
        localPath,
        source: 'auto',
      },
      account: {
        id: 'bb',
        provider: 'bitbucket',
        workspace: 'acme',
        token: 'secret',
        username: 'user@example.com',
        configured: true,
      },
      client: null,
    });

    expect(handle?.kind).toBe('local');
    expect(handle?.rootPath).toBe(localPath);
  });
});
