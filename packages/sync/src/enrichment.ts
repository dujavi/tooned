import { createHash } from 'node:crypto';
import { completeEnrichment, createEnrichmentProvider, type EnrichmentProvider } from '@tooned/enrich';
import type { Config } from '@tooned/core';
import {
  getStoryByKey,
  getStoryHistory,
  getStoryComments,
  getStoryEnrichment,
  upsertStoryEnrichment,
  listStoryEnrichments,
  type Db,
  type EnrichmentType,
} from './db.js';

export const SUPPORTED_ENRICHMENT_TYPES: EnrichmentType[] = [
  'brief',
  'commentDigest',
  'implementationHint',
  'changeDelta',
];

function safeParsePayload(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function computeStoryContentHash(input: {
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  developerNotes: string;
  comments: Array<{ id: string; createdAt: string | null; updatedAt: string | null }>;
}): string {
  const hash = createHash('sha256');
  hash.update(input.summary);
  hash.update('\n');
  hash.update(input.description);
  hash.update('\n');
  hash.update(input.acceptanceCriteria.join('\n'));
  hash.update('\n');
  hash.update(input.developerNotes);
  hash.update('\n');
  for (const comment of input.comments) {
    hash.update(`${comment.id}|${comment.createdAt ?? ''}|${comment.updatedAt ?? ''}\n`);
  }
  return hash.digest('hex');
}

function getDeveloperNotes(db: Db, key: string): string {
  const row = db.prepare('SELECT dev_notes AS devNotes FROM story_search WHERE key = ?').get(key) as
    | { devNotes: string | null }
    | undefined;
  return row?.devNotes ?? '';
}

function storyPromptInput(db: Db, key: string, since?: string): {
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  developerNotes: string;
  comments: Array<{ id: string; createdAt: string | null; updatedAt: string | null; body: string }>;
  changelog: Array<{ field: string | null; fromValue: string | null; toValue: string | null; changedAt: string | null }>;
  contentHash: string;
} {
  const story = getStoryByKey(db, key);
  if (!story) {
    throw new Error(`Story not found: ${key}`);
  }
  const payload = safeParsePayload(story.payload);
  const sections = (payload?.sections as Record<string, unknown> | undefined) ?? {};
  const comments = getStoryComments(db, key).map((comment) => ({
    id: comment.id,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    body: comment.body ?? '',
  }));
  const acceptanceCriteria = asStringArray(sections.acceptanceCriteria);
  const developerNotes = getDeveloperNotes(db, key);

  return {
    summary: story.summary ?? '',
    description: asString(payload?.description),
    acceptanceCriteria,
    developerNotes,
    comments,
    changelog: getStoryHistory(db, key, since),
    contentHash: computeStoryContentHash({
      summary: story.summary ?? '',
      description: asString(payload?.description),
      acceptanceCriteria,
      developerNotes,
      comments: comments.map((comment) => ({
        id: comment.id,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
    }),
  };
}

function uniqueTypes(types: EnrichmentType[]): EnrichmentType[] {
  return [...new Set(types.filter((item) => SUPPORTED_ENRICHMENT_TYPES.includes(item)))];
}

export async function enrichStory(input: {
  db: Db;
  config: Config;
  key: string;
  types: EnrichmentType[];
  force?: boolean;
  since?: string;
  provider?: EnrichmentProvider;
}): Promise<{
  key: string;
  contentHash: string;
  generated: EnrichmentType[];
  cached: EnrichmentType[];
  enrichments: Partial<Record<EnrichmentType, string>>;
}> {
  const requestedTypes = uniqueTypes(input.types);
  const promptInput = storyPromptInput(input.db, input.key, input.since);
  const provider = input.provider ?? createEnrichmentProvider(input.config);

  const enrichments: Partial<Record<EnrichmentType, string>> = {};
  const generated: EnrichmentType[] = [];
  const cached: EnrichmentType[] = [];

  for (const type of requestedTypes) {
    const existing = getStoryEnrichment(input.db, input.key, type);
    if (!input.force && existing && existing.contentHash === promptInput.contentHash) {
      enrichments[type] = existing.content;
      cached.push(type);
      continue;
    }

    const content = await completeEnrichment({
      provider,
      type,
      promptInput: {
        key: input.key,
        summary: promptInput.summary,
        description: promptInput.description,
        acceptanceCriteria: promptInput.acceptanceCriteria,
        developerNotes: promptInput.developerNotes,
        comments: promptInput.comments,
        changelog: promptInput.changelog,
        since: input.since,
      },
    });
    if (!content.trim()) {
      continue;
    }
    enrichments[type] = content;
    upsertStoryEnrichment(input.db, {
      storyKey: input.key,
      type,
      contentHash: promptInput.contentHash,
      content,
      createdAt: new Date().toISOString(),
    });
    generated.push(type);
  }

  return {
    key: input.key,
    contentHash: promptInput.contentHash,
    generated,
    cached,
    enrichments,
  };
}

export function getStorySummary(db: Db, key: string): Partial<Record<EnrichmentType, string>> {
  const rows = listStoryEnrichments(db, key, ['brief', 'implementationHint', 'commentDigest', 'changeDelta']);
  const summary: Partial<Record<EnrichmentType, string>> = {};
  for (const row of rows) {
    summary[row.type] = row.content;
  }
  return summary;
}

export function queueStoryEnrichmentOnSync(input: {
  db: Db;
  config: Config;
  storyKeys: string[];
  types?: EnrichmentType[];
  onError?: (error: unknown, storyKey: string) => void;
}): void {
  const types = uniqueTypes(input.types ?? ['implementationHint']);
  for (const storyKey of new Set(input.storyKeys)) {
    void Promise.resolve()
      .then(() =>
        enrichStory({
          db: input.db,
          config: input.config,
          key: storyKey,
          types,
          force: false,
        }),
      )
      .catch((error) => {
        input.onError?.(error, storyKey);
      });
  }
}
