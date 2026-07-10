import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFieldId, type Config } from '@tooned/core';
import {
  STORY_FIELDS,
  adfToMarkdown,
  createJiraClient,
  extractTaggedRefs,
  parseDescriptionSections,
  type JiraChangelogHistory,
  type JiraIssue,
} from '@tooned/jira';
import {
  deleteSyncStateValue,
  getDb,
  getSyncStateValue,
  setSyncStateValue,
  type Db,
} from './db.js';
import { queueStoryEnrichmentOnSync } from './enrichment.js';
import { enrichStoryCommits } from './vcs-enrich.js';
import {
  CONFLUENCE_BOOTSTRAP_COMPLETE_KEY,
  runConfluenceSync,
} from './confluence-sync.js';
import {
  CODE_BOOTSTRAP_COMPLETE_KEY,
  runRepoSync,
} from './repo-sync.js';

const SYNC_KEY = 'sync';
const LAST_SYNC_KEY = 'lastSync';
const BOOTSTRAP_COMPLETE_KEY = 'bootstrapComplete';
const CHECKPOINT_KEY = 'bootstrapCheckpoint';
const BOOTSTRAP_JQL_KEY = 'bootstrapJqlUsed';

interface SyncStateRecord {
  lastSync: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastError?: string | null;
  lastRunStartedAt?: string | null;
  lastRunFinishedAt?: string | null;
}

interface StoryPayloadRecord {
  key: string;
  id: string;
  issueType: string;
  summary: string;
  status: string;
  description: string;
  sections: ReturnType<typeof parseDescriptionSections>;
  customFields: Record<string, unknown>;
  assignee: string | null;
  timeSpentSeconds: number | null;
}

export interface SyncRunOptions {
  force?: boolean;
}

export interface SyncRunResult {
  mode: 'bootstrap+delta' | 'delta';
  bootstrapJql: string;
  bootstrapProcessed: number;
  deltaProcessed: number;
  parentRefreshCount: number;
  linkedBugCount: number;
  lastSync: string;
}

let activeSyncRun: Promise<SyncRunResult> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function quoteJqlValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function toJqlTimestamp(iso: string): string {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getIssueTypeName(issue: JiraIssue): string {
  const issueType = issue.fields.issuetype;
  if (isRecord(issueType) && typeof issueType.name === 'string') {
    return issueType.name;
  }
  return 'Unknown';
}

function getStatusName(issue: JiraIssue): string {
  const status = issue.fields.status;
  if (isRecord(status) && typeof status.name === 'string') {
    return status.name;
  }
  return 'Unknown';
}

function getSummary(issue: JiraIssue): string {
  const summary = issue.fields.summary;
  return typeof summary === 'string' ? summary : '';
}

function getAssignee(issue: JiraIssue): string | null {
  const assignee = issue.fields.assignee;
  if (!isRecord(assignee)) {
    return null;
  }
  if (typeof assignee.displayName === 'string' && assignee.displayName.trim()) {
    return assignee.displayName;
  }
  if (typeof assignee.accountId === 'string' && assignee.accountId.trim()) {
    return assignee.accountId;
  }
  return null;
}

function getTimeSpentSeconds(issue: JiraIssue): number | null {
  const value = issue.fields.timespent;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), 0);
  }
  return null;
}

function getUpdated(issue: JiraIssue): string {
  const updated = issue.fields.updated;
  return typeof updated === 'string' ? updated : nowIso();
}

function getParentKey(issue: JiraIssue): string | null {
  const parent = issue.fields.parent;
  if (isRecord(parent) && typeof parent.key === 'string') {
    return parent.key;
  }
  return null;
}

function getCustomFields(issue: JiraIssue, config: Config): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name] of Object.entries(config.fieldMap)) {
    const fieldId = getFieldId(config.fieldMap, name);
    if (!fieldId) continue;
    result[name] = issue.fields[fieldId];
  }
  return result;
}

function issueDescriptionMarkdown(issue: JiraIssue): string {
  const description = issue.fields.description;
  if (typeof description === 'string') {
    return description;
  }
  return adfToMarkdown(description as { content?: unknown[] } | null | undefined);
}

function commentItems(issue: JiraIssue): Array<Record<string, unknown>> {
  const comment = issue.fields.comment;
  if (!isRecord(comment) || !Array.isArray(comment.comments)) {
    return [];
  }
  return comment.comments.filter(isRecord);
}

