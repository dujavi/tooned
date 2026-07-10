import { describe, expect, it } from 'vitest';
import { buildCrawlCql } from './cql.js';

describe('buildCrawlCql', () => {
  it('returns type=page for all mode', () => {
    expect(buildCrawlCql('all', [])).toBe('type=page');
  });

  it('adds space filter for spaces mode', () => {
    expect(buildCrawlCql('spaces', ['CRM', 'WF'])).toBe(
      'type=page and space in ("CRM", "WF")',
    );
  });

  it('omits space filter when spaces mode has no spaces', () => {
    expect(buildCrawlCql('spaces', [])).toBe('type=page');
  });
});
