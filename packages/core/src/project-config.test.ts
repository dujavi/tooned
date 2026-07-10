import { describe, expect, it } from 'vitest';
import {
  ProjectConfigSchema,
  confluenceConfigWarnings,
  suggestConfluenceHosts,
} from './project-config.js';

describe('ProjectConfigSchema confluence', () => {
  it('applies confluence defaults', () => {
    const parsed = ProjectConfigSchema.parse({
      jira: { projectKey: 'DEMO', boardId: 1 },
    });
    expect(parsed.confluence).toEqual({
      mode: 'all',
      spaces: [],
      maxAttachmentBytes: 524_288,
    });
  });

  it('validates confluence mode and spaces', () => {
    const parsed = ProjectConfigSchema.parse({
      jira: { projectKey: 'DEMO', boardId: 1 },
      confluence: {
        mode: 'spaces',
        spaces: ['CRM', 'WF'],
        maxAttachmentBytes: 1024,
      },
    });
    expect(parsed.confluence.mode).toBe('spaces');
    expect(parsed.confluence.spaces).toEqual(['CRM', 'WF']);
  });
});

describe('suggestConfluenceHosts', () => {
  it('returns configured hosts when present', () => {
    expect(suggestConfluenceHosts(['wiki.example.test'], 'https://other.example.net')).toEqual([
      'wiki.example.test',
    ]);
  });

  it('derives host from ATLASSIAN_BASE_URL when list is empty', () => {
    expect(suggestConfluenceHosts([], 'https://example.atlassian.net/')).toEqual([
      'example.atlassian.net',
    ]);
  });
});

describe('confluenceConfigWarnings', () => {
  it('warns when mode is spaces but spaces is empty', () => {
    const project = ProjectConfigSchema.parse({
      jira: { projectKey: 'DEMO', boardId: 1 },
      confluence: { mode: 'spaces', spaces: [] },
    });
    expect(confluenceConfigWarnings(project)).toContain(
      'confluence.mode is "spaces" but confluence.spaces is empty',
    );
  });
});
