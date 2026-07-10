import { describe, expect, it } from 'vitest';
import { extractTaggedRefs, normalizeConfluenceUrl, parseConfluenceUrl } from './refs.js';

const SANITIZED_BASE = 'https://example.atlassian.net';

describe('extractTaggedRefs', () => {
  it('extracts markdown links and tags domains', () => {
    const refs = extractTaggedRefs({
      markdown:
        'See https://github.com/example/repo/pull/1 and https://wiki.example.internal/display/CRM/Page',
      urlDomains: {
        form: ['forms.example.internal'],
        confluence: ['wiki.example.internal'],
      },
    });
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'github' }),
        expect.objectContaining({ domain: 'confluence' }),
      ]),
    );
  });

  it('classifies /wiki/ URLs on atlassian.net as confluence, not jira', () => {
    const refs = extractTaggedRefs({
      markdown: `${SANITIZED_BASE}/wiki/spaces/DEMO/pages/12345/Design`,
      urlDomains: { form: [], confluence: [] },
    });
    expect(refs).toEqual([
      expect.objectContaining({
        domain: 'confluence',
      }),
    ]);
  });

  it('still classifies bare atlassian.net issue URLs as jira', () => {
    const refs = extractTaggedRefs({
      markdown: `${SANITIZED_BASE}/browse/DEMO-1`,
      urlDomains: { form: [], confluence: [] },
    });
    expect(refs).toEqual([
      expect.objectContaining({
        domain: 'jira',
      }),
    ]);
  });
});

describe('parseConfluenceUrl', () => {
  it('extracts pageId from standard wiki URLs', () => {
    const parsed = parseConfluenceUrl(
      `${SANITIZED_BASE}/wiki/spaces/DEMO/pages/987654321/Example+Page`,
    );
    expect(parsed).toEqual({
      normalizedUrl: `${SANITIZED_BASE}/wiki/spaces/DEMO/pages/987654321/Example+Page`,
      pageId: '987654321',
      kind: 'page',
      spaceKey: 'DEMO',
    });
  });

  it('flags tiny links', () => {
    const parsed = parseConfluenceUrl(`${SANITIZED_BASE}/wiki/x/AbCdEf`);
    expect(parsed).toEqual({
      normalizedUrl: `${SANITIZED_BASE}/wiki/x/AbCdEf`,
      pageId: null,
      kind: 'tiny',
      tinyId: 'AbCdEf',
    });
  });

  it('extracts draftId from resumedraft URLs', () => {
    const parsed = parseConfluenceUrl(
      `${SANITIZED_BASE}/wiki/pages/resumedraft.action?draftId=555&draftShareId=abc`,
    );
    expect(parsed).toEqual({
      normalizedUrl: `${SANITIZED_BASE}/wiki/pages/resumedraft.action?draftId=555&draftShareId=abc`,
      pageId: '555',
      kind: 'draft',
      draftId: '555',
    });
  });

  it('flags folder URLs without a pageId', () => {
    const parsed = parseConfluenceUrl(`${SANITIZED_BASE}/wiki/spaces/DEMO/folder/42`);
    expect(parsed).toEqual({
      normalizedUrl: `${SANITIZED_BASE}/wiki/spaces/DEMO/folder/42`,
      pageId: null,
      kind: 'folder',
      spaceKey: 'DEMO',
    });
  });

  it('strips atlOrigin during normalization', () => {
    const parsed = parseConfluenceUrl(
      `${SANITIZED_BASE}/wiki/spaces/DEMO/pages/111/Page?atlOrigin=foo`,
    );
    expect(parsed?.normalizedUrl).toBe(`${SANITIZED_BASE}/wiki/spaces/DEMO/pages/111/Page`);
    expect(normalizeConfluenceUrl(parsed!.normalizedUrl)).toBe(parsed!.normalizedUrl);
  });

  it('returns null for non-wiki URLs', () => {
    expect(parseConfluenceUrl(`${SANITIZED_BASE}/browse/DEMO-1`)).toBeNull();
  });
});
