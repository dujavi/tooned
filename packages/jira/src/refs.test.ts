import { describe, expect, it } from 'vitest';
import { extractTaggedRefs } from './refs.js';

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
});
