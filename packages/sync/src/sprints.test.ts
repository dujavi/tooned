import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '@tooned/core';
import { closeDb, getDb } from './db.js';
import { listBacklogStories, listStoriesForSprint } from './sprints.js';

const mockConfig: Config = {
  ATLASSIAN_EMAIL: 'agent@example.com',
  ATLASSIAN_TOKEN: 'token',
  ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
  ATLASSIAN_BOARD_ID: 7,
  BITBUCKET_USERNAME: undefined,
  BITBUCKET_TOKEN: undefined,
  BITBUCKET_WORKSPACE: undefined,
  GITHUB_TOKEN: undefined,
  TOONED_SERVICE_PORT: 7420,
  TOONED_DATA_DIR: './data',
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
      bootstrapJql: 'project = CRM AND issuetype = Story',
    },
    fields: {
      sprint: '10020',
      storyPoints: '10016',
    },
    dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
    vcs: { urlDomains: { form: [], confluence: [] }, accounts: [], repos: [] },
    confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 524_288 },
    parsing: {},
  },
  fieldMap: {
    sprint: '10020',
    storyPoints: '10016',
  },
  dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
};

describe('sprint story matching', () => {
  let dataDir = '';

  afterEach(() => {
    closeDb();
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('matches stories by configured sprint field and computes backlog', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'tooned-sprints-test-'));
    const db = getDb(dataDir);

    const storyOnePayload = {
      customFields: {
        sprint: [{ id: 209, name: 'Sprint 42.5', state: 'future' }],
        storyPoints: 5,
      },
      assignee: 'Alice',
      timeSpentSeconds: 1200,
    };
    const storyTwoPayload = {
      customFields: {
        sprint:
          'com.atlassian.greenhopper.service.sprint.Sprint@123[id=210,rapidViewId=7,state=FUTURE,name=Sprint 43]',
        storyPoints: 3,
      },
      assignee: 'Bob',
      timeSpentSeconds: 600,
    };
    const backlogPayload = {
      customFields: {
        storyPoints: 2,
      },
    };

    db.prepare(
      `INSERT INTO stories (key, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-100', 'Story one', 'In Progress', JSON.stringify(storyOnePayload), '2026-07-01', '2026-07-01', null);
    db.prepare(
      `INSERT INTO stories (key, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-1006', 'Story two', 'To Do', JSON.stringify(storyTwoPayload), '2026-07-01', '2026-07-01', null);
    db.prepare(
      `INSERT INTO stories (key, summary, status, payload, synced_at, source_updated_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-1008', 'Backlog story', 'To Do', JSON.stringify(backlogPayload), '2026-07-01', '2026-07-01', null);

    const subtaskPayload = {
      fields: {
        assignee: {
          displayName: 'Charlie',
        },
        timespent: 900,
      },
    };
    db.prepare(
      `INSERT INTO subtasks (key, parent_key, summary, status, payload, synced_at, source_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('CRM-100-sub-1', 'CRM-100', 'Subtask', 'Done', JSON.stringify(subtaskPayload), '2026-07-01', '2026-07-01');

    const sprintStories = listStoriesForSprint(209, db, mockConfig);
    expect(sprintStories.map((story) => story.key)).toEqual(['CRM-100']);
    expect(sprintStories[0]?.subtaskCount).toBe(1);
    expect(sprintStories[0]?.assignees.sort()).toEqual(['Alice', 'Charlie']);
    expect(sprintStories[0]?.timeSpentSeconds).toBe(2100);
    expect(sprintStories[0]?.storyPoints).toBe(5);

    const backlog = listBacklogStories(db, 7, mockConfig);
    expect(backlog.map((story) => story.key)).toEqual(['CRM-1008']);
  });
});
