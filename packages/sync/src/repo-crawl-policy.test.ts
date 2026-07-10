import { describe, expect, it } from 'vitest';
import {
  detectLanguage,
  hasDeniedPathSegment,
  isDeniedExtension,
  isTextSourcePath,
  shouldCrawlSourceFile,
} from './repo-crawl-policy.js';

describe('repo crawl policy', () => {
  it('denies common binary and vendor paths', () => {
    expect(hasDeniedPathSegment('src/node_modules/pkg/index.js')).toBe(true);
    expect(hasDeniedPathSegment('dist/index.js')).toBe(true);
    expect(isDeniedExtension('assets/logo.png')).toBe(true);
    expect(isDeniedExtension('pnpm-lock.yaml')).toBe(true);
  });

  it('allows typical source files', () => {
    expect(isTextSourcePath('src/index.ts')).toBe(true);
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(
      shouldCrawlSourceFile('src/index.ts', 'export const answer = 42;\n'),
    ).toBe(true);
  });

  it('rejects binary-looking content', () => {
    expect(shouldCrawlSourceFile('src/blob.ts', '\u0000\u0001\u0002')).toBe(false);
  });
});
