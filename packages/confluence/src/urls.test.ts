import { describe, expect, it, vi } from 'vitest';
import { resolvePageId } from './urls.js';

const SANITIZED_BASE = 'https://example.atlassian.net';

describe('resolvePageId', () => {
  it('returns pageId for standard wiki URLs', async () => {
    await expect(
      resolvePageId(`${SANITIZED_BASE}/wiki/spaces/DEMO/pages/424242/Title`),
    ).resolves.toBe('424242');
  });

  it('returns draftId for resumedraft URLs', async () => {
    await expect(
      resolvePageId(`${SANITIZED_BASE}/wiki/pages/resumedraft.action?draftId=777`),
    ).resolves.toBe('777');
  });

  it('returns null for folder URLs', async () => {
    await expect(resolvePageId(`${SANITIZED_BASE}/wiki/spaces/DEMO/folder/9`)).resolves.toBeNull();
  });

  it('resolves tiny links via client lookup', async () => {
    const client = {
      resolveTinyLink: vi.fn().mockResolvedValue('999'),
    };
    await expect(resolvePageId(`${SANITIZED_BASE}/wiki/x/TinyRef`, client)).resolves.toBe('999');
    expect(client.resolveTinyLink).toHaveBeenCalledWith('TinyRef');
  });

  it('returns null for tiny links without a client', async () => {
    await expect(resolvePageId(`${SANITIZED_BASE}/wiki/x/TinyRef`)).resolves.toBeNull();
  });
});
