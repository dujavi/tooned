import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, RepoSourceMode, VcsRepoTarget } from '@tooned/core';
import { getResolvedVcsAccounts, getVcsClient, type VcsProvider } from '@tooned/core';
import '@tooned/bitbucket';
import '@tooned/github';
import {
  buildCodeFileId,
  deleteSyncStateValue,
  deleteStaleCodeFiles,
  getSyncStateValue,
  setSyncStateValue,
  upsertCodeFile,
  type Db,
} from './db.js';
import {
  contentByteLength,
  detectLanguage,
  shouldCrawlSourceFile,
} from './repo-crawl-policy.js';
import {
  listCrawlablePathsFromHandle,
  readSourceFileFromHandle,
  resolveRepoContentHandle,
  type RepoContentHandle,
  type RepoContentTarget,
} from './repo-source.js';

export const CODE_BOOTSTRAP_COMPLETE_KEY = 'codeBootstrapComplete';
export const CODE_BOOTSTRAP_CHECKPOINT_KEY = 'codeBootstrapCheckpoint';
export const CODE_LAST_SYNC_KEY = 'codeLastSync';

export interface RepoSyncOptions {
  force?: boolean;
}

export interface RepoSyncResult {
  reposProcessed: number;
  filesIndexed: number;
  filesSkipped: number;
  filesFailed: number;
  bootstrapComplete: boolean;
}

interface RepoCheckpointEntry {
  ref: string;
  paths: string[];
  nextIndex: number;
  sourceKind?: RepoContentHandle['kind'];
}

