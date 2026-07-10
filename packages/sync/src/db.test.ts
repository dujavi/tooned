import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closeDb,
  getDb,
  getConfluencePageCount,
  getMigrationVersion,
  getPageById,
  getStoryCommits,
  getStoryCount,
  getCodeFileCount,
  rebuildConfluenceSearchRow,
  searchCode,
  upsertCodeFile,
  replacePageAttachments,
  replacePageRefs,
  replaceStoryCommits,
  retagWikiExtractedRefs,
  searchRefs,
  upsertConfluencePage,
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
    expect(getMigrationVersion(db)).toBe(6);
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

  it('stores confluence pages, attachments, refs, and FTS rows', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-test-'));
    const db = getDb(dataDir);
    const syncedAt = '2026-07-10T00:00:00.000Z';

    upsertConfluencePage(db, {
      pageId: '12345',
      spaceKey: 'DEMO',
      title: 'Sample Page',
      url: 'https://example.atlassian.net/wiki/spaces/DEMO/pages/12345',
      bodyMd: 'See CRM-101 for details',
      labelsJson: '["guide"]',
      ancestorTitles: 'Root',
      version: 3,
      sourceUpdatedAt: syncedAt,
      syncedAt,
      payload: '{}',
    });
    replacePageAttachments(db, '12345', [
      {
        id: 'att-1',
        pageId: '12345',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        textContent: 'sanitized notes',
        syncedAt,
      },
    ]);
    replacePageRefs(db, '12345', [
      {
        id: '12345:issue:CRM-101',
        pageId: '12345',
        issueKey: 'CRM-101',
        url: null,
        domain: 'jira',
      },
    ]);
    rebuildConfluenceSearchRow(db, '12345');

    expect(getConfluencePageCount(db)).toBe(1);
    expect(getPageById(db, '12345')?.title).toBe('Sample Page');
    const fts = db
      .prepare('SELECT page_id FROM confluence_search WHERE confluence_search MATCH ?')
      .all('"CRM-101"') as Array<{ page_id: string }>;
    expect(fts[0]?.page_id).toBe('12345');
  });

  it('retags wiki extracted refs from jira to confluence', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-test-'));
    const db = getDb(dataDir);
    db.prepare('INSERT INTO extracted_refs (id, issue_key, url, domain) VALUES (?, ?, ?, ?)').run(
      'CRM-101-0',
      'CRM-101',
      'https://example.atlassian.net/wiki/spaces/DEMO/pages/1',
      'jira',
    );

    expect(retagWikiExtractedRefs(db)).toBe(1);
    const row = db
      .prepare('SELECT domain FROM extracted_refs WHERE id = ?')
      .get('CRM-101-0') as { domain: string };
    expect(row.domain).toBe('confluence');
  });

  it('stores code files and FTS rows', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-test-code-'));
    const db = getDb(dataDir);
    const syncedAt = '2026-07-10T00:00:00.000Z';

    upsertCodeFile(db, {
      id: 'gh:acme/tools:src/index.ts',
      accountId: 'gh',
      provider: 'github',
      repository: 'acme/tools',
      path: 'src/index.ts',
      ref: 'main',
      language: 'typescript',
      sizeBytes: 24,
      content: 'export const ok = true;\n',
      contentHash: 'hash',
      sourceUpdatedAt: null,
      syncedAt,
    });

    expect(getCodeFileCount(db)).toBe(1);
    const hits = searchCode(db, 'export', 5);
    expect(hits[0]?.path).toBe('src/index.ts');
  });
});