function attachmentItems(issue: JiraIssue): Array<Record<string, unknown>> {
  const attachment = issue.fields.attachment;
  if (!Array.isArray(attachment)) {
    return [];
  }
  return attachment.filter(isRecord);
}

function issueLinkItems(issue: JiraIssue): Array<Record<string, unknown>> {
  const links = issue.fields.issuelinks;
  if (!Array.isArray(links)) {
    return [];
  }
  return links.filter(isRecord);
}

function getStoredUpdatedAt(db: Db, key: string): string | null {
  const story = db.prepare('SELECT source_updated_at AS sourceUpdatedAt FROM stories WHERE key = ?').get(key) as
    | { sourceUpdatedAt: string | null }
    | undefined;
  if (story) return story.sourceUpdatedAt;
  const subtask = db.prepare('SELECT source_updated_at AS sourceUpdatedAt FROM subtasks WHERE key = ?').get(key) as
    | { sourceUpdatedAt: string | null }
    | undefined;
  if (subtask) return subtask.sourceUpdatedAt;
  const bug = db.prepare('SELECT source_updated_at AS sourceUpdatedAt FROM bugs WHERE key = ?').get(key) as
    | { sourceUpdatedAt: string | null }
    | undefined;
  return bug?.sourceUpdatedAt ?? null;
}

