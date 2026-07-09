import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@tooned/core';
import { createJiraClient } from './client.js';
import { getBacklogIssues, getSprints, resolveCurrentSprint, resolveNextSprint } from './agile.js';

function readFixture(name: string): unknown {
  const path = new URL(`../../../tests/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

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
    vcs: { urlDomains: { form: [], confluence: [] } },
    parsing: {},
  },
  fieldMap: {
    sprint: '10020',
    storyPoints: '10016',
  },
  dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
};

describe('agile jira helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads sprints across pages and resolves current sprint', async () => {
    const page1 = readFixture('agile-sprints-active-page-1.json');
    const page2 = readFixture('agile-sprints-active-page-2.json');
    const future = readFixture('agile-sprints-future.json');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request): Promise<Response> => {
        const url = String(input);
        if (url.includes('/sprint?') && url.includes('state=active') && url.includes('startAt=0')) {
          return jsonResponse(page1);
        }
        if (url.includes('/sprint?') && url.includes('state=active') && url.includes('startAt=1')) {
          return jsonResponse(page2);
        }
        if (url.includes('/sprint?') && url.includes('state=future')) {
          return jsonResponse(future);
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const client = createJiraClient(mockConfig);
    const activeSprints = await getSprints(client, 7, 'active');
    expect(activeSprints).toHaveLength(2);
    expect(activeSprints.map((sprint) => sprint.id)).toEqual([201, 202]);

    const current = await resolveCurrentSprint(client, 7);
    expect(current?.id).toBe(201);
  });

  it('returns the earliest future sprint and backlog issues', async () => {
    const future = readFixture('agile-sprints-future.json');
    const backlog = readFixture('agile-backlog.json');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request): Promise<Response> => {
        const url = String(input);
        if (url.includes('/sprint?') && url.includes('state=future')) {
          return jsonResponse(future);
        }
        if (url.includes('/backlog?')) {
          return jsonResponse(backlog);
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const client = createJiraClient(mockConfig);
    const next = await resolveNextSprint(client, 7);
    expect(next?.id).toBe(209);

    const issues = await getBacklogIssues(client, 7);
    expect(issues.map((issue) => issue.key)).toEqual(['CRM-100', 'CRM-1006']);
  });
});
