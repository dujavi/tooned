import type { Config, VcsClient, VcsCommit, VcsDiffstat, VcsPullRequest } from '@tooned/core';

export class BitbucketError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BitbucketError';
  }
}

interface BitbucketPullRequestResponse {
  id: number;
  title: string;
  links?: {
    html?: { href?: string };
  };
  source?: {
    commit?: { hash?: string };
  };
}

interface BitbucketCommitResponse {
  hash: string;
  message?: string;
  date?: string;
  author?: {
    raw?: string;
    user?: {
      display_name?: string;
    };
  };
  links?: {
    html?: { href?: string };
  };
}

interface BitbucketDiffstatResponse {
  values?: Array<{
    lines_added?: number;
    lines_removed?: number;
  }>;
}

function authHeader(config: Config): string {
  const username = config.BITBUCKET_USERNAME ?? '';
  const token = config.BITBUCKET_TOKEN ?? '';
  const credentials = Buffer.from(`${username}:${token}`).toString('base64');
  return `Basic ${credentials}`;
}

async function bitbucketFetch<T>(config: Config, path: string): Promise<T> {
  const url = `https://api.bitbucket.org/2.0${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: authHeader(config),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new BitbucketError(`Could not reach Bitbucket: ${message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new BitbucketError(
      'Bitbucket authentication failed — check BITBUCKET_USERNAME and BITBUCKET_TOKEN',
      response.status,
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new BitbucketError(`Bitbucket request failed (${response.status}): ${detail}`, response.status);
  }

  return (await response.json()) as T;
}

function normalizeCommit(
  repository: string,
  commit: BitbucketCommitResponse,
  pullRequestUrl: string | null,
  diffstat: VcsDiffstat | null,
): VcsCommit {
  return {
    hash: commit.hash.toLowerCase(),
    repository,
    message: commit.message ?? '',
    author: commit.author?.user?.display_name ?? commit.author?.raw ?? null,
    authoredAt: commit.date ?? null,
    url: commit.links?.html?.href ?? `https://bitbucket.org/${repository}/commits/${commit.hash}`,
    pullRequestUrl,
    diffstat,
  };
}

function toDiffstat(response: BitbucketDiffstatResponse): VcsDiffstat {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const row of response.values ?? []) {
    linesAdded += row.lines_added ?? 0;
    linesRemoved += row.lines_removed ?? 0;
  }
  return {
    filesChanged: (response.values ?? []).length,
    linesAdded,
    linesRemoved,
  };
}

function normalizeWorkspace(config: Config, repository: string): string {
  const [owner] = repository.split('/');
  return config.BITBUCKET_WORKSPACE ?? owner ?? '';
}

export function isBitbucketConfigured(config: Config): boolean {
  return Boolean(config.BITBUCKET_USERNAME && config.BITBUCKET_TOKEN);
}

export function createBitbucketClient(config: Config): VcsClient | null {
  if (!isBitbucketConfigured(config)) {
    return null;
  }

  const getDiffstat = async (input: { repository: string; hash: string }): Promise<VcsDiffstat | null> => {
    const workspace = normalizeWorkspace(config, input.repository);
    const repoSlug = input.repository.split('/')[1] ?? '';
    const result = await bitbucketFetch<BitbucketDiffstatResponse>(
      config,
      `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/diffstat/${encodeURIComponent(input.hash)}`,
    );
    return toDiffstat(result);
  };

  return {
    provider: 'bitbucket',

    async getPullRequest(input): Promise<VcsPullRequest> {
      const workspace = normalizeWorkspace(config, input.repository);
      const pullRequest = await bitbucketFetch<BitbucketPullRequestResponse>(
        config,
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(input.repository.split('/')[1] ?? '')}/pullrequests/${input.id}`,
      );
      return {
        id: String(pullRequest.id),
        title: pullRequest.title,
        repository: input.repository,
        headSha: pullRequest.source?.commit?.hash?.toLowerCase() ?? '',
        url: pullRequest.links?.html?.href ?? `https://bitbucket.org/${input.repository}/pull-requests/${input.id}`,
      };
    },

    async getCommit(input): Promise<VcsCommit> {
      const workspace = normalizeWorkspace(config, input.repository);
      const repoSlug = input.repository.split('/')[1] ?? '';
      const [commit, diffstat] = await Promise.all([
        bitbucketFetch<BitbucketCommitResponse>(
          config,
          `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/commit/${encodeURIComponent(input.hash)}`,
        ),
        getDiffstat(input),
      ]);
      return normalizeCommit(input.repository, commit, null, diffstat);
    },

    async resolveShortSha(input): Promise<string | null> {
      const workspace = normalizeWorkspace(config, input.repository);
      const repoSlug = input.repository.split('/')[1] ?? '';
      try {
        const result = await bitbucketFetch<BitbucketCommitResponse>(
          config,
          `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/commit/${encodeURIComponent(input.shortSha)}`,
        );
        if (!result.hash) {
          return null;
        }
        return result.hash.toLowerCase();
      } catch (error) {
        if (error instanceof BitbucketError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    async getDiffstat(input): Promise<VcsDiffstat | null> {
      return getDiffstat(input);
    },
  };
}