function writeAuditBlob(dataDir: string, issue: JiraIssue): void {
  const dir = join(dataDir, 'issues');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${issue.key}.json`), JSON.stringify(issue, null, 2), 'utf8');
}

function upsertStory(db: Db, payload: StoryPayloadRecord, sourceUpdatedAt: string, doneAt: string | null): void {
  db.prepare(
    `INSERT INTO stories (key, issue_id, issue_type, summary, status, payload, synced_at, source_updated_at, done_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
      issue_id = excluded.issue_id,
      issue_type = excluded.issue_type,
      summary = excluded.summary,
      status = excluded.status,
      payload = excluded.payload,
      synced_at = excluded.synced_at,
      source_updated_at = excluded.source_updated_at,
      done_at = excluded.done_at`,
  ).run(
    payload.key,
    payload.id,
    payload.issueType,
    payload.summary,
    payload.status,
    JSON.stringify(payload),
    nowIso(),
    sourceUpdatedAt,
    doneAt,
  );
}

function upsertSubtask(db: Db, issue: JiraIssue, parentKey: string | null): void {
  db.prepare(
    `INSERT INTO subtasks (key, issue_id, parent_key, summary, status, payload, synced_at, source_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
      issue_id = excluded.issue_id,
      parent_key = excluded.parent_key,
      summary = excluded.summary,
      status = excluded.status,
      payload = excluded.payload,
      synced_at = excluded.synced_at,
      source_updated_at = excluded.source_updated_at`,
  ).run(
    issue.key,
    issue.id,
    parentKey,
    getSummary(issue),
    getStatusName(issue),
    JSON.stringify(issue),
    nowIso(),
    getUpdated(issue),
  );
}

function upsertBug(db: Db, issue: JiraIssue): void {
  db.prepare(
    `INSERT INTO bugs (key, issue_id, summary, status, payload, synced_at, source_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
      issue_id = excluded.issue_id,
      summary = excluded.summary,
      status = excluded.status,
      payload = excluded.payload,
      synced_at = excluded.synced_at,
      source_updated_at = excluded.source_updated_at`,
  ).run(
    issue.key,
    issue.id,
    getSummary(issue),
    getStatusName(issue),
    JSON.stringify(issue),
    nowIso(),
    getUpdated(issue),
  );
}

function replaceComments(db: Db, issue: JiraIssue): string {
  const comments = commentItems(issue);
  db.prepare('DELETE FROM comments WHERE issue_key = ?').run(issue.key);
  const allMarkdown: string[] = [];

  const insert = db.prepare(
    `INSERT INTO comments (id, issue_key, author, body, created_at, updated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  comments.forEach((comment, index) => {
    const commentId = typeof comment.id === 'string' ? comment.id : `${issue.key}-comment-${index}`;
    const author = isRecord(comment.author) && typeof comment.author.displayName === 'string'
      ? comment.author.displayName
      : null;
    const bodyMarkdown = adfToMarkdown(comment.body as { content?: unknown[] } | null | undefined);
    const createdAt = typeof comment.created === 'string' ? comment.created : null;
    const updatedAt = typeof comment.updated === 'string' ? comment.updated : createdAt;
    insert.run(commentId, issue.key, author, bodyMarkdown, createdAt, updatedAt, JSON.stringify(comment));
    if (bodyMarkdown) {
      allMarkdown.push(bodyMarkdown);
    }
  });

  return allMarkdown.join('\n');
}

function replaceAttachments(db: Db, issue: JiraIssue): string {
  const attachments = attachmentItems(issue);
  db.prepare('DELETE FROM attachments WHERE issue_key = ?').run(issue.key);
  const names: string[] = [];
  const insert = db.prepare(
    `INSERT INTO attachments (id, issue_key, filename, mime_type, size_bytes, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  attachments.forEach((attachment, index) => {
    const id = typeof attachment.id === 'string' ? attachment.id : `${issue.key}-attachment-${index}`;
    const filename = typeof attachment.filename === 'string' ? attachment.filename : null;
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType : null;
    const sizeBytes = typeof attachment.size === 'number' ? attachment.size : null;
    insert.run(id, issue.key, filename, mimeType, sizeBytes, JSON.stringify(attachment));
    if (filename) {
      names.push(filename);
    }
  });

  return names.join(' ');
}

function replaceRefs(db: Db, issueKey: string, refs: ReturnType<typeof extractTaggedRefs>): void {
  db.prepare('DELETE FROM extracted_refs WHERE issue_key = ?').run(issueKey);
  const insert = db.prepare('INSERT INTO extracted_refs (id, issue_key, url, domain) VALUES (?, ?, ?, ?)');
  const uniqueRefs = refs.filter(
    (ref, index) =>
      refs.findIndex((candidate) => candidate.url === ref.url && candidate.domain === ref.domain) === index,
  );
  uniqueRefs.forEach((ref, index) => {
    insert.run(`${issueKey}-${index}`, issueKey, ref.url, ref.domain);
  });
}

function replaceChangelog(db: Db, issueKey: string, histories: JiraChangelogHistory[]): void {
  db.prepare('DELETE FROM changelog WHERE issue_key = ?').run(issueKey);
  const insert = db.prepare(
    `INSERT INTO changelog (id, issue_key, field, from_value, to_value, changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const history of histories) {
    history.items.forEach((item, index) => {
      insert.run(
        `${issueKey}-${history.id}-${item.field}-${index}`,
        issueKey,
        item.field,
        item.fromString ?? null,
        item.toString ?? null,
        history.created,
      );
    });
  }
}

function computeDoneAt(histories: JiraChangelogHistory[]): string | null {
  let doneAt: string | null = null;
  for (const history of histories) {
    for (const item of history.items) {
      if (item.field.toLowerCase() === 'status' && (item.toString ?? '').toLowerCase().includes('done')) {
        if (!doneAt || new Date(history.created).getTime() > new Date(doneAt).getTime()) {
          doneAt = history.created;
        }
      }
    }
  }
  return doneAt;
}

function updateStorySearch(
  db: Db,
  issue: JiraIssue,
  config: Config,
  description: string,
  commentsMarkdown: string,
  attachmentNames: string,
): void {
  const devNotes = getDeveloperNotes(issue, config);

  db.prepare('DELETE FROM story_search WHERE key = ?').run(issue.key);
  db.prepare(
    'INSERT INTO story_search (key, summary, description, comments, dev_notes, attachment_names) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(issue.key, getSummary(issue), description, commentsMarkdown, devNotes, attachmentNames);
}

function getDeveloperNotes(issue: JiraIssue, config: Config): string {
  const devNotesFieldId = getFieldId(config.fieldMap, 'developerNotes');
  const devNotesValue = devNotesFieldId ? issue.fields[devNotesFieldId] : '';
  if (typeof devNotesValue === 'string') {
    return devNotesValue;
  }
  return adfToMarkdown(devNotesValue as { content?: unknown[] });
}

function getBootstrapJql(config: Config, db: Db): string {
  return (
    config.project.jira.bootstrapJql ??
    getSyncStateValue<string>(db, 'boardFilterJql') ??
    `project = ${quoteJqlValue(config.JIRA_PROJECT_KEY)} ORDER BY Rank ASC`
  );
}

export async function runSync(config: Config, options: SyncRunOptions = {}): Promise<SyncRunResult> {
  if (activeSyncRun) {
    return activeSyncRun;
  }
  activeSyncRun = executeSync(config, options).finally(() => {
    activeSyncRun = null;
  });
  return activeSyncRun;
}

async function executeSync(config: Config, options: SyncRunOptions = {}): Promise<SyncRunResult> {
  const db = getDb(config.TOONED_DATA_DIR);
  const client = createJiraClient(config);
  const startedAt = nowIso();
  const syncState = getSyncStateValue<SyncStateRecord>(db, SYNC_KEY) ?? {
    lastSync: null,
    syncStatus: 'idle',
  };

  setSyncStateValue(db, SYNC_KEY, {
    ...syncState,
    syncStatus: 'syncing',
    lastError: null,
    lastRunStartedAt: startedAt,
  } satisfies SyncStateRecord);

  const bootstrapJql = getBootstrapJql(config, db);
  const fields = STORY_FIELDS(config);
  let bootstrapProcessed = 0;
  let deltaProcessed = 0;
  let parentRefreshCount = 0;
  let linkedBugCount = 0;
  const parentRefreshKeys = new Set<string>();
  const linkedBugKeys = new Set<string>();
  const deltaChangedStoryKeys = new Set<string>();

  try {
    const force = Boolean(options.force);
    const bootstrapComplete = force ? false : (getSyncStateValue<boolean>(db, BOOTSTRAP_COMPLETE_KEY) ?? false);
    const mode: SyncRunResult['mode'] = bootstrapComplete ? 'delta' : 'bootstrap+delta';

    if (!bootstrapComplete) {
      const checkpoint = force
        ? null
        : getSyncStateValue<{ nextPageToken?: string | null }>(db, CHECKPOINT_KEY);
      let nextPageToken = checkpoint?.nextPageToken ?? undefined;

      for (;;) {
        const page = await client.searchIssues({
          jql: bootstrapJql,
          fields,
          nextPageToken,
          maxResults: 50,
        });
        for (const issue of page.issues) {
          await ingestIssue({
            db,
            config,
            issue,
            client,
            mode: 'bootstrap',
            parentRefreshKeys,
            linkedBugKeys,
            changedStoryKeys: deltaChangedStoryKeys,
          });
          bootstrapProcessed += 1;
          writeAuditBlob(config.TOONED_DATA_DIR, issue);
        }

        if (!page.nextPageToken) {
          deleteSyncStateValue(db, CHECKPOINT_KEY);
          setSyncStateValue(db, BOOTSTRAP_COMPLETE_KEY, true);
          break;
        }

        setSyncStateValue(db, CHECKPOINT_KEY, {
          nextPageToken: page.nextPageToken,
          updatedAt: nowIso(),
        });
        nextPageToken = page.nextPageToken;
      }
    }

    const baseLastSync = force ? syncState.lastSync : (getSyncStateValue<string>(db, LAST_SYNC_KEY) ?? syncState.lastSync);
    const deltaSince = baseLastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const deltaJql =
      `project = ${quoteJqlValue(config.JIRA_PROJECT_KEY)} ` +
      `AND issuetype in (${[
        quoteJqlValue(config.project.jira.storyIssueType),
        quoteJqlValue('Sub-task'),
        quoteJqlValue('Bug'),
      ].join(', ')}) ` +
      `AND updated >= ${quoteJqlValue(toJqlTimestamp(deltaSince))} ORDER BY updated ASC`;

    let nextDeltaToken: string | undefined;
    for (;;) {
      const page = await client.searchIssues({
        jql: deltaJql,
        fields,
        nextPageToken: nextDeltaToken,
        maxResults: 50,
      });
      for (const issue of page.issues) {
        await ingestIssue({
          db,
          config,
          issue,
          client,
          mode: 'delta',
          parentRefreshKeys,
          linkedBugKeys,
          changedStoryKeys: deltaChangedStoryKeys,
        });
        deltaProcessed += 1;
        writeAuditBlob(config.TOONED_DATA_DIR, issue);
      }
      if (!page.nextPageToken) {
        break;
      }
      nextDeltaToken = page.nextPageToken;
    }

    for (const parentKey of parentRefreshKeys) {
      const parent = await client.getIssue(parentKey, fields);
      await ingestIssue({
        db,
        config,
        issue: parent,
        client,
        mode: 'delta',
        parentRefreshKeys: new Set<string>(),
        linkedBugKeys,
        changedStoryKeys: deltaChangedStoryKeys,
      });
      parentRefreshCount += 1;
      writeAuditBlob(config.TOONED_DATA_DIR, parent);
    }

    const bugFields = [
      'summary',
      'status',
      'issuetype',
      'updated',
      'comment',
      'attachment',
      'description',
      'issuelinks',
      'parent',
    ];
    for (const bugKey of linkedBugKeys) {
      const bugIssue = await client.getIssue(bugKey, bugFields);
      await ingestIssue({
        db,
        config,
        issue: bugIssue,
        client,
        mode: 'delta',
        parentRefreshKeys: new Set<string>(),
        linkedBugKeys: new Set<string>(),
        changedStoryKeys: deltaChangedStoryKeys,
      });
      linkedBugCount += 1;
      writeAuditBlob(config.TOONED_DATA_DIR, bugIssue);
    }

    const confluenceBootstrapComplete = force
      ? false
      : (getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false);
    if (force || !confluenceBootstrapComplete) {
      await runConfluenceSync(db, config, { force });
    }

    const codeBootstrapComplete = force
      ? false
      : (getSyncStateValue<boolean>(db, CODE_BOOTSTRAP_COMPLETE_KEY) ?? false);
    if (force || !codeBootstrapComplete) {
      await runRepoSync(db, config, { force });
    }

    const completedAt = nowIso();
    if (config.TOONED_ENRICH_ON_SYNC === true && deltaChangedStoryKeys.size > 0) {
      queueStoryEnrichmentOnSync({
        db,
        config,
        storyKeys: [...deltaChangedStoryKeys],
        types: ['implementationHint'],
        onError: (error, storyKey) => {
          const message = error instanceof Error ? error.message : 'Unknown enrichment error';
          console.error(`error: enrichment failed for ${storyKey}: ${message}`);
        },
      });
    }
    setSyncStateValue(db, BOOTSTRAP_JQL_KEY, bootstrapJql);
    setSyncStateValue(db, LAST_SYNC_KEY, completedAt);
    setSyncStateValue(db, SYNC_KEY, {
      lastSync: completedAt,
      syncStatus: 'idle',
      lastError: null,
      lastRunStartedAt: startedAt,
      lastRunFinishedAt: completedAt,
    } satisfies SyncStateRecord);

    return {
      mode,
      bootstrapJql,
      bootstrapProcessed,
      deltaProcessed,
      parentRefreshCount,
      linkedBugCount,
      lastSync: completedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    setSyncStateValue(db, SYNC_KEY, {
      ...syncState,
      syncStatus: 'error',
      lastError: message,
      lastRunStartedAt: startedAt,
      lastRunFinishedAt: nowIso(),
    } satisfies SyncStateRecord);
    throw error;
  }
}

async function ingestIssue(input: {
  db: Db;
  config: Config;
  issue: JiraIssue;
  client: ReturnType<typeof createJiraClient>;
  mode: 'bootstrap' | 'delta';
  parentRefreshKeys: Set<string>;
  linkedBugKeys: Set<string>;
  changedStoryKeys: Set<string>;
}): Promise<void> {
  const issueType = getIssueTypeName(input.issue).toLowerCase();
  const parentKey = getParentKey(input.issue);
  const sourceUpdatedAt = getUpdated(input.issue);
  const isDelta = input.mode === 'delta';
  const storedUpdatedAt = getStoredUpdatedAt(input.db, input.issue.key);
  const shouldRefreshChangelog = !isDelta || storedUpdatedAt !== sourceUpdatedAt;
  let doneAt = null as string | null;
  if (shouldRefreshChangelog) {
    const changelog = await input.client.getChangelog(input.issue.id);
    replaceChangelog(input.db, input.issue.key, changelog);
    doneAt = computeDoneAt(changelog);
  } else {
    const row = input.db.prepare('SELECT done_at AS doneAt FROM stories WHERE key = ?').get(input.issue.key) as
      | { doneAt: string | null }
      | undefined;
    doneAt = row?.doneAt ?? null;
  }

  const description = issueDescriptionMarkdown(input.issue);
  const sections = parseDescriptionSections(description, {
    smePattern: input.config.project.parsing.smePattern
      ? new RegExp(input.config.project.parsing.smePattern, 'gim')
      : undefined,
  });
  const refs = extractTaggedRefs({
    markdown: description,
    adf: input.issue.fields.description as { content?: unknown[] } | null,
    urlDomains: input.config.project.vcs.urlDomains,
  });
  const developerNotes = getDeveloperNotes(input.issue, input.config);
  let storyRefsForEnrichment: ReturnType<typeof extractTaggedRefs> = [];
  let shouldEnrichStoryCommits = false;

  input.db.exec('BEGIN');
  try {
    const commentsMarkdown = replaceComments(input.db, input.issue);
    const attachmentNames = replaceAttachments(input.db, input.issue);
    const enrichedRefs = extractTaggedRefs({
      markdown: `${description}\n${commentsMarkdown}`,
      adf: input.issue.fields.description as { content?: unknown[] } | null,
      urlDomains: input.config.project.vcs.urlDomains,
    });
    const combinedRefs = [...refs, ...enrichedRefs];
    replaceRefs(input.db, input.issue.key, combinedRefs);
    if (issueType === input.config.project.jira.storyIssueType.toLowerCase() || issueType === 'story') {
      shouldEnrichStoryCommits = true;
      storyRefsForEnrichment = combinedRefs;
      updateStorySearch(input.db, input.issue, input.config, description, commentsMarkdown, attachmentNames);
      upsertStory(
        input.db,
        {
          key: input.issue.key,
          id: input.issue.id,
          issueType: getIssueTypeName(input.issue),
          summary: getSummary(input.issue),
          status: getStatusName(input.issue),
          description,
          sections,
          customFields: getCustomFields(input.issue, input.config),
          assignee: getAssignee(input.issue),
          timeSpentSeconds: getTimeSpentSeconds(input.issue),
        },
        sourceUpdatedAt,
        doneAt,
      );
      if (input.mode === 'delta') {
        input.changedStoryKeys.add(input.issue.key);
      }
    } else if (issueType === 'sub-task' || issueType === 'subtask') {
      upsertSubtask(input.db, input.issue, parentKey);
      if (parentKey && input.mode === 'delta') {
        input.parentRefreshKeys.add(parentKey);
      }
    } else if (issueType === 'bug') {
      upsertBug(input.db, input.issue);
    }

    const linkInsert = input.db.prepare(
      'INSERT OR REPLACE INTO linked_issues (id, source_key, target_key, link_type) VALUES (?, ?, ?, ?)',
    );
    for (const link of issueLinkItems(input.issue)) {
      const target =
        (isRecord(link.outwardIssue) && typeof link.outwardIssue.key === 'string' && link.outwardIssue.key) ||
        (isRecord(link.inwardIssue) && typeof link.inwardIssue.key === 'string' && link.inwardIssue.key) ||
        null;
      const linkType = isRecord(link.type) && typeof link.type.name === 'string' ? link.type.name : 'linked';
      if (!target) continue;
      linkInsert.run(`${input.issue.key}-${target}`, input.issue.key, target, linkType);
      const linkedIssueTypeName =
        (isRecord(link.outwardIssue) &&
          isRecord(link.outwardIssue.fields) &&
          isRecord(link.outwardIssue.fields.issuetype) &&
          typeof link.outwardIssue.fields.issuetype.name === 'string' &&
          link.outwardIssue.fields.issuetype.name) ||
        (isRecord(link.inwardIssue) &&
          isRecord(link.inwardIssue.fields) &&
          isRecord(link.inwardIssue.fields.issuetype) &&
          typeof link.inwardIssue.fields.issuetype.name === 'string' &&
          link.inwardIssue.fields.issuetype.name) ||
        '';
      if (linkType.toLowerCase().includes('bug') || linkedIssueTypeName.toLowerCase() === 'bug') {
        input.linkedBugKeys.add(target);
      }
    }
    input.db.exec('COMMIT');
  } catch (error) {
    input.db.exec('ROLLBACK');
    throw error;
  }

  if (shouldEnrichStoryCommits) {
    await enrichStoryCommits({
      db: input.db,
      config: input.config,
      issueKey: input.issue.key,
      refs: storyRefsForEnrichment,
      developerNotes,
    });
  }
}
