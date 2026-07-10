import { parseConfluenceUrl } from '@tooned/jira';
import type { ConfluenceClient } from './client.js';

export async function resolvePageId(
  url: string,
  client?: Pick<ConfluenceClient, 'resolveTinyLink'>,
): Promise<string | null> {
  const parsed = parseConfluenceUrl(url);
  if (!parsed) {
    return null;
  }

  if (parsed.kind === 'folder') {
    return null;
  }

  if (parsed.pageId) {
    return parsed.pageId;
  }

  if (parsed.kind === 'tiny' && parsed.tinyId && client) {
    return client.resolveTinyLink(parsed.tinyId);
  }

  return null;
}
