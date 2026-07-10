import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '@tooned/core';
import {
  buildCrawlCql,
  confluenceWikiBaseUrl,
  createConfluenceClient,
  shouldDownload,
  storageToMarkdown,
  type ConfluenceAttachment,
  type ConfluenceClient,
  type ConfluencePage,
} from '@tooned/confluence';
import { extractTaggedRefs } from '@tooned/jira';
import {
  deleteSyncStateValue,
  getSyncStateValue,
  rebuildConfluenceSearchRow,
  replacePageAttachments,
  replacePageRefs,
  retagWikiExtractedRefs,
  setSyncStateValue,
  upsertConfluencePage,
  type Db,
  type PageRefUpsertInput,
} from './db.js';

export const CONFLUENCE_BOOTSTRAP_COMPLETE_KEY = 'confluenceBootstrapComplete';
export const CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY = 'confluenceBootstrapCheckpoint';
export const CONFLUENCE_LAST_SYNC_KEY = 'confluenceLastSync';

const PAGE_EXPAND = ['body.storage', 'version', 'space', 'metadata.labels', 'ancestors'];

export interface ConfluenceSyncOptions {
  force?: boolean;
}

export interface ConfluenceSyncResult {
  pagesProcessed: number;
  pagesFailed: number;
  retaggedRefs: number;
  bootstrapComplete: boolean;
}

