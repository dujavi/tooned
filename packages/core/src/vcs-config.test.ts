import { describe, expect, it } from 'vitest';
import {
  VcsConfigSchema,
  resolveVcsAccounts,
  synthesizeLegacyVcsAccounts,
  summarizeVcsRepoTargets,
} from './vcs-config.js';

describe('vcs config', () => {
  it('validates repo account references', () => {
    const result = VcsConfigSchema.safeParse({
      urlDomains: { form: [], confluence: [] },
      accounts: [{ id: 'bb', provider: 'bitbucket', workspace: 'acme', tokenEnv: 'BB_TOKEN' }],
      repos: [{ account: 'missing', slug: 'tools' }],
    });
    expect(result.success).toBe(false);
  });

  it('synthesizes legacy bitbucket and github accounts', () => {
    const accounts = synthesizeLegacyVcsAccounts({
      accounts: [],
      bitbucketWorkspace: 'acme',
      env: {
        BITBUCKET_USERNAME: 'user',
        BITBUCKET_TOKEN: 'token',
        GITHUB_TOKEN: 'gh',
      },
    });
    expect(accounts).toEqual([
      {
        id: 'default',
        provider: 'bitbucket',
        workspace: 'acme',
        usernameEnv: 'BITBUCKET_USERNAME',
        tokenEnv: 'BITBUCKET_TOKEN',
      },
      {
        id: 'default-github',
        provider: 'github',
        tokenEnv: 'GITHUB_TOKEN',
      },
    ]);
  });

  it('resolves credentials from env refs without leaking values', () => {
    const resolved = resolveVcsAccounts({
      accounts: [
        {
          id: 'bb',
          provider: 'bitbucket',
          workspace: 'acme',
          usernameEnv: 'BB_USER',
          tokenEnv: 'BB_TOKEN',
        },
      ],
      env: { BB_USER: 'alice', BB_TOKEN: 'secret' },
    });
    expect(resolved[0]?.configured).toBe(true);
    expect(resolved[0]?.username).toBe('alice');
    expect(resolved[0]?.token).toBe('secret');
  });

  it('falls back to ATLASSIAN_EMAIL for bitbucket username', () => {
    const resolved = resolveVcsAccounts({
      accounts: [
        {
          id: 'bb',
          provider: 'bitbucket',
          workspace: 'acme',
          tokenEnv: 'BB_TOKEN',
        },
      ],
      env: { ATLASSIAN_EMAIL: 'user@example.com', BB_TOKEN: 'secret' },
    });
    expect(resolved[0]?.username).toBe('user@example.com');
    expect(resolved[0]?.configured).toBe(true);
  });

  it('summarizes repo crawl targets', () => {
    expect(summarizeVcsRepoTargets([])).toBe('no repo crawl targets configured');
    expect(
      summarizeVcsRepoTargets([
        { account: 'bb', slug: 'tools' },
        { account: 'gh', scope: 'org' },
      ]),
    ).toBe('bb:tools, gh:org');
  });
});
