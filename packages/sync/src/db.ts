import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { ensureDataDir, runMigrations, type Db } from './migrate.js';

let dbInstance: Db | null = null;
let dbPath: string | null = null;

export function getDb(dataDir: string): Db {
  const resolvedPath = join(dataDir, 'tooned.db');
  if (dbInstance && dbPath === resolvedPath) {
    return dbInstance;
  }

  if (dbInstance) {
    dbInstance.close();
  }

  ensureDataDir(dataDir);
  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  dbInstance = db;
  dbPath = resolvedPath;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPath = null;
  }
}

export function getSyncStateValue<T>(db: Db, key: string): T | null {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) {
    return null;
  }
  return JSON.parse(row.value) as T;
}

export function setSyncStateValue(db: Db, key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export function deleteSyncStateValue(db: Db, key: string): void {
  db.prepare('DELETE FROM sync_state WHERE key = ?').run(key);
}

export function getStoryCount(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM stories').get() as { count: number };
  return row.count;
}

export interface StoryRow {
  key: string;
  summary: string | null;
  status: string | null;
  syncedAt: string | null;
  sourceUpdatedAt: string | null;
  doneAt: string | null;
  payload: string | null;
}

export interface StoryFilters {
  status?: string;
  assignee?: string;
  sprint?: string;
  since?: string;
}

export interface StoryListRow extends StoryRow {
  comments: number;
  subtasks: number;
  prs: number;
}

export function listStories(db: Db, limit: number, offset: number): StoryRow[] {
  return db
    .prepare(
      `SELECT key, summary, status, synced_at AS syncedAt, source_updated_at AS sourceUpdatedAt, done_at AS doneAt, payload
       FROM stories
       ORDER BY synced_at DESC, key ASC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as unknown as StoryRow[];
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function getRecordValue(record: Record<string, unknown> | null, key: string): unknown {
  if (!record) {
    return undefined;
  }
  return record[key];
}

function includesText(value: string | null | undefined, query: string): boolean {
  return (value ?? '').toLowerCase().includes(query.toLowerCase());
}

function matchesFilters(row: StoryRow, filters: StoryFilters): boolean {
  if (filters.status && !includesText(row.status, filters.status)) {
    return false;
  }
  if (filters.since && row.sourceUpdatedAt && row.sourceUpdatedAt < filters.since) {
    return false;
  }

  if (!filters.assignee && !filters.sprint) {
    return true;
  }

  const payload = parseJsonRecord(row.payload);
  const customFields = getRecordValue(payload, 'customFields');
  const assignee = getRecordValue(payload, 'assignee');

  if (filters.assignee && !includesText(typeof assignee === 'string' ? assignee : null, filters.assignee)) {
    return false;
  }

  if (filters.sprint) {
    const sprintCandidate =
      (typeof customFields === 'object' && customFields !== null
        ? ((customFields as Record<string, unknown>).sprint ?? '')
        : '') ?? '';
    const sprintText = typeof sprintCandidate === 'string' ? sprintCandidate : JSON.stringify(sprintCandidate);
    if (!includesText(sprintText, filters.sprint)) {
      return false;
    }
  }

  return true;
}

function getStoryMetrics(db: Db, key: string): { comments: number; subtasks: number; prs: number } {
  const commentRow = db
    .prepare('SELECT COUNT(*) AS count FROM comments WHERE issue_key = ?')
    .get(key) as { count: number };
  const subtaskRow = db
    .prepare('SELECT COUNT(*) AS count FROM subtasks WHERE parent_key = ?')
    .get(key) as { count: number };
  const prRow = db
    .prepare('SELECT COUNT(DISTINCT pull_request_url) AS count FROM commits WHERE issue_key = ? AND pull_request_url IS NOT NULL')
    .get(key) as { count: number };
  return {
    comments: commentRow.count,
    subtasks: subtaskRow.count,
    prs: prRow.count,
  };
}

export function listStoriesWithMetrics(
  db: Db,
  filters: StoryFilters,
  limit: number,
  offset: number,
): { total: number; stories: StoryListRow[] } {
  const rows = db
    .prepare(
      `SELECT key, summary, status, synced_at AS syncedAt, source_updated_at AS sourceUpdatedAt, done_at AS doneAt, payload
       FROM stories
       ORDER BY synced_at DESC, key ASC`,
    )
    .all() as unknown as StoryRow[];
  const filtered = rows.filter((row) => matchesFilters(row, filters));
  const selected = filtered.slice(offset, offset + limit);

  return {
    total: filtered.length,
    stories: selected.map((row) => ({
      ...row,
      ...getStoryMetrics(db, row.key),
    })),
  };
}

export function getStoryByKey(db: Db, key: string): StoryRow | null {
  const row = db
    .prepare(
      `SELECT key, summary, status, synced_at AS syncedAt, source_updated_at AS sourceUpdatedAt, done_at AS doneAt, payload
       FROM stories WHERE key = ?`,
    )
    .get(key) as StoryRow | undefined;
  return row ?? null;
}

export interface SearchResultRow {
  key: string;
  summary: string | null;
  status: string | null;
  sourceUpdatedAt: string | null;
  comments: number;
  subtasks: number;
  prs: number;
}

export function searchStories(
  db: Db,
  query: string,
  limit: number,
  options?: { in?: 'all' | 'comments' | 'notes'; status?: string; sprint?: string; since?: string },
): SearchResultRow[] {
  const rows = db
    .prepare(
      `SELECT s.key, s.summary, s.status, s.source_updated_at AS sourceUpdatedAt, s.payload
       FROM story_search f
       JOIN stories s ON s.key = f.key
       WHERE story_search MATCH ?
       ORDER BY bm25(story_search)
       LIMIT 200`,
    )
    .all(query) as unknown as Array<{
    key: string;
    summary: string | null;
    status: string | null;
    sourceUpdatedAt: string | null;
    payload: string | null;
  }>;

  const filtered = rows.filter((row) => {
    if (options?.status && !includesText(row.status, options.status)) {
      return false;
    }
    if (options?.since && row.sourceUpdatedAt && row.sourceUpdatedAt < options.since) {
      return false;
    }
    if (!options?.sprint) {
      return true;
    }
    const payload = parseJsonRecord(row.payload);
    const customFields = getRecordValue(payload, 'customFields');
    const sprintCandidate =
      (typeof customFields === 'object' && customFields !== null
        ? ((customFields as Record<string, unknown>).sprint ?? '')
        : '') ?? '';
    const sprintText = typeof sprintCandidate === 'string' ? sprintCandidate : JSON.stringify(sprintCandidate);
    return includesText(sprintText, options.sprint);
  });

  return filtered.slice(0, limit).map((row) => {
    const metrics = getStoryMetrics(db, row.key);
    return {
      key: row.key,
      summary: row.summary,
      status: row.status,
      sourceUpdatedAt: row.sourceUpdatedAt,
      comments: metrics.comments,
      subtasks: metrics.subtasks,
      prs: metrics.prs,
    };
  });
}

export function getStoryChildren(db: Db, key: string): {
  subtasks: Array<{ key: string; summary: string | null; status: string | null; payload: string | null }>;
  bugs: Array<{ key: string; summary: string | null; status: string | null; payload: string | null }>;
  comments: Array<{ id: string; author: string | null; body: string | null; createdAt: string | null; updatedAt: string | null }>;
  refs: Array<{ id: string; url: string | null; domain: string | null }>;
} {
  const subtasks = db
    .prepare('SELECT key, summary, status, payload FROM subtasks WHERE parent_key = ? ORDER BY key ASC')
    .all(key) as unknown as Array<{ key: string; summary: string | null; status: string | null; payload: string | null }>;
  const bugs = db
    .prepare('SELECT key, summary, status, payload FROM bugs WHERE key IN (SELECT target_key FROM linked_issues WHERE source_key = ?)')
    .all(key) as unknown as Array<{ key: string; summary: string | null; status: string | null; payload: string | null }>;
  const comments = db
    .prepare(
      'SELECT id, author, body, created_at AS createdAt, updated_at AS updatedAt FROM comments WHERE issue_key = ? ORDER BY created_at ASC',
    )
    .all(key) as unknown as Array<{ id: string; author: string | null; body: string | null; createdAt: string | null; updatedAt: string | null }>;
  const refs = db
    .prepare('SELECT id, url, domain FROM extracted_refs WHERE issue_key = ? ORDER BY id ASC')
    .all(key) as unknown as Array<{ id: string; url: string | null; domain: string | null }>;

  return {
    subtasks,
    bugs,
    comments,
    refs,
  };
}

export interface CommitRow {
  id: string;
  issueKey: string;
  provider: string | null;
  repository: string | null;
  hash: string | null;
  message: string | null;
  author: string | null;
  authoredAt: string | null;
  url: string | null;
  pullRequestUrl: string | null;
  filesChanged: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
}

export interface CommitUpsertInput {
  id: string;
  issueKey: string;
  provider: string;
  repository: string;
  hash: string;
  message: string;
  author: string | null;
  authoredAt: string | null;
  url: string;
  pullRequestUrl: string | null;
  filesChanged: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
}

export function replaceStoryCommits(db: Db, issueKey: string, commits: CommitUpsertInput[]): void {
  db.prepare('DELETE FROM commits WHERE issue_key = ?').run(issueKey);
  const insert = db.prepare(
    `INSERT INTO commits (
      id,
      issue_key,
      provider,
      repository,
      hash,
      message,
      author,
      authored_at,
      url,
      pull_request_url,
      files_changed,
      lines_added,
      lines_removed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const commit of commits) {
    insert.run(
      commit.id,
      commit.issueKey,
      commit.provider,
      commit.repository,
      commit.hash,
      commit.message,
      commit.author,
      commit.authoredAt,
      commit.url,
      commit.pullRequestUrl,
      commit.filesChanged,
      commit.linesAdded,
      commit.linesRemoved,
    );
  }
}

export function getStoryCommits(db: Db, key: string): CommitRow[] {
  return db
    .prepare(
      `SELECT
         id,
         issue_key AS issueKey,
         provider,
         repository,
         hash,
         message,
         author,
         authored_at AS authoredAt,
         url,
         pull_request_url AS pullRequestUrl,
         files_changed AS filesChanged,
         lines_added AS linesAdded,
         lines_removed AS linesRemoved
       FROM commits
       WHERE issue_key = ?
       ORDER BY authored_at DESC, hash ASC`,
    )
    .all(key) as unknown as CommitRow[];
}

export interface RefSearchRow {
  id: string;
  issueKey: string;
  url: string | null;
  domain: string | null;
}

export interface StoryHistoryRow {
  id: string;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  changedAt: string | null;
}

export type EnrichmentType = 'brief' | 'commentDigest' | 'implementationHint' | 'changeDelta';

export interface EnrichmentRow {
  storyKey: string;
  type: EnrichmentType;
  contentHash: string;
  content: string;
  createdAt: string;
}

export function searchRefs(db: Db, query: string, limit: number): RefSearchRow[] {
  const likeQuery = `%${query}%`;
  return db
    .prepare(
      `SELECT id, issue_key AS issueKey, url, domain
       FROM extracted_refs
       WHERE issue_key LIKE ? OR url LIKE ? OR domain LIKE ?
       ORDER BY issue_key ASC, id ASC
       LIMIT ?`,
    )
    .all(likeQuery, likeQuery, likeQuery, limit) as unknown as RefSearchRow[];
}

export function getStoryRefs(db: Db, key: string): Array<{ id: string; url: string | null; domain: string | null }> {
  return db
    .prepare('SELECT id, url, domain FROM extracted_refs WHERE issue_key = ? ORDER BY id ASC')
    .all(key) as unknown as Array<{ id: string; url: string | null; domain: string | null }>;
}

export function getStoryComments(db: Db, key: string): Array<{
  id: string;
  author: string | null;
  body: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}> {
  return db
    .prepare(
      'SELECT id, author, body, created_at AS createdAt, updated_at AS updatedAt FROM comments WHERE issue_key = ? ORDER BY created_at ASC',
    )
    .all(key) as unknown as Array<{
    id: string;
    author: string | null;
    body: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
}

export function getStoryHistory(db: Db, key: string, since?: string): StoryHistoryRow[] {
  if (since) {
    return db
      .prepare(
        `SELECT id, field, from_value AS fromValue, to_value AS toValue, changed_at AS changedAt
         FROM changelog
         WHERE issue_key = ? AND changed_at >= ?
         ORDER BY changed_at DESC, id ASC`,
      )
      .all(key, since) as unknown as StoryHistoryRow[];
  }

  return db
    .prepare(
      `SELECT id, field, from_value AS fromValue, to_value AS toValue, changed_at AS changedAt
       FROM changelog
       WHERE issue_key = ?
       ORDER BY changed_at DESC, id ASC`,
    )
    .all(key) as unknown as StoryHistoryRow[];
}

export function getMigrationVersion(db: Db): number {
  const row = db
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get() as { version: number | null } | undefined;
  return row?.version ?? 0;
}

export function getStoryEnrichment(db: Db, storyKey: string, type: EnrichmentType): EnrichmentRow | null {
  const row = db
    .prepare(
      `SELECT story_key AS storyKey, type, content_hash AS contentHash, content, created_at AS createdAt
       FROM enrichments
       WHERE story_key = ? AND type = ?`,
    )
    .get(storyKey, type) as EnrichmentRow | undefined;
  return row ?? null;
}

export function listStoryEnrichments(
  db: Db,
  storyKey: string,
  types?: EnrichmentType[],
): EnrichmentRow[] {
  if (!types || types.length === 0) {
    return db
      .prepare(
        `SELECT story_key AS storyKey, type, content_hash AS contentHash, content, created_at AS createdAt
         FROM enrichments
         WHERE story_key = ?
         ORDER BY type ASC`,
      )
      .all(storyKey) as unknown as EnrichmentRow[];
  }
  const placeholders = types.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT story_key AS storyKey, type, content_hash AS contentHash, content, created_at AS createdAt
       FROM enrichments
       WHERE story_key = ? AND type IN (${placeholders})
       ORDER BY type ASC`,
    )
    .all(storyKey, ...types) as unknown as EnrichmentRow[];
}

export function listEnrichmentsForStories(db: Db, storyKeys: string[], type: EnrichmentType): EnrichmentRow[] {
  if (storyKeys.length === 0) {
    return [];
  }
  const placeholders = storyKeys.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT story_key AS storyKey, type, content_hash AS contentHash, content, created_at AS createdAt
       FROM enrichments
       WHERE type = ? AND story_key IN (${placeholders})`,
    )
    .all(type, ...storyKeys) as unknown as EnrichmentRow[];
}

export function upsertStoryEnrichment(
  db: Db,
  enrichment: { storyKey: string; type: EnrichmentType; contentHash: string; content: string; createdAt: string },
): void {
  db.prepare(
    `INSERT INTO enrichments (story_key, type, content_hash, content, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(story_key, type) DO UPDATE SET
       content_hash = excluded.content_hash,
       content = excluded.content,
       created_at = excluded.created_at`,
  ).run(enrichment.storyKey, enrichment.type, enrichment.contentHash, enrichment.content, enrichment.createdAt);
}

export interface ConfluencePageRow {
  pageId: string;
  spaceKey: string | null;
  title: string | null;
  url: string | null;
  bodyMd: string | null;
  labelsJson: string | null;
  ancestorTitles: string | null;
  version: number | null;
  sourceUpdatedAt: string | null;
  syncedAt: string | null;
  payload: string | null;
}

export interface ConfluencePageUpsertInput {
  pageId: string;
  spaceKey: string | null;
  title: string;
  url: string;
  bodyMd: string;
  labelsJson: string;
  ancestorTitles: string;
  version: number | null;
  sourceUpdatedAt: string | null;
  syncedAt: string;
  payload: string;
}

export interface ConfluenceAttachmentUpsertInput {
  id: string;
  pageId: string;
  filename: string;
  mimeType: string | null;
  textContent: string | null;
  syncedAt: string;
}

export interface PageRefUpsertInput {
  id: string;
  pageId: string;
  issueKey: string | null;
  url: string | null;
  domain: string | null;
}

export function upsertConfluencePage(db: Db, page: ConfluencePageUpsertInput): void {
  db.prepare(
    `INSERT INTO confluence_pages (
      page_id, space_key, title, url, body_md, labels_json, ancestor_titles,
      version, source_updated_at, synced_at, payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(page_id) DO UPDATE SET
      space_key = excluded.space_key,
      title = excluded.title,
      url = excluded.url,
      body_md = excluded.body_md,
      labels_json = excluded.labels_json,
      ancestor_titles = excluded.ancestor_titles,
      version = excluded.version,
      source_updated_at = excluded.source_updated_at,
      synced_at = excluded.synced_at,
      payload = excluded.payload`,
  ).run(
    page.pageId,
    page.spaceKey,
    page.title,
    page.url,
    page.bodyMd,
    page.labelsJson,
    page.ancestorTitles,
    page.version,
    page.sourceUpdatedAt,
    page.syncedAt,
    page.payload,
  );
}

export function replacePageAttachments(db: Db, pageId: string, attachments: ConfluenceAttachmentUpsertInput[]): void {
  db.prepare('DELETE FROM confluence_attachments WHERE page_id = ?').run(pageId);
  const insert = db.prepare(
    `INSERT INTO confluence_attachments (id, page_id, filename, mime_type, text_content, synced_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const attachment of attachments) {
    insert.run(
      attachment.id,
      attachment.pageId,
      attachment.filename,
      attachment.mimeType,
      attachment.textContent,
      attachment.syncedAt,
    );
  }
}

export function replacePageRefs(db: Db, pageId: string, refs: PageRefUpsertInput[]): void {
  db.prepare('DELETE FROM page_refs WHERE page_id = ?').run(pageId);
  const insert = db.prepare(
    'INSERT INTO page_refs (id, page_id, issue_key, url, domain) VALUES (?, ?, ?, ?, ?)',
  );
  for (const ref of refs) {
    insert.run(ref.id, ref.pageId, ref.issueKey, ref.url, ref.domain);
  }
}

export function getPageById(db: Db, pageId: string): ConfluencePageRow | null {
  const row = db
    .prepare(
      `SELECT
         page_id AS pageId,
         space_key AS spaceKey,
         title,
         url,
         body_md AS bodyMd,
         labels_json AS labelsJson,
         ancestor_titles AS ancestorTitles,
         version,
         source_updated_at AS sourceUpdatedAt,
         synced_at AS syncedAt,
         payload
       FROM confluence_pages
       WHERE page_id = ?`,
    )
    .get(pageId) as ConfluencePageRow | undefined;
  return row ?? null;
}

export interface PageListFilters {
  space?: string;
  limit: number;
}

export function listPages(db: Db, filters: PageListFilters): ConfluencePageRow[] {
  if (filters.space) {
    return db
      .prepare(
        `SELECT
           page_id AS pageId,
           space_key AS spaceKey,
           title,
           url,
           body_md AS bodyMd,
           labels_json AS labelsJson,
           ancestor_titles AS ancestorTitles,
           version,
           source_updated_at AS sourceUpdatedAt,
           synced_at AS syncedAt,
           payload
         FROM confluence_pages
         WHERE space_key = ?
         ORDER BY source_updated_at DESC, title ASC
         LIMIT ?`,
      )
      .all(filters.space, filters.limit) as unknown as ConfluencePageRow[];
  }

  return db
    .prepare(
      `SELECT
         page_id AS pageId,
         space_key AS spaceKey,
         title,
         url,
         body_md AS bodyMd,
         labels_json AS labelsJson,
         ancestor_titles AS ancestorTitles,
         version,
         source_updated_at AS sourceUpdatedAt,
         synced_at AS syncedAt,
         payload
       FROM confluence_pages
       ORDER BY source_updated_at DESC, title ASC
       LIMIT ?`,
    )
    .all(filters.limit) as unknown as ConfluencePageRow[];
}

export function getConfluencePageCount(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM confluence_pages').get() as { count: number };
  return row.count;
}

export function rebuildConfluenceSearchRow(db: Db, pageId: string): void {
  const page = getPageById(db, pageId);
  if (!page) {
    db.prepare('DELETE FROM confluence_search WHERE page_id = ?').run(pageId);
    return;
  }

  let labels = '';
  if (page.labelsJson) {
    try {
      const parsed = JSON.parse(page.labelsJson) as unknown;
      if (Array.isArray(parsed)) {
        labels = parsed.filter((item): item is string => typeof item === 'string').join(' ');
      }
    } catch {
      labels = '';
    }
  }

  const attachmentRows = db
    .prepare(
      `SELECT filename, text_content AS textContent
       FROM confluence_attachments
       WHERE page_id = ?
       ORDER BY filename ASC`,
    )
    .all(pageId) as unknown as Array<{ filename: string | null; textContent: string | null }>;

  const attachmentNames = attachmentRows
    .map((row) => row.filename ?? '')
    .filter(Boolean)
    .join(' ');
  const attachmentText = attachmentRows
    .map((row) => row.textContent ?? '')
    .filter(Boolean)
    .join('\n');

  db.prepare('DELETE FROM confluence_search WHERE page_id = ?').run(pageId);
  db.prepare(
    `INSERT INTO confluence_search (page_id, title, body_md, labels, attachment_names, attachment_text)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    pageId,
    page.title ?? '',
    page.bodyMd ?? '',
    labels,
    attachmentNames,
    attachmentText,
  );
}

export function retagWikiExtractedRefs(db: Db): number {
  const result = db
    .prepare(
      `UPDATE extracted_refs
       SET domain = 'confluence'
       WHERE domain = 'jira' AND url LIKE '%/wiki/%'`,
    )
    .run();
  return Number(result.changes);
}

export interface PageSearchResultRow {
  pageId: string;
  title: string | null;
  spaceKey: string | null;
  url: string | null;
  sourceUpdatedAt: string | null;
  excerpt: string | null;
}

export type GlobalSearchSource = 'story' | 'doc' | 'code';

export interface GlobalSearchHit {
  source: GlobalSearchSource;
  key?: string;
  pageId?: string;
  title: string;
  summary?: string | null;
  status?: string | null;
  spaceKey?: string | null;
  url?: string | null;
  sourceUpdatedAt?: string | null;
  comments?: number;
  subtasks?: number;
  prs?: number;
}

export interface GlobalSearchResult {
  results: GlobalSearchHit[];
  codeSearchStatus?: 'not_configured';
  help?: string[];
}

export function searchPages(db: Db, query: string, limit: number): PageSearchResultRow[] {
  const rows = db
    .prepare(
      `SELECT
         p.page_id AS pageId,
         p.title,
         p.space_key AS spaceKey,
         p.url,
         p.source_updated_at AS sourceUpdatedAt,
         substr(p.body_md, 1, 200) AS excerpt
       FROM confluence_search f
       JOIN confluence_pages p ON p.page_id = f.page_id
       WHERE confluence_search MATCH ?
       ORDER BY bm25(confluence_search)
       LIMIT ?`,
    )
    .all(query, limit) as unknown as PageSearchResultRow[];

  return rows;
}

export function searchGlobal(
  db: Db,
  query: string,
  limit: number,
  options?: { status?: string; sprint?: string; since?: string },
): GlobalSearchResult {
  const storyHits = searchStories(db, query, limit, options).map(
    (row): GlobalSearchHit => ({
      source: 'story',
      key: row.key,
      title: row.summary ?? row.key,
      summary: row.summary,
      status: row.status,
      sourceUpdatedAt: row.sourceUpdatedAt,
      comments: row.comments,
      subtasks: row.subtasks,
      prs: row.prs,
    }),
  );
  const docHits = searchPages(db, query, limit).map(
    (row): GlobalSearchHit => ({
      source: 'doc',
      pageId: row.pageId,
      title: row.title ?? row.pageId,
      spaceKey: row.spaceKey,
      url: row.url,
      sourceUpdatedAt: row.sourceUpdatedAt,
      summary: row.excerpt,
    }),
  );

  return {
    results: [...storyHits, ...docHits],
  };
}

export function searchCodeStub(): GlobalSearchResult {
  return {
    results: [],
    codeSearchStatus: 'not_configured',
    help: [
      'Code search is not configured yet',
      'Complete the repo-crawl track to index repositories',
      'Run `tooned search "<query>" --in all` for stories and docs meanwhile',
    ],
  };
}

export type { Db };
