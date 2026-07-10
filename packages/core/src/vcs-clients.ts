import type { Config } from './config.js';
import type { VcsClient, VcsProvider } from './types.js';
import { resolveVcsAccounts, type ResolvedVcsAccount } from './vcs-config.js';

export type VcsClientFactory = (account: ResolvedVcsAccount) => VcsClient | null;

let bitbucketFactory: VcsClientFactory | null = null;
let githubFactory: VcsClientFactory | null = null;

export function registerVcsClientFactories(input: {
  bitbucket?: VcsClientFactory;
  github?: VcsClientFactory;
}): void {
  if (input.bitbucket) {
    bitbucketFactory = input.bitbucket;
  }
  if (input.github) {
    githubFactory = input.github;
  }
}

export function getResolvedVcsAccounts(config: Config): ResolvedVcsAccount[] {
  return resolveVcsAccounts({
    accounts: config.project.vcs.accounts,
    bitbucketWorkspace: config.BITBUCKET_WORKSPACE ?? config.project.vcs.bitbucket?.workspace,
    env: process.env,
  });
}

export function getVcsClient(config: Config, accountId: string): VcsClient | null {
  const account = getResolvedVcsAccounts(config).find((entry) => entry.id === accountId);
  if (!account || !account.configured) {
    return null;
  }
  const factory = account.provider === 'bitbucket' ? bitbucketFactory : githubFactory;
  if (!factory) {
    return null;
  }
  return factory(account);
}

export function getDefaultVcsClient(config: Config, provider: VcsProvider): VcsClient | null {
  const account = getResolvedVcsAccounts(config).find(
    (entry) => entry.provider === provider && entry.configured,
  );
  if (!account) {
    return null;
  }
  return getVcsClient(config, account.id);
}
