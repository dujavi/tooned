import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractShortShas, parseVcsUrl } from './vcs-url.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(resolve(__dirname, '../../../tests/fixtures/vcs-url-fixtures.json'), 'utf8'),
) as {
  bitbucketPullRequestUrl: string;
  bitbucketCommitUrl: string;
  githubPullRequestUrl: string;
  githubCommitUrl: string;
  nonVcsUrl: string;
  developerNotes: string;
};

describe('parseVcsUrl', () => {
  it('parses bitbucket pull request and commit URLs', () => {
    expect(parseVcsUrl(fixtures.bitbucketPullRequestUrl)).toEqual({
      provider: 'bitbucket',
      kind: 'pull_request',
      repository: 'acme/tools',
      pullRequestId: 42,
      url: fixtures.bitbucketPullRequestUrl,
    });

    expect(parseVcsUrl(fixtures.bitbucketCommitUrl)).toEqual({
      provider: 'bitbucket',
      kind: 'commit',
      repository: 'acme/tools',
      commitHash: 'abc1234def56',
      url: fixtures.bitbucketCommitUrl,
    });
  });

  it('parses github pull request and commit URLs', () => {
    expect(parseVcsUrl(fixtures.githubPullRequestUrl)).toEqual({
      provider: 'github',
      kind: 'pull_request',
      repository: 'acme/tools',
      pullRequestId: 91,
      url: fixtures.githubPullRequestUrl,
    });

    expect(parseVcsUrl(fixtures.githubCommitUrl)).toEqual({
      provider: 'github',
      kind: 'commit',
      repository: 'acme/tools',
      commitHash: 'abcdef123456',
      url: fixtures.githubCommitUrl,
    });
  });

  it('returns null for non-vcs links', () => {
    expect(parseVcsUrl(fixtures.nonVcsUrl)).toBeNull();
    expect(parseVcsUrl('not-a-url')).toBeNull();
  });
});

describe('extractShortShas', () => {
  it('extracts unique short SHA tokens from developer notes', () => {
    const result = extractShortShas(fixtures.developerNotes);
    expect(result).toEqual(['abc1234', 'def5678']);
  });
});
