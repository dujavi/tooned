import { describe, expect, it } from 'vitest';
import { computeSizing } from './sizing.js';

describe('computeSizing', () => {
  it('computes missing DoD and open-question risk', () => {
    const sizing = computeSizing({
      story: {
        description: 'Need final approval from @ux-review and @qa-lead',
        comments: ['resolved @ux-review', 'Waiting on @qa-lead before merge'],
        storyPoints: '5',
        team: 'Platform',
      },
      subtasks: [
        { summary: 'Build implementation', status: 'In Progress' },
        { summary: 'Test plan drafted', status: 'Done' },
      ],
      dodTemplates: [
        { team: 'default', expectedSubtasks: ['Test', 'Evaluate DoD'] },
        { team: 'Platform', expectedSubtasks: ['Test', 'Evaluate DoD', 'Docs'] },
      ],
    });

    expect(sizing.points).toBe(5);
    expect(sizing.openSubtasks).toBe(1);
    expect(sizing.openQuestions).toBe(1);
    expect(sizing.missingDoD).toEqual(['Evaluate DoD', 'Docs']);
    expect(sizing.risk).toBe('high');
  });

  it('marks low risk when subtasks and mentions are complete', () => {
    const sizing = computeSizing({
      story: {
        description: 'Follow-up from @frontend',
        comments: ['resolved @frontend'],
        storyPoints: 3,
        team: null,
      },
      subtasks: [
        { summary: 'Test smoke checks', status: 'Done' },
        { summary: 'Evaluate DoD checklist', status: 'Closed' },
      ],
      dodTemplates: [{ team: 'default', expectedSubtasks: ['Test', 'Evaluate DoD'] }],
    });

    expect(sizing.missingDoD).toEqual([]);
    expect(sizing.openQuestions).toBe(0);
    expect(sizing.risk).toBe('low');
  });
});
