import type { VcsClient, VcsCommit, VcsDiffstat, VcsRepository, VcsSourcePath } from '@tooned/core';
import { registerVcsClientFactories } from '@tooned/core';
import type { Config } from '@tooned/core';
import type { ResolvedVcsAccount } from '@tooned/core';

export class BitbucketError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BitbucketError';
  }
}

export interface BitbucketAuth {
  accountId: string;
  username: string;
  token: string;
  workspace?: string;
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

interface BitbucketPage<T> {
  values?: T[];
  next?: string;
}

interface BitbucketRepositoryResponse {
  slug?: string;
  full_name?: string;
  name?: string;
  mainbranch?: { name?: string | null };
}

interface BitbucketSrcEntry {
  path?: string;
  type?: string;
}

function authHeader(auth: BitbucketAuth): string {
  const credentials = Buffer.from(`${auth.username}:${auth.token}`).toString('base64');
  return `Basic ${credentials}`;
}

async function bitbucketFetch<T>(auth: BitbucketAuth, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `https://api.bitbucket.org/2.0${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: authHeader(auth),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new BitbucketError(`Could not reach Bitbucket: ${message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new BitbucketError(
      'Bitbucket authentication failed — check account credentials',
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

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as T;
}

function splitRepository(repository: string): { workspace: string; repoSlug: string } {
  const [workspace = '', repoSlug = ''] = repository.split('/');
  return { workspace, repoSlug };
}

function normalizeWorkspace(auth: BitbucketAuth, repository: string): string {
  const { workspace } = splitRepository(repository);
  return auth.workspace ?? workspace;
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

async function paginate<T>(auth: BitbucketAuth, initialPath: string): Promise<T[]> {
  const results: T[] = [];
  let nextPath: string | null = initialPath;
  while (nextPath) {
    const page: BitbucketPage<T> = await bitbucketFetch<BitbucketPage<T>>(auth, nextPath);
    results.push(...(page.values ?? []));
    nextPath = page.next ?? null;
  }
  return results;
}

async function listDirectoryEntries(
  auth: BitbucketAuth,
  repository: string,
  ref: string,
  prefix: string,
): Promise<VcsSourcePath[]> {
  const workspace = normalizeWorkspace(auth, repository);
  const { repoSlug } = splitRepository(repository);
  const encodedPrefix = prefix
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const suffix = encodedPrefix ? `/${encodedPrefix}` : '/';
  const entries = await paginate<BitbucketSrcEntry>(
    auth,
    `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/src/${encodeURIComponent(ref)}${suffix}?pagelen=100`,
  );
  return entries
    .filter((entry) => typeof entry.path === 'string')
    .map((entry) => ({
      path: entry.path!,
      type: entry.type === 'commit_directory' ? 'directory' : 'file',
    }));
}

export function createBitbucketClientFromAccount(account: ResolvedVcsAccount): VcsClient | null {
  if (account.provider !== 'bitbucket' || !account.username || !account.token) {
    return null;
  }
  const auth: BitbucketAuth = {
    accountId: account.id,
    username: account.username,
    token: account.token,
    workspace: account.workspace,
  };
  return createBitbucketClientFromAuth(auth);
}

export function createBitbucketClientFromAuth(auth: BitbucketAuth): VcsClient {
  const getDiffstat = async (input: { repository: string; hash: string }): Promise<VcsDiffstat | null> => {
    const workspace = normalizeWorkspace(auth, input.repository);
    const repoSlug = input.repository.split('/')[1] ?? '';
    const result = await bitbucketFetch<BitbucketDiffstatResponse>(
      auth,
      `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/diffstat/${encodeURIComponent(input.hash)}`,
    );
    return toDiffstat(result);
  };

  return {
    provider: 'bitbucket',
    accountId: auth.accountId,

    async listRepositories(scope) {
      const repositories = await paginate<BitbucketRepositoryResponse>(
        auth,
        `/repositories/${encodeURIComponent(scope)}?pagelen=100`,
      );
      return repositories
        .filter((repo) => repo.slug && repo.full_name)
        .map(
          (repo): VcsRepository => ({
            slug: repo.slug!,
            fullName: repo.full_name!,
            name: repo.name ?? repo.slug!,
            defaultBranch: repo.mainbranch?.name ?? null,
          }),
        );
    },

    async listSourcePaths(input) {
      const ref = input.ref ?? 'main';
      const queue = [''];
      const seen = new Set<string>();
      const paths: VcsSourcePath[] = [];

      while (queue.length > 0) {
        const prefix = queue.shift() ?? '';
        if (seen.has(prefix)) {
          continue;
        }
        seen.add(prefix);
        const entries = await listDirectoryEntries(auth, input.repository, ref, prefix);
        for (const entry of entries) {
          paths.push(entry);
          if (entry.type === 'directory') {
            queue.push(entry.path);
          }
        }
      }

      return paths;
    },

    async getSourceFile(input) {
      const workspace = normalizeWorkspace(auth, input.repository);
      const { repoSlug } = splitRepository(input.repository);
      const ref = input.ref ?? 'main';
      const encodedPath = input.path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const content = await bitbucketFetch<string>(
        auth,
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/src/${encodeURIComponent(ref)}/${encodedPath}`,
        { headers: { Accept: 'text/plain' } },
      );
      return typeof content === 'string' ? content : '';
    },

    async getPullRequest(input) {
      const workspace = normalizeWorkspace(auth, input.repository);
      const pullRequest = await bitbucketFetch<BitbucketPullRequestResponse>(
        auth,
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

    async getCommit(input) {
      const workspace = normalizeWorkspace(auth, input.repository);
      const repoSlug = input.repository.split('/')[1] ?? '';
      const [commit, diffstat] = await Promise.all([
        bitbucketFetch<BitbucketCommitResponse>(
          auth,
          `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/commit/${encodeURIComponent(input.hash)}`,
        ),
        getDiffstat(input),
      ]);
      return normalizeCommit(input.repository, commit, null, diffstat);
    },

    async resolveShortSha(input) {
      const workspace = normalizeWorkspace(auth, input.repository);
      const repoSlug = input.repository.split('/')[1] ?? '';
      try {
        const result = await bitbucketFetch<BitbucketCommitResponse>(
          auth,
          `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/commit/${encodeURIComponent(input.shortSha)}`,
        );
        return result.hash ? result.hash.toLowerCase() : null;
      } catch (error) {
        if (error instanceof BitbucketError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    async getDiffstat(input) {
      return getDiffstat(input);
    },
  };
}

export function isBitbucketConfigured(config: Config): boolean {
  return Boolean((config.BITBUCKET_USERNAME ?? config.ATLASSIAN_EMAIL) && config.BITBUCKET_TOKEN);
}

export function createBitbucketClient(config: Config): VcsClient | null {
  if (!isBitbucketConfigured(config)) {
    return null;
  }
  return createBitbucketClientFromAuth({
    accountId: 'default',
    username: config.BITBUCKET_USERNAME ?? config.ATLASSIAN_EMAIL,
    token: config.BITBUCKET_TOKEN!,
    workspace: config.BITBUCKET_WORKSPACE,
  });
}

registerVcsClientFactories({
  bitbucket: createBitbucketClientFromAccount,
});
