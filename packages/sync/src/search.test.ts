import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closeDb,
  getDb,
  rebuildConfluenceSearchRow,
  replacePageAttachments,
  replacePageRefs,
  searchCodeStub,
  searchGlobal,
  searchPages,
  upsertConfluencePage,
} from './db.js';

describe('confluence search', () => {
  let dataDir = '';

  afterEach(() => {
    closeDb();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  function seedStory(db: ReturnType<typeof getDb>, key: string, summary: string, description: string) {
    db.prepare(
      `INSERT INTO stories (key, issue_id, issue_type, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(key, '1', 'Story', summary, 'In Progress', JSON.stringify({ description }), new Date().toISOString(), new Date().toISOString(), null);
    db.prepare(
      'INSERT INTO story_search (key, summary, description, comments, dev_notes, attachment_names) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(key, summary, description, '', '', '');
  }

  function seedPage(db: ReturnType<typeof getDb>, pageId: string, title: string, bodyMd: string) {
    const syncedAt = '2026-07-10T00:00:00.000Z';
    upsertConfluencePage(db, {
      pageId,
      spaceKey: 'CRM',
      title,
      url: `https://example.atlassian.net/wiki/spaces/CRM/pages/${pageId}`,
      bodyMd,
      labelsJson: '["workflow"]',
      ancestorTitles: '',
      version: 1,
      sourceUpdatedAt: syncedAt,
      syncedAt,
      payload: '{}',
    });
    replacePageAttachments(db, pageId, []);
    replacePageRefs(db, pageId, []);
    rebuildConfluenceSearchRow(db, pageId);
  }

  it('searches confluence pages via FTS', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-search-pages-'));
    const db = getDb(dataDir);
    seedPage(db, '9001', 'Workflow Guide', 'This page documents workflow automation steps.');

    const results = searchPages(db, 'workflow', 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.pageId).toBe('9001');
  });

  it('returns federated story and doc hits', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-search-global-'));
    const db = getDb(dataDir);
    seedStory(db, 'CRM-900', 'Workflow story', 'Story about workflow delivery');
    seedPage(db, '9002', 'Workflow Doc', 'Confluence workflow reference');

    const result = searchGlobal(db, 'workflow', 10);
    expect(result.results.some((hit) => hit.source === 'story' && hit.key === 'CRM-900')).toBe(true);
    expect(result.results.some((hit) => hit.source === 'doc' && hit.pageId === '9002')).toBe(true);
  });

  it('returns explicit empty code search state', () => {
    const result = searchCodeStub();
    expect(result.results).toEqual([]);
    expect(result.codeSearchStatus).toBe('not_configured');
    expect(result.help?.length).toBeGreaterThan(0);
  });
});
