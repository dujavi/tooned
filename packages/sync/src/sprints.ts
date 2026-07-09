import { getFieldId, type Config } from '@tooned/core';
import type { Db } from './db.js';

interface StoryPayloadRecord {
  description?: string;
  customFields?: Record<string, unknown>;
  sections?: {
    acceptanceCriteria?: string[];
    sme?: string;
  };
  assignee?: string | null;
  timeSpentSeconds?: number | null;
}

interface StoryBaseRow {
  key: string;
  summary: string | null;
  status: string | null;
  syncedAt: string | null;
  sourceUpdatedAt: string | null;
  doneAt: string | null;
  payload: string | null;
}

interface SubtaskRow {
  parentKey: string | null;
  payload: string | null;
}

export interface SprintRef {
  id: number | null;
  name: string | null;
  state: string | null;
}

export interface SprintStory {
  key: string;
  summary: string;
  status: string;
  syncedAt: string | null;
  sourceUpdatedAt: string | null;
  doneAt: string | null;
  payload: StoryPayloadRecord | null;
  sprintRefs: SprintRef[];
  isBacklog: boolean;
  subtaskCount: number;
  assignees: string[];
  timeSpentSeconds: number;
  storyPoints: number | null;
}

interface StoryStats {
  subtaskCount: number;
  timeSpentSeconds: number;
  assignees: Set<string>;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseSprintObject(value: unknown): SprintRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = parseNumber(value.id);
  const name = typeof value.name === 'string' ? value.name : null;
  const state = typeof value.state === 'string' ? value.state : null;
  if (id === null && !name) {
    return null;
  }
  return {
    id: id === null ? null : Math.trunc(id),
    name,
    state,
  };
}

function parseLegacySprintString(value: string): SprintRef[] {
  const parsed: SprintRef[] = [];
  const entryRegex = /\[([^\]]+)\]/g;
  let entryMatch: RegExpExecArray | null = entryRegex.exec(value);
  while (entryMatch) {
    const segment = entryMatch[1];
    if (segment) {
      const idMatch = /id=(\d+)/.exec(segment);
      const nameMatch = /name=([^,]+)/.exec(segment);
      const stateMatch = /state=([^,]+)/.exec(segment);
      const parsedId = idMatch?.[1] ? Number.parseInt(idMatch[1], 10) : null;
      parsed.push({
        id: parsedId,
        name: nameMatch?.[1]?.trim() ?? null,
        state: stateMatch?.[1]?.trim() ?? null,
      });
    }
    entryMatch = entryRegex.exec(value);
  }
  if (parsed.length > 0) {
    return parsed;
  }
  return [
    {
      id: null,
      name: value,
      state: null,
    },
  ];
}

export function extractSprintRefs(rawSprintValue: unknown): SprintRef[] {
  const refs: SprintRef[] = [];
  const pushRef = (ref: SprintRef | null) => {
    if (!ref) {
      return;
    }
    const duplicate = refs.some(
      (item) =>
        item.id === ref.id &&
        (item.name ?? '').toLowerCase() === (ref.name ?? '').toLowerCase(),
    );
    if (!duplicate) {
      refs.push(ref);
    }
  };

  if (Array.isArray(rawSprintValue)) {
    for (const item of rawSprintValue) {
      if (typeof item === 'string') {
        for (const parsed of parseLegacySprintString(item)) {
          pushRef(parsed);
        }
      } else {
        pushRef(parseSprintObject(item));
      }
    }
    return refs;
  }

  if (typeof rawSprintValue === 'string') {
    for (const parsed of parseLegacySprintString(rawSprintValue)) {
      pushRef(parsed);
    }
    return refs;
  }

  pushRef(parseSprintObject(rawSprintValue));
  return refs;
}

function selectSprintFieldValue(
  customFields: Record<string, unknown> | undefined,
  config: Config,
): unknown {
  if (!customFields) {
    return undefined;
  }
  const sprintFieldId = getFieldId(config.fieldMap, 'sprint');
  const candidates: unknown[] = [customFields.sprint];
  if (sprintFieldId) {
    candidates.push(customFields[sprintFieldId]);
    if (sprintFieldId.startsWith('customfield_')) {
      candidates.push(customFields[sprintFieldId.replace('customfield_', '')]);
    }
  }
  return candidates.find((value) => value !== undefined);
}

