import type { Config, VcsClient, VcsCommit, VcsDiffstat, VcsPullRequest } from '@tooned/core';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

interface GitHubPullRequestResponse {
  number: number;
  title: string;
  html_url: string;
  head?: {
    sha?: string;
  };
}

interface GitHubCommitResponse {
  sha: string;
  html_url: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
      date?: string;
    };
  };
  author?: {
    login?: string;
  };
  stats?: {
    total?: number;
    additions?: number;
    deletions?: number;
  };
  files?: unknown[];
}

function splitRepository(repository: string): { owner: string; repo: string } {
  const [owner = '', repo = ''] = repository.split('/');
  return { owner, repo };
}

function authHeader(config: Config): string {
  return `Bearer ${config.GITHUB_TOKEN ?? ''}`;
}

async function githubFetch<T>(config: Config, path: string): Promise<T> {
  const url = `https://api.github.com${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: authHeader(config),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new GitHubError(`Could not reach GitHub: ${message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitHubError('GitHub authentication failed — check GITHUB_TOKEN', response.status);
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new GitHubError(`GitHub request failed (${response.status}): ${detail}`, response.status);
  }

  return (await response.json()) as T;
}

function normalizeDiffstat(commit: GitHubCommitResponse): VcsDiffstat | null {
  if (!commit.stats) {
    return null;
  }
  return {
    filesChanged: Array.isArray(commit.files) ? commit.files.length : 0,
    linesAdded: commit.stats.additions ?? 0,
    linesRemoved: commit.stats.deletions ?? 0,
  };
}

export function isGitHubConfigured(config: Config): boolean {
  return Boolean(config.GITHUB_TOKEN);
}

export function createGitHubClient(config: Config): VcsClient | null {
  if (!isGitHubConfigured(config)) {
    return null;
  }

  const getCommitResponse = async (input: { repository: string; hash: string }): Promise<GitHubCommitResponse> => {
    const { owner, repo } = splitRepository(input.repository);
    return githubFetch<GitHubCommitResponse>(
      config,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(input.hash)}`,
    );
  };

  return {
    provider: 'github',

    async getPullRequest(input): Promise<VcsPullRequest> {
      const { owner, repo } = splitRepository(input.repository);
      const pullRequest = await githubFetch<GitHubPullRequestResponse>(
        config,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${input.id}`,
      );
      return {
        id: String(pullRequest.number),
        title: pullRequest.title,
        repository: input.repository,
        headSha: pullRequest.head?.sha?.toLowerCase() ?? '',
        url: pullRequest.html_url,
      };
    },

    async getCommit(input): Promise<VcsCommit> {
      const commit = await getCommitResponse(input);
      return {
        hash: commit.sha.toLowerCase(),
        repository: input.repository,
        message: commit.commit?.message ?? '',
        author: commit.author?.login ?? commit.commit?.author?.name ?? null,
        authoredAt: commit.commit?.author?.date ?? null,
        url: commit.html_url,
        pullRequestUrl: null,
        diffstat: normalizeDiffstat(commit),
      };
    },

    async resolveShortSha(input): Promise<string | null> {
      try {
        const commit = await getCommitResponse({
          repository: input.repository,
          hash: input.shortSha,
        });
        return commit.sha.toLowerCase();
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    async getDiffstat(input): Promise<VcsDiffstat | null> {
      const commit = await getCommitResponse(input);
      return normalizeDiffstat(commit);
    },
  };
}
