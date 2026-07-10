import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listLocalCrawlablePaths, readLocalSourceFile, resolveLocalPath } from './repo-local.js';

describe('repo-local', () => {
  let root = '';

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = '';
    }
  });

  it('resolves home-relative paths', () => {
    expect(resolveLocalPath('~/code')).toContain('/code');
  });

  it('walks a directory tree and skips denied paths', async () => {
    root = mkdtempSync(join(tmpdir(), 'tooned-local-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
    writeFileSync(join(root, 'src/index.ts'), 'export const ok = true;\n', 'utf8');
    writeFileSync(join(root, 'node_modules/pkg/index.js'), 'ignored\n', 'utf8');
    writeFileSync(join(root, '.env'), 'SECRET=1\n', 'utf8');

    const paths = await listLocalCrawlablePaths(root);
    expect(paths).toEqual(['src/index.ts']);
    expect(readLocalSourceFile(root, 'src/index.ts')).toContain('export const ok');
  });
});