function parseAssignee(rawPayload: unknown): string | null {
  if (!isRecord(rawPayload) || !isRecord(rawPayload.fields)) {
    return null;
  }
  const assignee = rawPayload.fields.assignee;
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

function parseTimeSpent(rawPayload: unknown): number {
  if (!isRecord(rawPayload) || !isRecord(rawPayload.fields)) {
    return 0;
  }
  const value = parseNumber(rawPayload.fields.timespent);
  return value === null ? 0 : Math.max(Math.trunc(value), 0);
}

function listStoryRows(db: Db): StoryBaseRow[] {
  return db
    .prepare(
      `SELECT key, summary, status, synced_at AS syncedAt, source_updated_at AS sourceUpdatedAt, done_at AS doneAt, payload
       FROM stories
       ORDER BY key ASC`,
    )
    .all() as unknown as StoryBaseRow[];
}

function buildSubtaskStats(db: Db, storyKeys: string[]): Map<string, StoryStats> {
  const stats = new Map<string, StoryStats>();
  for (const key of storyKeys) {
    stats.set(key, {
      subtaskCount: 0,
      timeSpentSeconds: 0,
      assignees: new Set<string>(),
    });
  }
  if (storyKeys.length === 0) {
    return stats;
  }

  const placeholders = storyKeys.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT parent_key AS parentKey, payload
       FROM subtasks
       WHERE parent_key IN (${placeholders})`,
    )
    .all(...storyKeys) as unknown as SubtaskRow[];

  for (const row of rows) {
    if (!row.parentKey) {
      continue;
    }
    const parentStats = stats.get(row.parentKey);
    if (!parentStats) {
      continue;
    }
    parentStats.subtaskCount += 1;
    const payload = safeJsonParse<unknown>(row.payload);
    parentStats.timeSpentSeconds += parseTimeSpent(payload);
    const assignee = parseAssignee(payload);
    if (assignee) {
      parentStats.assignees.add(assignee);
    }
  }

  return stats;
}

function getStoryPoints(payload: StoryPayloadRecord | null): number | null {
  if (!payload?.customFields) {
    return null;
  }
  const parsed = parseNumber(payload.customFields.storyPoints);
  return parsed === null ? null : parsed;
}

function hydrateStories(rows: StoryBaseRow[], db: Db, config: Config): SprintStory[] {
  const storyKeys = rows.map((row) => row.key);
  const subtaskStats = buildSubtaskStats(db, storyKeys);

  return rows.map((row) => {
    const payload = safeJsonParse<StoryPayloadRecord>(row.payload);
    const sprintValue = selectSprintFieldValue(payload?.customFields, config);
    const sprintRefs = extractSprintRefs(sprintValue);
    const isBacklog = sprintRefs.length === 0;
    const stats = subtaskStats.get(row.key) ?? {
      subtaskCount: 0,
      timeSpentSeconds: 0,
      assignees: new Set<string>(),
    };
    const assignees = new Set<string>(stats.assignees);
    if (payload?.assignee) {
      assignees.add(payload.assignee);
    }

    return {
      key: row.key,
      summary: row.summary ?? '',
      status: row.status ?? '',
      syncedAt: row.syncedAt,
      sourceUpdatedAt: row.sourceUpdatedAt,
      doneAt: row.doneAt,
      payload,
      sprintRefs,
      isBacklog,
      subtaskCount: stats.subtaskCount,
      assignees: [...assignees],
      timeSpentSeconds: stats.timeSpentSeconds + Math.max(Math.trunc(payload?.timeSpentSeconds ?? 0), 0),
      storyPoints: getStoryPoints(payload),
    };
  });
}

export function listStoriesForSprint(
  sprintId: number,
  db: Db,
  config: Config,
  sprintName?: string,
): SprintStory[] {
  const stories = hydrateStories(listStoryRows(db), db, config);
  const normalizedName = sprintName?.trim().toLowerCase();
  return stories.filter((story) =>
    story.sprintRefs.some((ref) => {
      if (ref.id === sprintId) {
        return true;
      }
      if (!normalizedName) {
        return false;
      }
      return (ref.name ?? '').trim().toLowerCase() === normalizedName;
    }),
  );
}

export function listBacklogStories(db: Db, _boardId: number, config: Config): SprintStory[] {
  const stories = hydrateStories(listStoryRows(db), db, config);
  return stories.filter((story) => story.isBacklog);
}
