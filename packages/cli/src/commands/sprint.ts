import { formatToon } from '../output.js';
import { fetchSprintCurrent, fetchSprintNext } from '../client.js';
import { handleServiceError, loadConfigOrEmitError } from './shared.js';
import type { SprintNextResponse } from '../client.js';

export function buildSprintNextPayload(result: SprintNextResponse): Record<string, unknown> {
  return {
    sprint: result.sprint,
    count: `${result.stories.length} stories`,
    stories: result.stories.map((story) => ({
      key: story.key,
      summary: story.summary,
      status: story.status,
      subtasks: story.subtaskCount,
    })),
    backlogCount: result.backlogStories?.length ?? 0,
    backlogStories: result.backlogStories?.map((story) => ({
      key: story.key,
      summary: story.summary,
      status: story.status,
    })),
    reviewPack: result.reviewPack,
    emptyState: result.emptyState,
    help: result.sprint
      ? ['Run `tooned sprint next --review-pack --enriched` for reviewer prep with cached hints']
      : ['No future sprint found; run `tooned stories list --status "To Do"`'],
  };
}

export async function runSprintCurrent(workload: boolean): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;
  try {
    const result = await fetchSprintCurrent(config, workload);
    console.log(
      formatToon(result.syncMeta, {
        sprint: result.sprint,
        count: `${result.stories.length} stories`,
        stories: result.stories.map((story) => ({
          key: story.key,
          summary: story.summary,
          status: story.status,
          comments: undefined,
          subtasks: story.subtaskCount,
          prs: undefined,
        })),
        workload: result.workload,
        emptyState: result.emptyState,
        help: result.sprint
          ? ['Run `tooned stories list --sprint "<name>"` to inspect sprint stories']
          : ['Run `tooned sprint next` to inspect upcoming work'],
      }),
    );
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}

export async function runSprintNext(options: {
  reviewPack: boolean;
  includeBacklog: boolean;
  enriched?: boolean;
}): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  try {
    const result = await fetchSprintNext(config, {
      reviewPack: options.reviewPack,
      includeBacklog: options.includeBacklog,
      enriched: Boolean(options.enriched),
    });
    console.log(formatToon(result.syncMeta, buildSprintNextPayload(result)));
    return 0;
  } catch (error) {
    return handleServiceError(config, error);
  }
}
