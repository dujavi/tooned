import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import type { ResolvedVcsAccount, VcsProvider } from '@tooned/core';

const execFileAsync = promisify(execFile);

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly command: string[],
    readonly stderr?: string,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

export async function runGit(cwd: string | undefined, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr
        : undefined;
    const message = error instanceof Error ? error.message : 'git command failed';
    throw new GitCommandError(message, args, stderr);
  }
}

export function isGitRepo(path: string): boolean {
  return existsSync(`${path}/.git`);
}

export async function resolveGitRef(repoPath: string): Promise<string> {
  if (!isGitRepo(repoPath)) {
    return 'HEAD';
  }
  try {
    const branch = (await runGit(repoPath, ['branch', '--show-current'])).trim();
    if (branch) {
      return branch;
    }
  } catch {
    // fall through
  }
  try {
    const head = (await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    if (head && head !== 'HEAD') {
      return head;
    }
  } catch {
    // fall through
  }
  return 'HEAD';
}

export async function listGitTrackedFiles(repoPath: string): Promise<string[]> {
  const output = await runGit(repoPath, ['ls-files', '-z']);
  return output
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildGitCloneUrl(input: {
  provider: VcsProvider;
  repository: string;
  account: ResolvedVcsAccount;
}): string {
  const [owner, slug] = input.repository.split('/');
  if (!owner || !slug) {
    throw new Error(`Invalid repository name: ${input.repository}`);
  }
  if (input.provider === 'bitbucket') {
    if (input.account.token) {
      const token = encodeURIComponent(input.account.token);
      return `https://x-bitbucket-api-token-auth:${token}@bitbucket.org/${owner}/${slug}.git`;
    }
    return `git@bitbucket.org:${owner}/${slug}.git`;
  }
  if (input.account.token) {
    const token = encodeURIComponent(input.account.token);
    return `https://x-access-token:${token}@github.com/${owner}/${slug}.git`;
  }
  return `git@github.com:${owner}/${slug}.git`;
}

export async function ensureGitCache(input: {
  cachePath: string;
  cloneUrl: string;
  branch: string;
}): Promise<void> {
  if (isGitRepo(input.cachePath)) {
    await runGit(input.cachePath, ['fetch', '--depth', '1', 'origin', input.branch]);
    await runGit(input.cachePath, ['checkout', input.branch]);
    await runGit(input.cachePath, ['reset', '--hard', `origin/${input.branch}`]);
    return;
  }

  await runGit(undefined, [
    'clone',
    '--depth',
    '1',
    '--branch',
    input.branch,
    input.cloneUrl,
    input.cachePath,
  ]);
}
