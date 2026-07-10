import { Hono } from 'hono';
import { buildSyncMeta, computeSizing, getFieldId, type Config, type SyncStatus } from '@tooned/core';
import { isLlmConfigured } from '@tooned/enrich';
import { createJiraClient, getBacklogIssues, resolveCurrentSprint, resolveNextSprint } from '@tooned/jira';
import {
  getDb,
  getStoryByKey,
  getStoryComments,
  getStoryCommits,
  getStoryHistory,
  getStoryRefs,
  getStoryChildren,
  listStoriesWithMetrics,
  listBacklogStories,
  listStoriesForSprint,
  getSyncStateValue,
  getStorySummary,
  enrichStory,
  listEnrichmentsForStories,
  runSync,
  searchRefs,
  searchStories,
  searchPages,
  searchGlobal,
  searchCodeStub,
  getPageById,
  listPages,
  getConfluencePageCount,
  CONFLUENCE_BOOTSTRAP_COMPLETE_KEY,
  CONFLUENCE_LAST_SYNC_KEY,
  SUPPORTED_ENRICHMENT_TYPES,
  type SprintStory,
  type EnrichmentType,
} from '@tooned/sync';
import { buildReviewPack, computeWorkload } from './sprint-review.js';

interface SyncStateRecord {
  lastSync?: string | null;
  syncStatus?: SyncStatus;
}

function getSyncMeta(config: Config) {
  const db = getDb(config.TOONED_DATA_DIR);
  const syncState = getSyncStateValue<SyncStateRecord>(db, 'sync') ?? {};
  return buildSyncMeta(syncState.lastSync ?? null, syncState.syncStatus ?? 'idle');
}

function getIndexMeta(config: Config) {
  const db = getDb(config.TOONED_DATA_DIR);
  return {
    syncMeta: getSyncMeta(config),
    pageCount: getConfluencePageCount(db),
    confluenceBootstrapComplete:
      getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false,
    confluenceLastSync: getSyncStateValue<string>(db, CONFLUENCE_LAST_SYNC_KEY) ?? null,
  };
}

type SearchScope = 'all' | 'stories' | 'docs' | 'code' | 'comments' | 'notes';

function parseSearchScope(raw: string | undefined): SearchScope {
  if (
    raw === 'stories' ||
    raw === 'docs' ||
    raw === 'code' ||
    raw === 'comments' ||
    raw === 'notes'
  ) {
    return raw;
  }
  return 'all';
}

