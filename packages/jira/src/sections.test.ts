import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDescriptionSections } from './sections.js';

describe('parseDescriptionSections', () => {
  it('parses markdown sections and acceptance criteria blocks', () => {
    const fixturePath = new URL('../../../tests/fixtures/sample-description.txt', import.meta.url);
    const description = readFileSync(fixturePath, 'utf8');

    const parsed = parseDescriptionSections(description);
    expect(parsed.userStory).toContain('As a service rep');
    expect(parsed.requirements).toContain('Render keyboard hints');
    expect(parsed.sme).toBe('Product Enablement Team');
    expect(parsed.acceptanceCriteria).toHaveLength(2);
    expect(parsed.notes).toContain('Reference docs');
  });
});
