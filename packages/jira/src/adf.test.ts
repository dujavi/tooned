import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adfToMarkdown, type AdfDocument } from './adf.js';

describe('adfToMarkdown', () => {
  it('converts headings, links, mentions, and code blocks', () => {
    const fixturePath = new URL('../../../tests/fixtures/sample-story.json', import.meta.url);
    const issue = JSON.parse(readFileSync(fixturePath, 'utf8')) as { fields: { description: AdfDocument } };

    const markdown = adfToMarkdown(issue.fields.description);
    expect(markdown).toContain('## User Story');
    expect(markdown).toContain('As a delivery manager, I can quickly scan sprint risks in a compact panel.');
    expect(markdown).toContain('## Acceptance Criteria');
  });

  it('returns empty string when input is empty', () => {
    expect(adfToMarkdown(null)).toBe('');
  });
});
