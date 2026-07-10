import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Config } from '@tooned/core';
import { closeDb, getDb } from './db.js';
import { enrichStory } from './enrichment.js';

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
    LLM_API_KEY: 'test-key',
    LLM_BASE_URL: 'https://llm.local/v1',
    LLM_MODEL: 'test-model',
    TOONED_ENRICH_ON_SYNC: undefined,
    project: {
      jira: {
        projectKey: 'CRM',
        boardId: 7,
        storyIssueType: 'Story',
        bootstrapJql: 'project = CRM',
      },
      fields: {
        sprint: '10020',
      },
      dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
      vcs: { urlDomains: { form: [], confluence: [] }, accounts: [], repos: [], maxFileBytes: 262_144 },
      confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 524_288 },
      parsing: {},
    },
    fieldMap: {
      sprint: '10020',
    },
    dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
  };
}

describe('enrichStory cache behavior', () => {
  let dataDir = '';

  afterEach(() => {
    closeDb();
    vi.clearAllMocks();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  it('uses cache when content hash is unchanged', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-enrich-'));
    const db = getDb(dataDir);
    const config = makeConfig(dataDir);
    const payload = {
      description: 'Story description',
      sections: {
        acceptanceCriteria: ['Given X when Y then Z'],
      },
    };

    db.prepare(
      `INSERT INTO stories (key, issue_id, issue_type, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-1', '1', 'Story', 'Improve dashboard', 'In Progress', JSON.stringify(payload), '2026-07-09', '2026-07-09', null);
    db.prepare(
      `INSERT INTO comments (id, issue_key, author, body, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('c-1', 'CRM-1', 'Agent', 'Open API naming question', '2026-07-09T10:00:00.000Z', '2026-07-09T10:00:00.000Z', '{}');
    db.prepare(
      'INSERT INTO story_search (key, summary, description, comments, dev_notes, attachment_names) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('CRM-1', 'Improve dashboard', 'Story description', 'Open API naming question', 'Need deterministic output', '');

    const provider = {
      complete: vi.fn(async () => 'Fixed mock summary'),
    };

    const first = await enrichStory({
      db,
      config,
      key: 'CRM-1',
      types: ['brief'],
      provider,
    });
    expect(first.generated).toEqual(['brief']);
    expect(first.cached).toEqual([]);
    expect(provider.complete).toHaveBeenCalledTimes(1);

    const second = await enrichStory({
      db,
      config,
      key: 'CRM-1',
      types: ['brief'],
      provider,
    });
    expect(second.generated).toEqual([]);
    expect(second.cached).toEqual(['brief']);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('misses cache when comment timestamps change', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-enrich-'));
    const db = getDb(dataDir);
    const config = makeConfig(dataDir);
    const payload = {
      description: 'Story description',
      sections: {
        acceptanceCriteria: ['Given X when Y then Z'],
      },
    };

    db.prepare(
      `INSERT INTO stories (key, issue_id, issue_type, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-2', '2', 'Story', 'Improve dashboard', 'In Progress', JSON.stringify(payload), '2026-07-09', '2026-07-09', null);
    db.prepare(
      `INSERT INTO comments (id, issue_key, author, body, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('c-1', 'CRM-2', 'Agent', 'Open API naming question', '2026-07-09T10:00:00.000Z', '2026-07-09T10:00:00.000Z', '{}');
    db.prepare(
      'INSERT INTO story_search (key, summary, description, comments, dev_notes, attachment_names) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('CRM-2', 'Improve dashboard', 'Story description', 'Open API naming question', 'Need deterministic output', '');

    const provider = {
      complete: vi.fn(async () => 'Mock summary'),
    };
    await enrichStory({
      db,
      config,
      key: 'CRM-2',
      types: ['brief'],
      provider,
    });
    expect(provider.complete).toHaveBeenCalledTimes(1);

    db.prepare('UPDATE comments SET updated_at = ? WHERE id = ?').run('2026-07-09T10:30:00.000Z', 'c-1');

    const afterUpdate = await enrichStory({
      db,
      config,
      key: 'CRM-2',
      types: ['brief'],
      provider,
    });
    expect(afterUpdate.generated).toEqual(['brief']);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });
});
