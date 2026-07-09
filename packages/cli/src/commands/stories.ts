import { projectStoryList } from '@tooned/core';
import {
  fetchStories,
  fetchStory,
  fetchStoryCommits,
  fetchStoryHistory,
  fetchStoryRefs,
  fetchStorySummary,
  fetchStorySizing,
} from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError, maybeTruncate, parseFields, pickFields } from './shared.js';

export async function runStoriesList(options: {
  status?: string;
  assignee?: string;
  sprint?: string;
  limit?: number;
  fields?: string;
}): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const result = await fetchStories(config, options);
    const fields = parseFields(options.fields);
    const stories = result.stories.map((story) =>
      pickFields(
        {
          key: story.key,
          summary: story.summary ?? '',
          status: story.status ?? '',
          comments: story.comments,
          subtasks: story.subtasks,
          prs: story.prs,
        },
        fields,
      ),
    );
    console.log(
      formatToon(result.syncMeta, {
        ...projectStoryList({
          stories: stories as Array<{ key: string; summary: string; status: string; comments?: number; subtasks?: number; prs?: number }>,
          count: result.count,
          total: result.total,
        }),
        help: [
          'Run `tooned stories view <KEY>` for details',
          result.count < result.total ? `Run \`tooned stories list --limit ${result.total}\` for all ${result.total} items` : '',
        ].filter(Boolean),
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesView(
  key: string,
  options: { full: boolean; fields?: string },
): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const result = await fetchStory(config, key);
    const payload = result.story.payload as { description?: string; sections?: Record<string, unknown> } | null;
    const description = maybeTruncate(payload?.description ?? '', options.full);
    const fields = parseFields(options.fields);
    const view = pickFields(
      {
        key: result.story.key,
        summary: result.story.summary ?? '',
        status: result.story.status ?? '',
        description: description.value,
        descriptionSize: description.size,
        descriptionTruncated: description.truncated,
        subtasks: result.story.subtasks.length,
        comments: result.story.comments.length,
        refs: result.story.refs.length,
        bugs: result.story.bugs.length,
        sections: payload?.sections ?? {},
      },
      fields,
    );
    console.log(
      formatToon(result.syncMeta, {
        story: view,
        help: description.truncated
          ? ['Run `tooned stories view <KEY> --full` to view complete description']
          : undefined,
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesComments(key: string, options: { full: boolean }): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const result = await fetchStory(config, key);
    const comments = result.story.comments.map((comment) => {
      const body = maybeTruncate(comment.body, options.full);
      return {
        id: comment.id,
        author: comment.author,
        body: body.value,
        bodySize: body.size,
        bodyTruncated: body.truncated,
        createdAt: comment.createdAt,
      };
    });
    console.log(
      formatToon(result.syncMeta, {
        key,
        count: `${comments.length} comments`,
        comments,
        help: options.full ? undefined : ['Run `tooned stories comments <KEY> --full` for full comment bodies'],
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesCommits(key: string): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchStoryCommits(config, key);
    console.log(
      formatToon(result.syncMeta, {
        key,
        count: `${result.commits.length} commits`,
        commits: result.commits.map((commit) => ({
          hash: commit.hash,
          repository: commit.repository,
          message: commit.message,
          author: commit.author,
          prs: commit.pullRequestUrl ? 1 : 0,
        })),
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesRefs(key: string): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchStoryRefs(config, key);
    console.log(
      formatToon(result.syncMeta, {
        key,
        count: `${result.refs.length} refs`,
        refs: result.refs,
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesHistory(key: string, since?: string): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchStoryHistory(config, key, since);
    console.log(
      formatToon(result.syncMeta, {
        key,
        count: `${result.count} changes`,
        history: result.history,
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesSizing(key: string): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchStorySizing(config, key);
    console.log(
      formatToon(result.syncMeta, {
        key,
        sizing: result.sizing,
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runStoriesSummarize(
  key: string,
  options: { comments?: boolean; since?: string; force?: boolean },
): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchStorySummary(config, key, {
      comments: Boolean(options.comments),
      since: options.since,
      force: Boolean(options.force),
    });
    console.log(
      formatToon(result.syncMeta, {
        key,
        summary: result.summary,
        generated: result.generated,
        cached: result.cached,
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