interface ConfluenceBootstrapCheckpoint {
  cursor?: string | null;
  updatedAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildPageUrl(config: Config, page: ConfluencePage): string {
  const wikiBase = confluenceWikiBaseUrl(config);
  const spaceKey = page.space?.key;
  if (spaceKey) {
    return `${wikiBase}/spaces/${encodeURIComponent(spaceKey)}/pages/${page.id}`;
  }
  return `${wikiBase}/pages/${page.id}`;
}

function extractLabels(page: ConfluencePage): string[] {
  const results = page.metadata?.labels?.results ?? [];
  return results
    .map((label) => (typeof label.name === 'string' ? label.name : null))
    .filter((label): label is string => Boolean(label));
}

function extractAncestorTitles(page: ConfluencePage): string {
  const ancestors = page.ancestors ?? [];
  return ancestors
    .map((ancestor) => ancestor.title ?? '')
    .filter(Boolean)
    .join(' > ');
}

function buildIssueKeyPattern(projectKey: string): RegExp {
  return new RegExp(`\\b${projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\b`, 'gi');
}

function extractPageRefs(
  pageId: string,
  bodyMd: string,
  config: Config,
): PageRefUpsertInput[] {
  const refs: PageRefUpsertInput[] = [];
  const issueKeyPattern = buildIssueKeyPattern(config.JIRA_PROJECT_KEY);
  const issueKeys = new Set<string>();
  for (const match of bodyMd.matchAll(issueKeyPattern)) {
    const issueKey = match[0]?.toUpperCase();
    if (issueKey) {
      issueKeys.add(issueKey);
    }
  }
  for (const issueKey of issueKeys) {
    refs.push({
      id: `${pageId}:issue:${issueKey}`,
      pageId,
      issueKey,
      url: null,
      domain: 'jira',
    });
  }

  const urlRefs = extractTaggedRefs({
    markdown: bodyMd,
    urlDomains: config.project.vcs.urlDomains,
  });
  urlRefs.forEach((ref, index) => {
    refs.push({
      id: `${pageId}:url:${index}`,
      pageId,
      issueKey: null,
      url: ref.url,
      domain: ref.domain,
    });
  });

  return refs;
}

async function ingestAttachments(
  client: ConfluenceClient,
  db: Db,
  config: Config,
  pageId: string,
  attachments: ConfluenceAttachment[],
  syncedAt: string,
): Promise<void> {
  const maxBytes = config.project.confluence.maxAttachmentBytes;
  const rows = [];

  for (const attachment of attachments) {
    const mimeType = attachment.mediaType ?? null;
    const size = attachment.fileSize ?? 0;
    const filename = attachment.title ?? attachment.id;
    let textContent: string | null = null;

    if (
      mimeType &&
      attachment.download &&
      shouldDownload(size, mimeType, maxBytes)
    ) {
      try {
        textContent = await client.downloadAttachmentContent(attachment.download, maxBytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Attachment download failed';
        console.error(`error: confluence attachment ${filename} on page ${pageId}: ${message}`);
      }
    }

    rows.push({
      id: attachment.id,
      pageId,
      filename,
      mimeType,
      textContent,
      syncedAt,
    });
  }

  replacePageAttachments(db, pageId, rows);
}

function writePageAuditBlob(dataDir: string, page: ConfluencePage): void {
  const pagesDir = join(dataDir, 'pages');
  mkdirSync(pagesDir, { recursive: true });
  writeFileSync(join(pagesDir, `${page.id}.json`), JSON.stringify(page, null, 2));
}

async function ingestConfluencePage(
  db: Db,
  config: Config,
  client: ConfluenceClient,
  pageId: string,
): Promise<void> {
  const page = await client.getPage(pageId, PAGE_EXPAND);
  const syncedAt = nowIso();
  const bodyHtml = page.body?.storage?.value ?? '';
  const bodyMd = storageToMarkdown(bodyHtml);
  const labels = extractLabels(page);
  const ancestorTitles = extractAncestorTitles(page);
  const sourceUpdatedAt = page.version?.when ?? null;
  const url = buildPageUrl(config, page);

  db.exec('BEGIN');
  try {
    upsertConfluencePage(db, {
      pageId: page.id,
      spaceKey: page.space?.key ?? null,
      title: page.title,
      url,
      bodyMd,
      labelsJson: JSON.stringify(labels),
      ancestorTitles,
      version: page.version?.number ?? null,
      sourceUpdatedAt,
      syncedAt,
      payload: JSON.stringify({
        id: page.id,
        title: page.title,
        spaceKey: page.space?.key ?? null,
        status: page.status ?? null,
      }),
    });

    const attachments = await client.listAttachments(page.id);
    await ingestAttachments(client, db, config, page.id, attachments, syncedAt);
    replacePageRefs(db, page.id, extractPageRefs(page.id, bodyMd, config));
    rebuildConfluenceSearchRow(db, page.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  writePageAuditBlob(config.TOONED_DATA_DIR, page);
}

export async function runConfluenceSync(
  db: Db,
  config: Config,
  options: ConfluenceSyncOptions = {},
  client: ConfluenceClient = createConfluenceClient(config),
): Promise<ConfluenceSyncResult> {
  const force = Boolean(options.force);
  const bootstrapComplete = force
    ? false
    : (getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false);

  if (bootstrapComplete && !force) {
    return {
      pagesProcessed: 0,
      pagesFailed: 0,
      retaggedRefs: 0,
      bootstrapComplete: true,
    };
  }

  let retaggedRefs = 0;
  if (force) {
    retaggedRefs = retagWikiExtractedRefs(db);
    deleteSyncStateValue(db, CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY);
    setSyncStateValue(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY, false);
  }

  const cql = buildCrawlCql(config.project.confluence.mode, config.project.confluence.spaces);
  const checkpoint = force
    ? null
    : getSyncStateValue<ConfluenceBootstrapCheckpoint>(db, CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY);
  let cursor = checkpoint?.cursor ?? undefined;
  let pagesProcessed = 0;
  let pagesFailed = 0;

  for (;;) {
    const searchPage = await client.searchCql(cql, cursor);
    for (const hit of searchPage.results) {
      if (!hit.id || hit.type !== 'page') {
        continue;
      }
      try {
        await ingestConfluencePage(db, config, client, hit.id);
        pagesProcessed += 1;
      } catch (error) {
        pagesFailed += 1;
        const message = error instanceof Error ? error.message : 'Page ingest failed';
        console.error(`error: confluence page ${hit.id}: ${message}`);
      }
    }

    if (!searchPage.nextCursor) {
      deleteSyncStateValue(db, CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY);
      setSyncStateValue(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY, true);
      break;
    }

    cursor = searchPage.nextCursor;
    setSyncStateValue(db, CONFLUENCE_BOOTSTRAP_CHECKPOINT_KEY, {
      cursor,
      updatedAt: nowIso(),
    });
  }

  const completedAt = nowIso();
  setSyncStateValue(db, CONFLUENCE_LAST_SYNC_KEY, completedAt);

  return {
    pagesProcessed,
    pagesFailed,
    retaggedRefs,
    bootstrapComplete: true,
  };
}
