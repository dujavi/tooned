import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closeDb,
  getDb,
  getMigrationVersion,
  getStoryCommits,
  getStoryCount,
  replaceStoryCommits,
  searchRefs,
} from '../src/db.js';

describe('getDb', () => {
  let dataDir: string;

  afterEach(() => {
    closeDb();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('creates database with migrations applied', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-test-'));
    const db = getDb(dataDir);
    expect(getMigrationVersion(db)).toBe(4);
    expect(getStoryCount(db)).toBe(0);
  });

  it('stores and reads story commits', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-test-'));
    const db = getDb(dataDir);
    db.prepare(
      `INSERT INTO stories (key, issue_id, issue_type, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-101', '101', 'Story', 'Sample story', 'In Progress', '{}', new Date().toISOString(), new Date().toISOString(), null);

    replaceStoryCommits(db, 'CRM-101', [
      {
        id: 'CRM-101:github:acme/tools:abc1234',
        issueKey: 'CRM-101',
        provider: 'github',
        repository: 'acme/tools',
        hash: 'abc1234',
        message: 'sanitized commit',
        author: 'dev-user',
        authoredAt: '2026-01-01T00:00:00.000Z',
        url: 'https://github.com/acme/tools/commit/abc1234',
        pullRequestUrl: 'https://github.com/acme/tools/pull/12',
        filesChanged: 1,
        linesAdded: 5,
        linesRemoved: 2,
      },
    ]);

    const commits = getStoryCommits(db, 'CRM-101');
    expect(commits).toHaveLength(1);
    expect(commits[0]?.provider).toBe('github');
    expect(commits[0]?.hash).toBe('abc1234');
  });

  it('searches extracted refs by query text', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-test-'));
    const db = getDb(dataDir);
    db.prepare('INSERT INTO extracted_refs (id, issue_key, url, domain) VALUES (?, ?, ?, ?)').run(
      'CRM-101-0',
      'CRM-101',
      'https://github.com/acme/tools/pull/12',
      'github',
    );

    const refs = searchRefs(db, 'acme/tools', 10);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.issueKey).toBe('CRM-101');
  });
});
