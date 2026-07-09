import { describe, expect, it } from 'vitest';
import type { SprintStory } from '@tooned/sync';
import { buildReviewPack, computeWorkload } from './sprint-review.js';

function makeStory(input: Partial<SprintStory> & Pick<SprintStory, 'key'>): SprintStory {
  return {
    key: input.key,
    summary: input.summary ?? '',
    status: input.status ?? 'To Do',
    syncedAt: input.syncedAt ?? null,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    doneAt: input.doneAt ?? null,
    payload: input.payload ?? null,
    sprintRefs: input.sprintRefs ?? [],
    isBacklog: input.isBacklog ?? false,
    subtaskCount: input.subtaskCount ?? 0,
    assignees: input.assignees ?? [],
    timeSpentSeconds: input.timeSpentSeconds ?? 0,
    storyPoints: input.storyPoints ?? null,
  };
}

describe('sprint review helpers', () => {
  it('computes workload totals from sprint stories', () => {
    const stories: SprintStory[] = [
      makeStory({
        key: 'CRM-100',
        storyPoints: 5,
        assignees: ['Alice', 'Bob'],
        subtaskCount: 2,
        timeSpentSeconds: 3600,
      }),
      makeStory({
        key: 'CRM-1006',
        storyPoints: 3,
        assignees: ['Bob'],
        subtaskCount: 1,
        timeSpentSeconds: 1800,
      }),
    ];

    expect(computeWorkload(stories)).toEqual({
      storyCount: 2,
      storyPoints: 8,
      assigneeCount: 2,
      subtaskCount: 3,
      timeSpentSeconds: 5400,
      timeSpentHours: 1.5,
    });
  });

  it('builds review pack with truncated fields', () => {
    const stories: SprintStory[] = [
      makeStory({
        key: 'CRM-1008',
        summary: 'A'.repeat(220),
        status: 'In Progress',
        storyPoints: 2,
        assignees: ['Alice'],
        subtaskCount: 1,
        timeSpentSeconds: 2700,
        payload: {
          description: 'B'.repeat(400),
          sections: {
            acceptanceCriteria: ['C'.repeat(200)],
            sme: 'Team SME',
          },
        },
      }),
    ];

    const pack = buildReviewPack(stories, {
      'CRM-1008': { implementationHint: 'Use cached feature-flag rollout to isolate reviewer UI changes.' },
    });
    expect(pack.storyCount).toBe(1);
    expect(pack.stories[0]?.summary.endsWith('...')).toBe(true);
    expect(pack.stories[0]?.descriptionExcerpt.endsWith('...')).toBe(true);
    expect(pack.stories[0]?.acceptanceCriteria[0]?.endsWith('...')).toBe(true);
    expect(pack.stories[0]?.timeSpentHours).toBe(0.75);
    expect(pack.stories[0]?.implementationHint).toContain('feature-flag');
  });
});
