import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@tooned/core';
import type { ConfluenceClient } from '@tooned/confluence';
import {
  closeDb,
  getConfluencePageCount,
  getDb,
  getPageById,
  getSyncStateValue,
} from './db.js';
import {
  CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY,
  CONFLUENCE_BOOTSTRAP_COMPLETE_KEY,
  runConfluenceSync,
} from './confluence-sync.js';

function makeConfig(dataDir: string): Config {
  return {
    ATLASSIAN_EMAIL: 'agent@example.com',
    ATLASSIAN_TOKEN: 'token',
    ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
    ATLASSIAN_BOARD_ID: 7,
    BITBUCKET_USERNAME: undefined,
    BITBUCKET_TOKEN: undefined,
    BITBUCKET_WORKSPACE: undefined,
    GITHUB_TOKEN: undefined,
    TOONED_SERVICE_PORT: 7420,
    TOONED_DATA_DIR: dataDir,
    TOONED_SYNC_INTERVAL_MS: 300_000,
    JIRA_PROJECT_KEY: 'CRM',
    JIRA_MAX_CONCURRENT: 4,
    TOONED_CONFIG_PATH: undefined,
    LLM_API_KEY: undefined,
    LLM_BASE_URL: undefined,
    LLM_MODEL: undefined,
    TOONED_ENRICH_ON_SYNC: undefined,
    project: {
      jira: {
        projectKey: 'CRM',
        boardId: 7,
        storyIssueType: 'Story',
      },
      fields: {},
      dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
      vcs: { urlDomains: { form: [], confluence: ['example.atlassian.net'] }, accounts: [], repos: [] },
      confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 1024 },
      parsing: {},
    },
    fieldMap: {},
    dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
  };
}

function makeClient(): ConfluenceClient {
  return {
    listSpaces: vi.fn(async () => []),
    searchCql: vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ id: '111', type: 'page', title: 'First' }],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        results: [{ id: '222', type: 'page', title: 'Second' }],
        nextCursor: null,
      }),
    getPage: vi.fn(async (pageId: string) => ({
      id: pageId,
      type: 'page',
      title: `Page ${pageId}`,
      space: { key: 'DEMO' },
      version: { number: 1, when: '2026-07-10T00:00:00.000Z' },
      body: {
        storage: {
          value: `<p>Track CRM-101 and <a href="https://example.atlassian.net/wiki/x/Tiny">tiny</a></p>`,
          representation: 'storage',
        },
      },
      metadata: { labels: { results: [{ name: 'guide' }] } },
      ancestors: [{ id: '1', title: 'Root' }],
    })),
    listAttachments: vi.fn(async () => [
      {
        id: 'att-1',
        title: 'diagram.png',
        mediaType: 'image/png',
        fileSize: 120,
      },
      {
        id: 'att-2',
        title: 'notes.txt',
        mediaType: 'text/plain',
        fileSize: 12,
        download: '/download/attachments/222/notes.txt',
      },
    ]),
    resolveTinyLink: vi.fn(async () => null),
    downloadAttachmentContent: vi.fn(async () => 'sanitized attachment text'),
  };
}

describe('runConfluenceSync', () => {
  let dataDir = '';

  afterEach(() => {
    closeDb();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  it('resumes bootstrap from checkpoint and stores pages with attachments', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-confluence-sync-'));
    const db = getDb(dataDir);
    const config = makeConfig(dataDir);

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY,
      JSON.stringify({ cursor: 'cursor-2', updatedAt: '2026-07-10T00:00:00.000Z' }),
    );

    const client: ConfluenceClient = {
      ...makeClient(),
      searchCql: vi.fn(async (_cql, cursor) => {
        expect(cursor).toBe('cursor-2');
        return {
          results: [{ id: '222', type: 'page', title: 'Second' }],
          nextCursor: null,
        };
      }),
    };

    const result = await runConfluenceSync(db, config, {}, client);

    expect(result.pagesProcessed).toBe(1);
    expect(result.bootstrapComplete).toBe(true);
    expect(getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY)).toBe(true);
    expect(getConfluencePageCount(db)).toBe(1);
    expect(getPageById(db, '222')?.bodyMd).toContain('CRM-101');

    const attachment = db
      .prepare('SELECT filename, text_content AS textContent FROM confluence_attachments WHERE page_id = ?')
      .all('222') as Array<{ filename: string; textContent: string | null }>;
    expect(attachment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'diagram.png', textContent: null }),
        expect.objectContaining({ filename: 'notes.txt', textContent: 'sanitized attachment text' }),
      ]),
    );

    expect(existsSync(join(dataDir, 'pages', '222.json'))).toBe(true);
    const audit = JSON.parse(readFileSync(join(dataDir, 'pages', '222.json'), 'utf8')) as { id: string };
    expect(audit.id).toBe('222');
  });

  it('retags wiki refs on force and restarts bootstrap', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-confluence-sync-force-'));
    const db = getDb(dataDir);
    const config = makeConfig(dataDir);
    db.prepare('INSERT INTO extracted_refs (id, issue_key, url, domain) VALUES (?, ?, ?, ?)').run(
      'CRM-1-0',
      'CRM-1',
      'https://example.atlassian.net/wiki/spaces/DEMO/pages/1',
      'jira',
    );
    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      CONFLUENCE_BOOTSTRAP_COMPLETE_KEY,
      JSON.stringify(true),
    );

    const client: ConfluenceClient = {
      ...makeClient(),
      searchCql: vi.fn(async () => ({
        results: [{ id: '333', type: 'page', title: 'Only' }],
        nextCursor: null,
      })),
    };

    const result = await runConfluenceSync(db, config, { force: true }, client);

    expect(result.retaggedRefs).toBe(1);
    expect(result.pagesProcessed).toBe(1);
    const row = db
      .prepare('SELECT domain FROM extracted_refs WHERE id = ?')
      .get('CRM-1-0') as { domain: string };
    expect(row.domain).toBe('confluence');
  });
});
