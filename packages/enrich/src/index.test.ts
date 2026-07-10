import { describe, expect, it, vi } from 'vitest';
import { completeEnrichment, createEnrichmentProvider, OpenAiCompatibleProvider } from './index.js';

const basePromptInput = {
  key: 'CRM-1',
  summary: 'Improve review prep',
  description: 'As a reviewer I need key context quickly.',
  acceptanceCriteria: ['Reviewer sees context'],
  developerNotes: 'Prefer deterministic output',
  comments: [{ id: 'c-1', createdAt: '2026-07-10T10:00:00.000Z', updatedAt: null, body: 'Need a final API name.' }],
  changelog: [],
};

describe('createEnrichmentProvider', () => {
  it('returns no-op provider when LLM env is missing', async () => {
    const provider = createEnrichmentProvider({
      ATLASSIAN_EMAIL: 'a@example.com',
      ATLASSIAN_TOKEN: 't',
      ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
      ATLASSIAN_BOARD_ID: 1,
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
      LLM_MODEL: undefined,
      LLM_BASE_URL: undefined,
      TOONED_ENRICH_ON_SYNC: undefined,
      project: {
        jira: { projectKey: 'CRM', boardId: 1, storyIssueType: 'Story' },
        fields: {},
        dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
        vcs: { urlDomains: { form: [], confluence: [] }, accounts: [], repos: [], maxFileBytes: 262_144 },
        confluence: { mode: 'all', spaces: [], maxAttachmentBytes: 524_288 },
        parsing: {},
      },
      fieldMap: {},
      dodTemplates: [{ team: 'default', expectedSubtasks: ['Test'] }],
    });

    const content = await completeEnrichment({
      provider,
      type: 'brief',
      promptInput: basePromptInput,
    });
    expect(content).toBe('');
  });
});

describe('OpenAiCompatibleProvider', () => {
  it('calls chat completions endpoint with deterministic settings', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Three-sentence summary.' } }] }),
    }));
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'key',
      model: 'gpt-test',
      baseUrl: 'https://llm.local/v1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await completeEnrichment({
      provider,
      type: 'brief',
      promptInput: basePromptInput,
      maxTokens: 123,
    });

    expect(result).toBe('Three-sentence summary.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.local/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
      temperature: number;
      max_tokens: number;
    };
    expect(payload.temperature).toBe(0);
    expect(payload.max_tokens).toBe(123);
  });
});
