import type { VcsProvider } from './types.js';

export type ParsedVcsUrl =
  | {
      provider: VcsProvider;
      kind: 'pull_request';
      repository: string;
      pullRequestId: number;
      url: string;
    }
  | {
      provider: VcsProvider;
      kind: 'commit';
      repository: string;
      commitHash: string;
      url: string;
    };

const BITBUCKET_PR_PATH = /^\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)(?:\/|$)/i;
const BITBUCKET_COMMIT_PATH = /^\/([^/]+)\/([^/]+)\/commits\/([a-f0-9]{7,40})(?:\/|$)/i;
const GITHUB_PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/i;
const GITHUB_COMMIT_PATH = /^\/([^/]+)\/([^/]+)\/commit\/([a-f0-9]{7,40})(?:\/|$)/i;
const SHORT_SHA_REGEX = /\b[a-f0-9]{7,12}\b/gi;

function normalizeRepo(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function parsePullRequestId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function parseVcsUrl(rawUrl: string): ParsedVcsUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, '');

  if (host === 'bitbucket.org') {
    const pr = path.match(BITBUCKET_PR_PATH);
    if (pr) {
      const pullRequestId = parsePullRequestId(pr[3] ?? '');
      if (!pullRequestId) return null;
      return {
        provider: 'bitbucket',
        kind: 'pull_request',
        repository: normalizeRepo(pr[1] ?? '', pr[2] ?? ''),
        pullRequestId,
        url: rawUrl,
      };
    }

    const commit = path.match(BITBUCKET_COMMIT_PATH);
    if (commit) {
      return {
        provider: 'bitbucket',
        kind: 'commit',
        repository: normalizeRepo(commit[1] ?? '', commit[2] ?? ''),
        commitHash: (commit[3] ?? '').toLowerCase(),
        url: rawUrl,
      };
    }
  }

  if (host === 'github.com') {
    const pr = path.match(GITHUB_PR_PATH);
    if (pr) {
      const pullRequestId = parsePullRequestId(pr[3] ?? '');
      if (!pullRequestId) return null;
      return {
        provider: 'github',
        kind: 'pull_request',
        repository: normalizeRepo(pr[1] ?? '', pr[2] ?? ''),
        pullRequestId,
        url: rawUrl,
      };
    }

    const commit = path.match(GITHUB_COMMIT_PATH);
    if (commit) {
      return {
        provider: 'github',
        kind: 'commit',
        repository: normalizeRepo(commit[1] ?? '', commit[2] ?? ''),
        commitHash: (commit[3] ?? '').toLowerCase(),
        url: rawUrl,
      };
    }
  }

  return null;
}

export function extractShortShas(rawText: string | null | undefined): string[] {
  if (!rawText) {
    return [];
  }
  const matches = rawText.match(SHORT_SHA_REGEX) ?? [];
  const unique = new Set(matches.map((value) => value.toLowerCase()));
  return [...unique];
}
