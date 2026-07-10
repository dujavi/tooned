import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { buildSyncMeta } from '@tooned/core';
import { buildReviewPack } from '../../service/src/sprint-review.js';
import { formatEmptySearchToon, formatServiceDownToon } from './output.js';
import { buildHomeViewPayload } from './home-view.js';
import { buildSprintNextPayload } from './commands/sprint.js';
import { formatToon } from './output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(__dirname, '../../../tests/golden');

describe('TOON golden snapshots', () => {
  it('matches service-down error snapshot', () => {
    const actual = formatServiceDownToon(7420, 'connection_refused');
    const expected = readFileSync(join(goldenDir, 'service-down.toon'), 'utf8').trim();
    expect(actual).toBe(expected);
  });

  it('matches empty-search snapshot', () => {
    const syncMeta = buildSyncMeta('2026-07-09T20:00:00.000Z', 'idle', new Date('2026-07-09T20:01:00.000Z'));
    const actual = formatEmptySearchToon(syncMeta, 'modal');
    const expected = readFileSync(join(goldenDir, 'empty-search.toon'), 'utf8').trim();
    expect(actual).toBe(expected);
  });

  it('matches home snapshot', () => {
    const syncMeta = buildSyncMeta('2026-07-09T20:00:00.000Z', 'idle', new Date('2026-07-09T20:01:00.000Z'));
    const payload = buildHomeViewPayload({
      bin: '~/.local/bin/tooned',
      serviceRunning: true,
      storyCount: 12,
      pageCount: 0,
      confluenceBootstrapComplete: false,
      confluenceLastSync: null,
      openStoryCount: 7,
      currentSprint: null,
    });
    const actual = formatToon(syncMeta, payload);
    const expected = readFileSync(join(goldenDir, 'home.toon'), 'utf8').trim();
    expect(actual).toBe(expected);
  });

  it('matches sprint-review-pack snapshot', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-10T12:30:00.000Z'));
      const syncMeta = buildSyncMeta('2026-07-10T12:29:00.000Z', 'idle', new Date('2026-07-10T12:30:00.000Z'));
      const reviewPack = buildReviewPack([
        {
          key: 'CRM-5689',
          summary: 'Improve sprint review dashboard readability for support workflows',
          status: 'In Progress',
          syncedAt: '2026-07-10T12:29:00.000Z',
          sourceUpdatedAt: '2026-07-10T12:20:00.000Z',
          doneAt: null,
          payload: {
            description: 'Focus on concise risk summaries for review calls.',
            sections: {
              acceptanceCriteria: ['Given review starts when panel opens then key risks are visible.'],
              sme: 'Delivery Enablement',
            },
          },
          sprintRefs: [{ id: 209, name: 'CRM Sprint 42.5', state: 'future' }],
          isBacklog: false,
          subtaskCount: 2,
          assignees: ['Agent Demo'],
          timeSpentSeconds: 5400,
          storyPoints: 5,
        },
      ]);
      const payload = buildSprintNextPayload({
        syncMeta,
        sprint: { id: 209, name: 'CRM Sprint 42.5', state: 'future' },
        stories: [
          {
            key: 'CRM-5689',
            summary: 'Improve sprint review dashboard readability for support workflows',
            status: 'In Progress',
            doneAt: null,
            storyPoints: 5,
            subtaskCount: 2,
            assignees: ['Agent Demo'],
            timeSpentSeconds: 5400,
            sprintRefs: [{ id: 209, name: 'CRM Sprint 42.5', state: 'future' }],
            isBacklog: false,
          },
        ],
        backlogStories: [],
        reviewPack,
        emptyState: null,
      });
      const actual = formatToon(syncMeta, payload);
      const expected = readFileSync(join(goldenDir, 'sprint-review-pack.toon'), 'utf8').trim();
      expect(actual).toBe(expected);
    } finally {
      vi.useRealTimers();
    }
  });
});
