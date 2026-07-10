import { describe, expect, it } from 'vitest';
import { parseCodeViewInput } from './code.js';

describe('code view parser', () => {
  it('parses account/repository:path references', () => {
    expect(parseCodeViewInput('gh/acme/tools:src/index.ts')).toEqual({
      accountId: 'gh',
      repository: 'acme/tools',
      path: 'src/index.ts',
    });
  });

  it('rejects malformed references', () => {
    expect(parseCodeViewInput('gh-acme-tools')).toBeNull();
    expect(parseCodeViewInput('gh/tools')).toBeNull();
  });
});
