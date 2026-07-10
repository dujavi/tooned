import { join } from 'node:path';
import { statSync } from 'node:fs';
import type { Config, RepoSourceMode, ResolvedVcsAccount, VcsClient, VcsProvider } from '@tooned/core';
import {
  buildGitCloneUrl,
  ensureGitCache,
  isGitRepo,
  resolveGitRef,
} from './repo-git.js';
import { listLocalCrawlablePaths, readLocalSourceFile, resolveLocalPath, warnLocalPathIndexingSafety } from './repo-local.js';

export type RepoContentKind = 'api' | 'local' | 'cache';

export interface RepoSlugTargetConfig {
  accountId: string;
  slug: string;
  localPath?: string;
  source: RepoSourceMode;
}

export interface RepoContentTarget {
  accountId: string;
  provider: VcsProvider;
  repository: string;
  slug: string;
  defaultBranch: string | null;
  localPath?: string;
  source: RepoSourceMode;
}

export interface RepoContentHandle {
  kind: RepoContentKind;
  repository: string;
  ref: string;
  client?: VcsClient;
  rootPath?: string;
}

function repoCachePath(config: Config, accountId: string, slug: string): string {
  const base = config.project.vcs.repoCacheDir ?? join(config.TOONED_DATA_DIR, 'repo-cache');
  return join(base, accountId, slug);
}

async function resolveDefaultBranch(
  client: VcsClient | null,
  target: RepoContentTarget,
  account: ResolvedVcsAccount,
  config: Config,
): Promise<string> {
  if (target.defaultBranch) {
    return target.defaultBranch;
  }
  const scope =
    account.provider === 'bitbucket'
      ? account.workspace ?? config.BITBUCKET_WORKSPACE ?? target.repository.split('/')[0] ?? ''
      : account.org ?? target.repository.split('/')[0] ?? '';
  if (!client || !scope) {
    return 'main';
  }
  try {
    const repositories = await client.listRepositories(scope);
    const match = repositories.find(
      (repo) => repo.fullName === target.repository || repo.slug === target.slug,
    );
    if (match?.defaultBranch) {
      return match.defaultBranch;
    }
  } catch {
    // fall through
  }
  return 'main';
}

async function openLocalHandle(
  rootPath: string,
  repository: string,
  kind: 'local' | 'cache',
): Promise<RepoContentHandle> {
  const ref = await resolveGitRef(rootPath);
  return {
    kind,
    repository,
    ref,
    rootPath,
  };
}

export async function resolveRepoContentHandle(input: {
  config: Config;
  target: RepoContentTarget;
  account: ResolvedVcsAccount;
  client: VcsClient | null;
}): Promise<RepoContentHandle | null> {
  const { config, target, account, client } = input;
  const source = target.source;
  const configuredLocalPath = target.localPath ? resolveLocalPath(target.localPath) : undefined;
  const cachePath = repoCachePath(config, target.accountId, target.slug);

  const tryLocal = async (): Promise<RepoContentHandle | null> => {
    if (!configuredLocalPath) {
      return null;
    }
    try {
      if (!statSync(configuredLocalPath).isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }
    console.log(`info: indexing ${target.repository} from local path ${configuredLocalPath}`);
    warnLocalPathIndexingSafety(configuredLocalPath, isGitRepo(configuredLocalPath));
    return openLocalHandle(configuredLocalPath, target.repository, 'local');
  };

  const tryCache = async (): Promise<RepoContentHandle | null> => {
    const branch = await resolveDefaultBranch(client, target, account, config);
    if (isGitRepo(cachePath)) {
      console.log(`info: updating git cache for ${target.repository} at ${cachePath}`);
      const cloneUrl = buildGitCloneUrl({
        provider: target.provider,
        repository: target.repository,
        account,
      });
      await ensureGitCache({ cachePath, cloneUrl, branch });
      return openLocalHandle(cachePath, target.repository, 'cache');
    }
    try {
      const cloneUrl = buildGitCloneUrl({
        provider: target.provider,
        repository: target.repository,
        account,
      });
      console.log(`info: cloning ${target.repository} into cache ${cachePath}`);
      await ensureGitCache({ cachePath, cloneUrl, branch });
      return openLocalHandle(cachePath, target.repository, 'cache');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'git cache failed';
      console.warn(`warn: git cache unavailable for ${target.repository}: ${message}`);
      return null;
    }
  };

  const tryApi = async (): Promise<RepoContentHandle | null> => {
    if (!client) {
      return null;
    }
    const ref = await resolveDefaultBranch(client, target, account, config);
    console.log(`info: indexing ${target.repository} from ${target.provider} API at ${ref}`);
    return {
      kind: 'api',
      repository: target.repository,
      ref,
      client,
    };
  };

  if (source === 'local') {
    return tryLocal();
  }
  if (source === 'cache') {
    return (await tryCache()) ?? null;
  }
  if (source === 'api') {
    return tryApi();
  }

  return (await tryLocal()) ?? (await tryCache()) ?? (await tryApi());
}

export async function listCrawlablePathsFromHandle(handle: RepoContentHandle): Promise<string[]> {
  if (handle.rootPath) {
    return listLocalCrawlablePaths(handle.rootPath);
  }
  if (!handle.client) {
    return [];
  }
  const entries = await handle.client.listSourcePaths({
    repository: handle.repository,
    ref: handle.ref,
  });
  return entries.filter((entry) => entry.type === 'file').map((entry) => entry.path);
}

export async function readSourceFileFromHandle(handle: RepoContentHandle, path: string): Promise<string> {
  if (handle.rootPath) {
    return readLocalSourceFile(handle.rootPath, path);
  }
  if (!handle.client) {
    throw new Error('No repo content source available');
  }
  return handle.client.getSourceFile({
    repository: handle.repository,
    path,
    ref: handle.ref,
  });
}
