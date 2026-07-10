import { describe, expect, it, vi } from 'vitest';
import { createConfluenceClient } from './client.js';

describe('createConfluenceClient searchCql', () => {
  it('normalizes nested content search hits and nextCursor', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              content: {
                id: '12345',
                type: 'page',
                status: 'current',
                title: 'Sample Page',
                space: { key: 'DEMO' },
              },
              title: 'Sample Page',
            },
          ],
          nextCursor: 'cursor-2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createConfluenceClient({
      ATLASSIAN_EMAIL: 'agent@example.com',
      ATLASSIAN_TOKEN: 'token',
      ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
      ATLASSIAN_BOARD_ID: 1,
      JIRA_PROJECT_KEY: 'CRM',
      JIRA_MAX_CONCURRENT: 2,
      TOONED_SERVICE_PORT: 7420,
      TOONED_DATA_DIR: './data',
      TOONED_SYNC_INTERVAL_MS: 300_000,
      project: {
        jira: { projectKey: 'CRM', boardId: 1, storyIssueType: 'Story' },
        fields: {},
        dodTemplates: [],
        vcs: { urlDomains: { form: [], confluence: [] }, accounts: [], repos: [] },
        confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 1024 },
        parsing: {},
      },
      fieldMap: {},
      dodTemplates: [],
    });

    const page = await client.searchCql('type=page');
    expect(page.results).toEqual([
      {
        id: '12345',
        title: 'Sample Page',
        type: 'page',
        status: 'current',
        space: { key: 'DEMO' },
      },
    ]);
    expect(page.nextCursor).toBe('cursor-2');

    vi.unstubAllGlobals();
  });
});