function parseLimit(raw: string | undefined, defaultValue: number, maxValue: number): number {
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function parseOffset(raw: string | undefined, defaultValue: number, maxValue: number): number {
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function mapSprintStory(story: SprintStory) {
  return {
    key: story.key,
    summary: story.summary,
    status: story.status,
    doneAt: story.doneAt,
    storyPoints: story.storyPoints,
    subtaskCount: story.subtaskCount,
    assignees: story.assignees,
    timeSpentSeconds: story.timeSpentSeconds,
    sprintRefs: story.sprintRefs,
    isBacklog: story.isBacklog,
  };
}

function parseStorySearchScope(scope: SearchScope): 'all' | 'comments' | 'notes' {
  if (scope === 'comments' || scope === 'notes') {
    return scope;
  }
  return 'all';
}

function parseEnrichmentTypes(raw: string | undefined): EnrichmentType[] {
  if (!raw) {
    return ['brief', 'implementationHint'];
  }
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is EnrichmentType =>
      SUPPORTED_ENRICHMENT_TYPES.includes(item as EnrichmentType),
    );
  return items.length > 0 ? [...new Set(items)] : ['brief', 'implementationHint'];
}

function buildSearchExpression(query: string, scope: 'all' | 'comments' | 'notes'): string {
  if (scope === 'comments') {
    return `comments:${query}`;
  }
  if (scope === 'notes') {
    return `dev_notes:${query}`;
  }
  return query;
}

export function createApp(config: Config) {
  const app = new Hono();
  const jira = createJiraClient(config);

  app.get('/health', (c) => {
    return c.json({
      ok: true,
      syncMeta: getSyncMeta(config),
    });
  });

  app.post('/sync', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { force?: boolean };
    const result = await runSync(config, { force: Boolean(body.force) });
    return c.json({
      ok: true,
      syncMeta: getSyncMeta(config),
      result,
    });
  });

  app.get('/sync/status', (c) =>
    c.json({
      ok: true,
      syncMeta: getSyncMeta(config),
    }),
  );

  app.get('/stories', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const limit = parseLimit(c.req.query('limit'), 20, 100);
    const offset = parseOffset(c.req.query('offset'), 0, 10_000);
    const status = c.req.query('status');
    const assignee = c.req.query('assignee');
    const sprint = c.req.query('sprint');
    const { stories, total } = listStoriesWithMetrics(
      db,
      {
        status: status || undefined,
        assignee: assignee || undefined,
        sprint: sprint || undefined,
      },
      limit,
      offset,
    );

    return c.json({
      syncMeta: getSyncMeta(config),
      count: stories.length,
      total,
      stories,
    });
  });

  app.get('/stories/:key', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    const children = getStoryChildren(db, key);
    return c.json({
      syncMeta: getSyncMeta(config),
      story: {
        ...story,
        payload: story.payload ? JSON.parse(story.payload) : null,
        subtasks: children.subtasks.map((item) => ({
          ...item,
          payload: item.payload ? JSON.parse(item.payload) : null,
        })),
        bugs: children.bugs.map((item) => ({
          ...item,
          payload: item.payload ? JSON.parse(item.payload) : null,
        })),
        comments: children.comments,
        refs: children.refs,
      },
    });
  });

  app.get('/stories/:key/commits', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    const commits = getStoryCommits(db, key);
    return c.json({
      syncMeta: getSyncMeta(config),
      key,
      commits,
    });
  });

  app.get('/search', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const query = (c.req.query('q') ?? '').trim();
    if (!query) {
      return c.json(
        {
          error: 'q query parameter is required',
          ...getIndexMeta(config),
        },
        400,
      );
    }

    const limit = parseLimit(c.req.query('limit'), 20, 100);
    const scope = parseSearchScope(c.req.query('in'));
    const status = c.req.query('status') || undefined;
    const sprint = c.req.query('sprint') || undefined;
    const since = c.req.query('since') || undefined;
    const meta = getIndexMeta(config);

    if (scope === 'code') {
      const codeResult = searchCodeStub();
      return c.json({
        ...meta,
        query,
        scope,
        count: 0,
        results: codeResult.results,
        codeSearchStatus: codeResult.codeSearchStatus,
        help: codeResult.help,
      });
    }

    if (scope === 'docs') {
      const results = searchPages(db, query, limit);
      return c.json({
        ...meta,
        query,
        scope,
        count: results.length,
        results: results.map((row) => ({
          source: 'doc',
          pageId: row.pageId,
          title: row.title,
          spaceKey: row.spaceKey,
          url: row.url,
          sourceUpdatedAt: row.sourceUpdatedAt,
          excerpt: row.excerpt,
        })),
      });
    }

    if (scope === 'all') {
      const globalResult = searchGlobal(db, query, limit, { status, sprint, since });
      return c.json({
        ...meta,
        query,
        scope,
        count: globalResult.results.length,
        results: globalResult.results,
      });
    }

    const storyScope = parseStorySearchScope(scope);
    const storyResults =
      scope === 'stories'
        ? searchStories(db, query, limit, { status, sprint, since })
        : searchStories(db, buildSearchExpression(query, storyScope), limit, {
            in: storyScope,
            status,
            sprint,
            since,
          });

    return c.json({
      ...meta,
      query,
      scope,
      count: storyResults.length,
      results: storyResults.map((row) => ({
        source: 'story',
        key: row.key,
        title: row.summary ?? row.key,
        summary: row.summary,
        status: row.status,
        sourceUpdatedAt: row.sourceUpdatedAt,
        comments: row.comments,
        subtasks: row.subtasks,
        prs: row.prs,
      })),
    });
  });

  app.get('/pages/search', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const query = (c.req.query('q') ?? '').trim();
    if (!query) {
      return c.json(
        {
          error: 'q query parameter is required',
          ...getIndexMeta(config),
        },
        400,
      );
    }

    const limit = parseLimit(c.req.query('limit'), 20, 100);
    const results = searchPages(db, query, limit);
    return c.json({
      ...getIndexMeta(config),
      query,
      count: results.length,
      results,
    });
  });

  app.get('/pages/:id', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const page = getPageById(db, c.req.param('id'));
    if (!page) {
      return c.json(
        {
          error: `Page not found: ${c.req.param('id')}`,
          ...getIndexMeta(config),
        },
        404,
      );
    }

    let labels: string[] = [];
    if (page.labelsJson) {
      try {
        const parsed = JSON.parse(page.labelsJson) as unknown;
        if (Array.isArray(parsed)) {
          labels = parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        labels = [];
      }
    }

    const refs = db
      .prepare(
        'SELECT id, issue_key AS issueKey, url, domain FROM page_refs WHERE page_id = ? ORDER BY id ASC',
      )
      .all(page.pageId) as Array<{ id: string; issueKey: string | null; url: string | null; domain: string | null }>;

    return c.json({
      ...getIndexMeta(config),
      page: {
        pageId: page.pageId,
        title: page.title,
        spaceKey: page.spaceKey,
        url: page.url,
        labels,
        ancestorTitles: page.ancestorTitles,
        version: page.version,
        sourceUpdatedAt: page.sourceUpdatedAt,
        syncedAt: page.syncedAt,
        excerpt: (page.bodyMd ?? '').slice(0, 500),
        bodyMd: page.bodyMd,
        bodySize: (page.bodyMd ?? '').length,
        refs,
      },
    });
  });

  app.get('/pages', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const limit = parseLimit(c.req.query('limit'), 20, 100);
    const space = c.req.query('space') || undefined;
    const pages = listPages(db, { space, limit });
    return c.json({
      ...getIndexMeta(config),
      count: pages.length,
      pages: pages.map((page) => ({
        pageId: page.pageId,
        title: page.title,
        spaceKey: page.spaceKey,
        url: page.url,
        sourceUpdatedAt: page.sourceUpdatedAt,
      })),
    });
  });

  app.get('/stories/:key/refs', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    return c.json({
      syncMeta: getSyncMeta(config),
      key,
      refs: getStoryRefs(db, key),
    });
  });

  app.get('/stories/:key/history', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const since = c.req.query('since') || undefined;
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    const history = getStoryHistory(db, key, since);
    return c.json({
      syncMeta: getSyncMeta(config),
      key,
      count: history.length,
      history,
    });
  });

  app.get('/stories/:key/sizing', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    const payload = story.payload ? JSON.parse(story.payload) as Record<string, unknown> : null;
    const customFields = (payload?.customFields ?? {}) as Record<string, unknown>;
    const storyPointsFieldId = getFieldId(config.fieldMap, 'storyPoints');
    const teamFieldId = getFieldId(config.fieldMap, 'team');
    const storyPoints = customFields.storyPoints ?? (storyPointsFieldId ? customFields[storyPointsFieldId] : null);
    const team = customFields.team ?? (teamFieldId ? customFields[teamFieldId] : null);
    const subtasks = getStoryChildren(db, key).subtasks;
    const comments = getStoryComments(db, key);

    const sizing = computeSizing({
      story: {
        description: (payload?.description as string | undefined) ?? '',
        comments: comments.map((comment) => comment.body ?? ''),
        storyPoints: typeof storyPoints === 'number' || typeof storyPoints === 'string' ? storyPoints : null,
        team: typeof team === 'string' ? team : null,
      },
      subtasks,
      dodTemplates: config.dodTemplates,
    });

    return c.json({
      syncMeta: getSyncMeta(config),
      key,
      sizing,
    });
  });

  app.post('/stories/:key/enrich', async (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    const force = parseBoolean(c.req.query('force'), false);
    const types = parseEnrichmentTypes(c.req.query('types'));
    const since = c.req.query('since') || undefined;
    if (!isLlmConfigured(config)) {
      return c.json(
        {
          error: 'LLM enrichment unavailable. Set LLM_API_KEY and LLM_MODEL, or use agent-only reasoning.',
          syncMeta: getSyncMeta(config),
        },
        412,
      );
    }
    const result = await enrichStory({
      db,
      config,
      key,
      types,
      force,
      since,
    });
    return c.json({
      syncMeta: getSyncMeta(config),
      key,
      force,
      types,
      generated: result.generated,
      cached: result.cached,
      contentHash: result.contentHash,
      enrichments: result.enrichments,
    });
  });

  app.get('/stories/:key/summary', async (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const key = c.req.param('key');
    const story = getStoryByKey(db, key);
    if (!story) {
      return c.json(
        {
          error: `Story not found: ${key}`,
          syncMeta: getSyncMeta(config),
        },
        404,
      );
    }

    const force = parseBoolean(c.req.query('force'), false);
    const includeComments = parseBoolean(c.req.query('comments'), false);
    const since = c.req.query('since') || undefined;
    const types: EnrichmentType[] = ['brief', 'implementationHint'];
    if (includeComments) {
      types.push('commentDigest');
    }
    if (since) {
      types.push('changeDelta');
    }

    if (!isLlmConfigured(config)) {
      return c.json(
        {
          error: 'LLM enrichment unavailable. Set LLM_API_KEY and LLM_MODEL, or use agent-only reasoning.',
          syncMeta: getSyncMeta(config),
        },
        412,
      );
    }
    const result = await enrichStory({
      db,
      config,
      key,
      types,
      force,
      since,
    });
    return c.json({
      syncMeta: getSyncMeta(config),
      key,
      force,
      since,
      summary: {
        ...getStorySummary(db, key),
        ...result.enrichments,
      },
      generated: result.generated,
      cached: result.cached,
    });
  });

  app.get('/refs/search', (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const query = (c.req.query('q') ?? '').trim();
    if (!query) {
      return c.json(
        {
          error: 'q query parameter is required',
          syncMeta: getSyncMeta(config),
        },
        400,
      );
    }

    const limit = parseLimit(c.req.query('limit'), 20, 100);
    const refs = searchRefs(db, query, limit);
    return c.json({
      syncMeta: getSyncMeta(config),
      query,
      refs,
    });
  });

  app.get('/sprints/current', async (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const includeWorkload = parseBoolean(c.req.query('workload'), false);

    const sprint = await resolveCurrentSprint(jira, config.ATLASSIAN_BOARD_ID);
    if (!sprint) {
      return c.json({
        syncMeta: getSyncMeta(config),
        sprint: null,
        stories: [],
        workload: includeWorkload ? computeWorkload([]) : undefined,
        emptyState: 'No active sprint found for board',
      });
    }

    const stories = listStoriesForSprint(sprint.id, db, config, sprint.name);
    return c.json({
      syncMeta: getSyncMeta(config),
      sprint,
      stories: stories.map(mapSprintStory),
      workload: includeWorkload ? computeWorkload(stories) : undefined,
    });
  });

  app.get('/sprints/next', async (c) => {
    const db = getDb(config.TOONED_DATA_DIR);
    const includeReviewPack = parseBoolean(c.req.query('reviewPack'), false);
    const includeBacklog = parseBoolean(c.req.query('includeBacklog'), false);
    const includeEnriched = parseBoolean(c.req.query('enriched'), false);

    const sprint = await resolveNextSprint(jira, config.ATLASSIAN_BOARD_ID);
    const sprintStories = sprint ? listStoriesForSprint(sprint.id, db, config, sprint.name) : [];
    let backlogStories: SprintStory[] = [];

    if (includeBacklog) {
      backlogStories = listBacklogStories(db, config.ATLASSIAN_BOARD_ID, config);
      const backlogIssues = await getBacklogIssues(jira, config.ATLASSIAN_BOARD_ID);
      const backlogIssueKeys = new Set(backlogIssues.map((issue) => issue.key));
      if (backlogIssueKeys.size > 0) {
        backlogStories = backlogStories.filter((story) => backlogIssueKeys.has(story.key));
      }
    }

    const storiesForReview = includeBacklog ? [...sprintStories, ...backlogStories] : sprintStories;
    const implementationHintsByKey: Partial<Record<string, { implementationHint?: string }>> = {};
    if (includeReviewPack && includeEnriched) {
      const enrichments = listEnrichmentsForStories(
        db,
        storiesForReview.map((story) => story.key),
        'implementationHint',
      );
      for (const item of enrichments) {
        implementationHintsByKey[item.storyKey] = { implementationHint: item.content };
      }
    }
    return c.json({
      syncMeta: getSyncMeta(config),
      sprint,
      stories: sprintStories.map(mapSprintStory),
      backlogStories: includeBacklog ? backlogStories.map(mapSprintStory) : undefined,
      reviewPack: includeReviewPack ? buildReviewPack(storiesForReview, implementationHintsByKey) : undefined,
      emptyState: sprint ? null : 'No future sprint found for board',
    });
  });

  return app;
}
