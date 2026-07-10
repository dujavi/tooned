import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config, VcsClient } from '@tooned/core';
import {
  closeDb,
  getCodeFileCount,
  getDb,
  getSyncStateValue,
  searchCode,
} from './db.js';
import {
  CODE_BOOTSTRAP_CHECKPOINT_KEY,
  CODE_BOOTSTRAP_COMPLETE_KEY,
  runRepoSync,
} from './repo-sync.js';

const mockClient: VcsClient = {
  provider: 'github',
  accountId: 'gh',
  listRepositories: vi.fn(async () => [
    {
      slug: 'tools',
      fullName: 'acme/tools',
      name: 'tools',
      defaultBranch: 'main',
    },
  ]),
  listSourcePaths: vi.fn(async () => [
    { path: 'src/index.ts', type: 'file' as const },
    { path: 'assets/logo.png', type: 'file' as const },
    { path: 'README.md', type: 'file' as const },
  ]),
  getSourceFile: vi.fn(async ({ path }) => {
    if (path === 'src/index.ts') {
      return 'export const ok = true;\n';
    }
    if (path === 'README.md') {
      return '# Tools\n';
    }
    return '\u0000binary';
  }),
  getPullRequest: vi.fn(),
  getCommit: vi.fn(),
  resolveShortSha: vi.fn(),
  getDiffstat: vi.fn(),
};

vi.mock('@tooned/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tooned/core')>();
  return {
    ...actual,
    getVcsClient: vi.fn(() => mockClient),
    getResolvedVcsAccounts: vi.fn(() => [
      {
        id: 'gh',
        provider: 'github' as const,
        org: 'acme',
        token: 'token',
        configured: true,
      },
    ]),
  };
});

function makeConfig(dataDir: string): Config {
  return {
    ATLASSIAN_EMAIL: 'agent@example.com',
    ATLASSIAN_TOKEN: 'token',
    ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
    ATLASSIAN_BOARD_ID: 7,
    BITBUCKET_USERNAME: undefined,
    BITBUCKET_TOKEN: undefined,
    BITBUCKET_WORKSPACE: undefined,
    GITHUB_TOKEN: 'gh-token',
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
      },
      fields: {},
      dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
      vcs: {
        urlDomains: { form: [], confluence: [] },
        accounts: [
          {
            id: 'gh',
            provider: 'github',
            org: 'acme',
            tokenEnv: 'GITHUB_TOKEN',
          },
        ],
        repos: [{ account: 'gh', slug: 'tools' }],
        maxFileBytes: 262_144,
      },
      confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 1024 },
      parsing: {},
    },
    fieldMap: {},
    dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
  };
}

describe('runRepoSync', () => {
  let dataDir = '';

  afterEach(() => {
    closeDb();
    vi.clearAllMocks();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  it('indexes crawlable files and writes manifest', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-repo-sync-'));
    const db = getDb(dataDir);
    const config = makeConfig(dataDir);

    const result = await runRepoSync(db, config);

    expect(result.bootstrapComplete).toBe(true);
    expect(result.filesIndexed).toBe(2);
    expect(getCodeFileCount(db)).toBe(2);
    expect(getSyncStateValue<boolean>(db, CODE_BOOTSTRAP_COMPLETE_KEY)).toBe(true);
    expect(searchCode(db, 'export', 5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: 'acme/tools',
          path: 'src/index.ts',
        }),
      ]),
    );
    expect(existsSync(join(dataDir, 'repos', 'gh', 'tools', 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(dataDir, 'repos', 'gh', 'tools', 'manifest.json'), 'utf8'),
    ) as { files: Array<{ path: string }> };
    expect(manifest.files).toHaveLength(2);
  });

  it('resumes bootstrap from checkpoint', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-repo-sync-checkpoint-'));
    const db = getDb(dataDir);
    const config = makeConfig(dataDir);

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      CODE_BOOTSTRAP_CHECKPOINT_KEY,
      JSON.stringify({
        repos: {
          'gh:acme/tools': {
            ref: 'main',
            paths: ['src/index.ts', 'README.md'],
            nextIndex: 1,
            sourceKind: 'api',
          },
        },
      }),
    );

    const result = await runRepoSync(db, config);

    expect(result.filesIndexed).toBe(1);
    expect(getCodeFileCount(db)).toBe(1);
    expect(mockClient.getSourceFile).toHaveBeenCalledTimes(1);
    expect(mockClient.listSourcePaths).not.toHaveBeenCalled();
  });
});
