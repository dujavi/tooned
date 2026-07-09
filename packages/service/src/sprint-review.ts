import type { SprintStory } from '@tooned/sync';

export interface WorkloadSummary {
  storyCount: number;
  storyPoints: number;
  assigneeCount: number;
  subtaskCount: number;
  timeSpentSeconds: number;
  timeSpentHours: number;
}

export interface ReviewPackItem {
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
  assignees: string[];
  subtaskCount: number;
  timeSpentHours: number;
  done: boolean;
  sme: string | null;
  descriptionExcerpt: string;
  acceptanceCriteria: string[];
  implementationHint?: string;
}

export interface ReviewPack {
  generatedAt: string;
  storyCount: number;
  stories: ReviewPackItem[];
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function truncateText(value: string | undefined, maxLength: number): string {
  if (!value) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(maxLength - 3, 0))}...`;
}

export function computeWorkload(stories: SprintStory[]): WorkloadSummary {
  const assignees = new Set<string>();
  let storyPoints = 0;
  let subtaskCount = 0;
  let timeSpentSeconds = 0;

  for (const story of stories) {
    if (story.storyPoints !== null) {
      storyPoints += story.storyPoints;
    }
    subtaskCount += story.subtaskCount;
    timeSpentSeconds += story.timeSpentSeconds;
    for (const assignee of story.assignees) {
      assignees.add(assignee);
    }
  }

  return {
    storyCount: stories.length,
    storyPoints: roundToTwo(storyPoints),
    assigneeCount: assignees.size,
    subtaskCount,
    timeSpentSeconds,
    timeSpentHours: roundToTwo(timeSpentSeconds / 3600),
  };
}

export function buildReviewPack(
  stories: SprintStory[],
  enrichments?: Partial<Record<string, { implementationHint?: string }>>,
): ReviewPack {
  return {
    generatedAt: new Date().toISOString(),
    storyCount: stories.length,
    stories: stories.map((story) => {
      const acceptanceCriteria = story.payload?.sections?.acceptanceCriteria ?? [];
      return {
        key: story.key,
        summary: truncateText(story.summary, 180),
        status: story.status,
        storyPoints: story.storyPoints,
        assignees: story.assignees,
        subtaskCount: story.subtaskCount,
        timeSpentHours: roundToTwo(story.timeSpentSeconds / 3600),
        done: Boolean(story.doneAt),
        sme: story.payload?.sections?.sme ?? null,
        descriptionExcerpt: truncateText(story.payload?.description, 320),
        acceptanceCriteria: acceptanceCriteria.slice(0, 5).map((item) => truncateText(item, 180)),
        implementationHint: enrichments?.[story.key]?.implementationHint,
      } satisfies ReviewPackItem;
    }),
  };
}