interface CodeBootstrapCheckpoint {
  repos: Record<string, RepoCheckpointEntry>;
  updatedAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function repoKey(accountId: string, repository: string): string {
  return `${accountId}:${repository}`;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function buildRepositoryName(
  config: Config,
  accountId: string,
  provider: VcsProvider,
  slug: string,
): string | null {
  const account = getResolvedVcsAccounts(config).find((entry) => entry.id === accountId);
  if (!account) {
    return null;
  }
  if (provider === 'bitbucket') {
    const workspace = account.workspace ?? config.BITBUCKET_WORKSPACE;
    return workspace ? `${workspace}/${slug}` : null;
  }
  const org = account.org;
  return org ? `${org}/${slug}` : null;
}

function isSlugTarget(target: VcsRepoTarget): target is VcsRepoTarget & {
  slug: string;
  source?: RepoSourceMode;
  localPath?: string;
} {
  return 'slug' in target;
}

function isScopeTarget(target: VcsRepoTarget): target is { account: string; scope: 'workspace' | 'org' } {
  return 'scope' in target;
}

function requiresApiCredentials(source: RepoSourceMode, localPath?: string): boolean {
  if (source === 'api') {
    return true;
  }
  if (source === 'local' || source === 'cache') {
    return false;
  }
  return localPath === undefined;
}

async function expandRepoTargets(config: Config): Promise<RepoContentTarget[]> {
  const targets = config.project.vcs.repos;
  if (targets.length === 0) {
    return [];
  }

  const expanded: RepoContentTarget[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const account = getResolvedVcsAccounts(config).find((entry) => entry.id === target.account);
    if (!account) {
      continue;
    }

    if (isSlugTarget(target)) {
      const source = target.source ?? 'auto';
      const repository = buildRepositoryName(config, target.account, account.provider, target.slug);
      if (!repository) {
        console.warn(
          `warn: skipping repo crawl for ${target.account}:${target.slug}: could not resolve repository name`,
        );
        continue;
      }

      if (source === 'local' && !target.localPath) {
        console.warn(
          `warn: skipping repo crawl for ${target.account}:${target.slug}: source=local requires localPath`,
        );
        continue;
      }

      const client = getVcsClient(config, target.account);
      if (requiresApiCredentials(source, target.localPath) && !client) {
        console.warn(`warn: skipping repo crawl for account "${target.account}": missing credentials`);
        continue;
      }

      const key = repoKey(target.account, repository);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      let defaultBranch: string | null = null;
      if (client) {
        try {
          const workspace =
            account.workspace ?? config.BITBUCKET_WORKSPACE ?? repository.split('/')[0] ?? '';
          const repositories = await client.listRepositories(workspace);
          const match = repositories.find(
            (repo) => repo.fullName === repository || repo.slug === target.slug,
          );
          defaultBranch = match?.defaultBranch ?? null;
        } catch {
          // resolveRepoContentHandle falls back when branch lookup fails.
        }
      }

      expanded.push({
        accountId: target.account,
        provider: account.provider,
        repository,
        slug: target.slug,
        defaultBranch,
        localPath: target.localPath,
        source,
      });
      continue;
    }

    const client = getVcsClient(config, target.account);
    if (!client) {
      console.warn(`warn: skipping repo crawl for account "${target.account}": missing credentials`);
      continue;
    }

    if (!isScopeTarget(target)) {
      continue;
    }

    const scope =
      target.scope === 'workspace'
        ? account.workspace ?? config.BITBUCKET_WORKSPACE ?? ''
        : account.org ?? '';
    if (!scope) {
      console.warn(
        `warn: skipping repo crawl scope for account "${target.account}": ${target.scope} not configured`,
      );
      continue;
    }

    try {
      const repositories = await client.listRepositories(scope);
      for (const repository of repositories) {
        const key = repoKey(target.account, repository.fullName);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        expanded.push({
          accountId: target.account,
          provider: account.provider,
          repository: repository.fullName,
          slug: repository.slug,
          defaultBranch: repository.defaultBranch,
          source: 'api',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Repository listing failed';
      console.error(`error: repo crawl list for ${target.account}:${target.scope}: ${message}`);
    }
  }

  return expanded;
}

function writeRepoManifest(
  dataDir: string,
  accountId: string,
  repository: string,
  ref: string,
  manifest: Array<{ path: string; hash: string }>,
): void {
  const slug = repository.split('/').pop() ?? repository.replaceAll('/', '-');
  const manifestDir = join(dataDir, 'repos', accountId, slug);
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, 'manifest.json'),
    JSON.stringify(
      {
        accountId,
        repository,
        ref,
        syncedAt: nowIso(),
        files: manifest,
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function syncRepository(input: {
  db: Db;
  config: Config;
  handle: RepoContentHandle;
  target: RepoContentTarget;
  checkpoint: CodeBootstrapCheckpoint;
  maxFileBytes: number;
}): Promise<{ filesIndexed: number; filesSkipped: number; filesFailed: number }> {
  const key = repoKey(input.target.accountId, input.target.repository);
  const checkpointEntry = input.checkpoint.repos[key];
  const ref = checkpointEntry?.ref ?? input.handle.ref;
  let paths = checkpointEntry?.paths;
  let nextIndex = checkpointEntry?.nextIndex ?? 0;

  if (!paths || checkpointEntry?.sourceKind !== input.handle.kind) {
    paths = await listCrawlablePathsFromHandle(input.handle);
    nextIndex = 0;
    input.checkpoint.repos[key] = { ref, paths, nextIndex, sourceKind: input.handle.kind };
    input.checkpoint.updatedAt = nowIso();
    setSyncStateValue(input.db, CODE_BOOTSTRAP_CHECKPOINT_KEY, input.checkpoint);
  }

  const syncedAt = nowIso();
  const keptFileIds: string[] = [];
  for (let index = 0; index < nextIndex; index += 1) {
    keptFileIds.push(buildCodeFileId(input.target.accountId, input.target.repository, paths[index]!));
  }

  let filesIndexed = 0;
  let filesSkipped = 0;
  let filesFailed = 0;

  for (let index = nextIndex; index < paths.length; index += 1) {
    const path = paths[index]!;
    try {
      const content = await readSourceFileFromHandle(input.handle, path);
      const sizeBytes = contentByteLength(content);
      if (sizeBytes > input.maxFileBytes) {
        filesSkipped += 1;
        console.warn(
          `warn: skipping ${input.target.repository}/${path}: ${sizeBytes} bytes exceeds maxFileBytes ${input.maxFileBytes}`,
        );
        continue;
      }
      if (!shouldCrawlSourceFile(path, content)) {
        filesSkipped += 1;
        continue;
      }

      const fileId = buildCodeFileId(input.target.accountId, input.target.repository, path);
      const contentHash = hashContent(content);
      upsertCodeFile(input.db, {
        id: fileId,
        accountId: input.target.accountId,
        provider: input.target.provider,
        repository: input.target.repository,
        path,
        ref,
        language: detectLanguage(path),
        sizeBytes,
        content,
        contentHash,
        sourceUpdatedAt: null,
        syncedAt,
      });
      keptFileIds.push(fileId);
      filesIndexed += 1;
    } catch (error) {
      filesFailed += 1;
      const message = error instanceof Error ? error.message : 'File ingest failed';
      console.error(`error: code file ${input.target.repository}/${path}: ${message}`);
    }

    input.checkpoint.repos[key] = {
      ref,
      paths,
      nextIndex: index + 1,
      sourceKind: input.handle.kind,
    };
    input.checkpoint.updatedAt = nowIso();
    setSyncStateValue(input.db, CODE_BOOTSTRAP_CHECKPOINT_KEY, input.checkpoint);
  }

  deleteStaleCodeFiles(input.db, input.target.repository, ref, keptFileIds);
  const manifestRows = input.db
    .prepare(
      `SELECT path, content_hash AS hash
       FROM code_files
       WHERE repository = ? AND ref = ?`,
    )
    .all(input.target.repository, ref) as Array<{ path: string; hash: string }>;
  writeRepoManifest(
    input.config.TOONED_DATA_DIR,
    input.target.accountId,
    input.target.repository,
    ref,
    manifestRows,
  );
  delete input.checkpoint.repos[key];
  setSyncStateValue(input.db, CODE_BOOTSTRAP_CHECKPOINT_KEY, input.checkpoint);

  return { filesIndexed, filesSkipped, filesFailed };
}

export async function runRepoSync(
  db: Db,
  config: Config,
  options: RepoSyncOptions = {},
): Promise<RepoSyncResult> {
  const force = Boolean(options.force);
  const reposConfigured = config.project.vcs.repos.length > 0;
  if (!reposConfigured) {
    return {
      reposProcessed: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFailed: 0,
      bootstrapComplete: false,
    };
  }

  const bootstrapComplete = force
    ? false
    : (getSyncStateValue<boolean>(db, CODE_BOOTSTRAP_COMPLETE_KEY) ?? false);
  if (bootstrapComplete && !force) {
    return {
      reposProcessed: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFailed: 0,
      bootstrapComplete: true,
    };
  }

  if (force) {
    deleteSyncStateValue(db, CODE_BOOTSTRAP_CHECKPOINT_KEY);
    setSyncStateValue(db, CODE_BOOTSTRAP_COMPLETE_KEY, false);
  }

  const targets = await expandRepoTargets(config);
  if (targets.length === 0) {
    setSyncStateValue(db, CODE_BOOTSTRAP_COMPLETE_KEY, true);
    setSyncStateValue(db, CODE_LAST_SYNC_KEY, nowIso());
    return {
      reposProcessed: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFailed: 0,
      bootstrapComplete: true,
    };
  }

  const checkpoint =
    force || !getSyncStateValue<CodeBootstrapCheckpoint>(db, CODE_BOOTSTRAP_CHECKPOINT_KEY)
      ? { repos: {} }
      : (getSyncStateValue<CodeBootstrapCheckpoint>(db, CODE_BOOTSTRAP_CHECKPOINT_KEY) ?? { repos: {} });
  const maxFileBytes = config.project.vcs.maxFileBytes;

  let reposProcessed = 0;
  let filesIndexed = 0;
  let filesSkipped = 0;
  let filesFailed = 0;

  for (const target of targets) {
    const account = getResolvedVcsAccounts(config).find((entry) => entry.id === target.accountId);
    if (!account) {
      continue;
    }
    const client = getVcsClient(config, target.accountId);
    const handle = await resolveRepoContentHandle({
      config,
      target,
      account,
      client,
    });
    if (!handle) {
      console.warn(`warn: skipping repo crawl for ${target.repository}: no content source available`);
      continue;
    }
    const result = await syncRepository({
      db,
      config,
      handle,
      target,
      checkpoint,
      maxFileBytes,
    });
    reposProcessed += 1;
    filesIndexed += result.filesIndexed;
    filesSkipped += result.filesSkipped;
    filesFailed += result.filesFailed;
  }

  deleteSyncStateValue(db, CODE_BOOTSTRAP_CHECKPOINT_KEY);
  const completedAt = nowIso();
  setSyncStateValue(db, CODE_BOOTSTRAP_COMPLETE_KEY, true);
  setSyncStateValue(db, CODE_LAST_SYNC_KEY, completedAt);

  return {
    reposProcessed,
    filesIndexed,
    filesSkipped,
    filesFailed,
    bootstrapComplete: true,
  };
}
