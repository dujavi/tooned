import type {
  Config,
  VcsClient,
  VcsCommit,
  VcsDiffstat,
  VcsRepository,
} from '@tooned/core';
import { registerVcsClientFactories } from '@tooned/core';
import type { ResolvedVcsAccount } from '@tooned/core';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface GitHubAuth {
  accountId: string;
  token: string;
  org?: string;
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

interface GitHubRepositoryResponse {
  name: string;
  full_name: string;
  default_branch?: string | null;
}

interface GitHubTreeResponse {
  tree?: Array<{
    path?: string;
    type?: string;
  }>;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

interface GitHubRefResponse {
  object?: {
    sha?: string;
  };
}

function splitRepository(repository: string): { owner: string; repo: string } {
  const [owner = '', repo = ''] = repository.split('/');
  return { owner, repo };
}

function authHeader(auth: GitHubAuth): string {
  return `Bearer ${auth.token}`;
}

async function githubFetch<T>(auth: GitHubAuth, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: authHeader(auth),
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new GitHubError(`Could not reach GitHub: ${message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitHubError('GitHub authentication failed — check account token', response.status);
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

async function paginateRepositories(auth: GitHubAuth, org: string): Promise<GitHubRepositoryResponse[]> {
  const repositories: GitHubRepositoryResponse[] = [];
  let page = 1;
  for (;;) {
    const batch = await githubFetch<GitHubRepositoryResponse[]>(
      auth,
      `/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}`,
    );
    repositories.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }
  return repositories;
}

async function resolveTreeSha(auth: GitHubAuth, repository: string, ref: string): Promise<string> {
  const { owner, repo } = splitRepository(repository);
  const refResponse = await githubFetch<GitHubRefResponse>(
    auth,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`,
  );
  const sha = refResponse.object?.sha;
  if (!sha) {
    throw new GitHubError(`Could not resolve ref ${ref} for ${repository}`);
  }
  return sha;
}

export function createGitHubClientFromAccount(account: ResolvedVcsAccount): VcsClient | null {
  if (account.provider !== 'github' || !account.token) {
    return null;
  }
  return createGitHubClientFromAuth({
    accountId: account.id,
    token: account.token,
    org: account.org,
  });
}

export function createGitHubClientFromAuth(auth: GitHubAuth): VcsClient {
  const getCommitResponse = async (input: { repository: string; hash: string }): Promise<GitHubCommitResponse> => {
    const { owner, repo } = splitRepository(input.repository);
    return githubFetch<GitHubCommitResponse>(
      auth,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(input.hash)}`,
    );
  };

  return {
    provider: 'github',
    accountId: auth.accountId,

    async listRepositories(scope) {
      const repositories = await paginateRepositories(auth, scope);
      return repositories.map(
        (repo): VcsRepository => ({
          slug: repo.name,
          fullName: repo.full_name,
          name: repo.name,
          defaultBranch: repo.default_branch ?? null,
        }),
      );
    },

    async listSourcePaths(input) {
      const { owner, repo } = splitRepository(input.repository);
      const ref = input.ref ?? 'main';
      const treeSha = await resolveTreeSha(auth, input.repository, ref);
      const tree = await githubFetch<GitHubTreeResponse>(
        auth,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
      );
      return (tree.tree ?? [])
        .filter((entry) => typeof entry.path === 'string')
        .map((entry) => ({
          path: entry.path!,
          type: entry.type === 'tree' ? 'directory' : 'file',
        }));
    },

    async getSourceFile(input) {
      const { owner, repo } = splitRepository(input.repository);
      const ref = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
      const encodedPath = input.path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const content = await githubFetch<GitHubContentResponse>(
        auth,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${ref}`,
      );
      if (!content.content || content.encoding !== 'base64') {
        return '';
      }
      return Buffer.from(content.content, 'base64').toString('utf8');
    },

    async getPullRequest(input) {
      const { owner, repo } = splitRepository(input.repository);
      const pullRequest = await githubFetch<GitHubPullRequestResponse>(
        auth,
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

    async resolveShortSha(input) {
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

    async getDiffstat(input) {
      const commit = await getCommitResponse(input);
      return normalizeDiffstat(commit);
    },
  };
}

export function isGitHubConfigured(config: Config): boolean {
  return Boolean(config.GITHUB_TOKEN);
}

export function createGitHubClient(config: Config): VcsClient | null {
  if (!isGitHubConfigured(config)) {
    return null;
  }
  return createGitHubClientFromAuth({
    accountId: 'default-github',
    token: config.GITHUB_TOKEN!,
  });
}

registerVcsClientFactories({
  github: createGitHubClientFromAccount,
});
