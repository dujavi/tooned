import '@tooned/bitbucket';
import '@tooned/github';
import {
  extractShortShas,
  getDefaultVcsClient,
  parseVcsUrl,
  type Config,
  type VcsClient,
  type VcsCommit,
  type VcsProvider,
} from '@tooned/core';
import type { ExtractedRef } from '@tooned/jira';
import { replaceStoryCommits, type CommitUpsertInput, type Db } from './db.js';

interface ResolvedCommitTarget {
  provider: VcsProvider;
  repository: string;
  hash: string;
  pullRequestUrl: string | null;
}

function providerClientMap(config: Config): Record<VcsProvider, VcsClient | null> {
  return {
    bitbucket: getDefaultVcsClient(config, 'bitbucket'),
    github: getDefaultVcsClient(config, 'github'),
  };
}

function dedupeTargets(targets: ResolvedCommitTarget[]): ResolvedCommitTarget[] {
  const seen = new Set<string>();
  const unique: ResolvedCommitTarget[] = [];
  for (const target of targets) {
    const key = `${target.provider}:${target.repository}:${target.hash}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(target);
  }
  return unique;
}

async function resolveTargets(input: {
  refs: ExtractedRef[];
  developerNotes: string;
  clients: Record<VcsProvider, VcsClient | null>;
}): Promise<ResolvedCommitTarget[]> {
  const repositoriesByProvider: Record<VcsProvider, Set<string>> = {
    bitbucket: new Set<string>(),
    github: new Set<string>(),
  };
  const targets: ResolvedCommitTarget[] = [];

  for (const ref of input.refs) {
    const parsed = parseVcsUrl(ref.url);
    if (!parsed) {
      continue;
    }
    repositoriesByProvider[parsed.provider].add(parsed.repository);
    if (parsed.kind === 'commit') {
      targets.push({
        provider: parsed.provider,
        repository: parsed.repository,
        hash: parsed.commitHash.toLowerCase(),
        pullRequestUrl: null,
      });
      continue;
    }

    const client = input.clients[parsed.provider];
    if (!client) {
      continue;
    }
    try {
      const pullRequest = await client.getPullRequest({
        repository: parsed.repository,
        id: parsed.pullRequestId,
      });
      if (pullRequest.headSha) {
        targets.push({
          provider: parsed.provider,
          repository: parsed.repository,
          hash: pullRequest.headSha.toLowerCase(),
          pullRequestUrl: pullRequest.url,
        });
      }
    } catch {
      // Ignore individual PR enrichment errors to keep sync healthy.
    }
  }

  const shortShas = extractShortShas(input.developerNotes);
  for (const shortSha of shortShas) {
    for (const provider of ['bitbucket', 'github'] as const) {
      const client = input.clients[provider];
      if (!client) {
        continue;
      }
      for (const repository of repositoriesByProvider[provider]) {
        try {
          const resolvedHash = await client.resolveShortSha({
            repository,
            shortSha,
          });
          if (!resolvedHash) {
            continue;
          }
          targets.push({
            provider,
            repository,
            hash: resolvedHash.toLowerCase(),
            pullRequestUrl: null,
          });
        } catch {
          // Continue when a provider cannot resolve a short SHA.
        }
      }
    }
  }

  return dedupeTargets(targets);
}

function toCommitRow(issueKey: string, commit: VcsCommit, provider: VcsProvider): CommitUpsertInput {
  return {
    id: `${issueKey}:${provider}:${commit.repository}:${commit.hash}`,
    issueKey,
    provider,
    repository: commit.repository,
    hash: commit.hash,
    message: commit.message,
    author: commit.author,
    authoredAt: commit.authoredAt,
    url: commit.url,
    pullRequestUrl: commit.pullRequestUrl,
    filesChanged: commit.diffstat?.filesChanged ?? null,
    linesAdded: commit.diffstat?.linesAdded ?? null,
    linesRemoved: commit.diffstat?.linesRemoved ?? null,
  };
}

export async function enrichStoryCommits(input: {
  db: Db;
  config: Config;
  issueKey: string;
  refs: ExtractedRef[];
  developerNotes: string;
}): Promise<void> {
  const clients = providerClientMap(input.config);
  const targets = await resolveTargets({
    refs: input.refs,
    developerNotes: input.developerNotes,
    clients,
  });
  const commits: CommitUpsertInput[] = [];

  for (const target of targets) {
    const client = clients[target.provider];
    if (!client) {
      continue;
    }
    try {
      const commit = await client.getCommit({
        repository: target.repository,
        hash: target.hash,
      });
      const diffstat = commit.diffstat ?? (await client.getDiffstat({ repository: target.repository, hash: target.hash }));
      commits.push(
        toCommitRow(
          input.issueKey,
          {
            ...commit,
            pullRequestUrl: commit.pullRequestUrl ?? target.pullRequestUrl,
            diffstat,
          },
          target.provider,
        ),
      );
    } catch {
      // Continue enrichment when individual commits fail.
    }
  }

  replaceStoryCommits(input.db, input.issueKey, commits);
}
