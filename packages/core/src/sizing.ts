import { getDodTemplate, matchesSubtaskTemplate, type DodTemplate } from './project-config.js';

type RiskLevel = 'low' | 'medium' | 'high';

interface SizingSubtask {
  summary: string | null;
  status: string | null;
}

interface SizingStory {
  description: string;
  comments: string[];
  storyPoints: unknown;
  team: string | null;
}

export interface StorySizing {
  points: number | null;
  openSubtasks: number;
  missingDoD: string[];
  openQuestions: number;
  risk: RiskLevel;
}

function parseStoryPoints(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getOpenSubtasks(subtasks: SizingSubtask[]): number {
  let openCount = 0;
  for (const subtask of subtasks) {
    const normalized = (subtask.status ?? '').toLowerCase();
    const isClosed = normalized.includes('done') || normalized.includes('closed') || normalized.includes('resolved');
    if (!isClosed) {
      openCount += 1;
    }
  }
  return openCount;
}

function countOpenQuestions(story: SizingStory): number {
  const mentionPattern = /(^|[\s(])@([a-zA-Z0-9._-]{2,})/g;
  const resolvePattern = /(resolved|addressed|fixed|done)\s+@([a-zA-Z0-9._-]{2,})/gim;
  const source = `${story.description}\n${story.comments.join('\n')}`;
  const mentioned = new Set<string>();
  let match = mentionPattern.exec(source);
  while (match) {
    const handle = match[2]?.toLowerCase();
    if (handle) {
      mentioned.add(handle);
    }
    match = mentionPattern.exec(source);
  }

  const resolved = new Set<string>();
  let resolvedMatch = resolvePattern.exec(source);
  while (resolvedMatch) {
    const handle = resolvedMatch[2]?.toLowerCase();
    if (handle) {
      resolved.add(handle);
    }
    resolvedMatch = resolvePattern.exec(source);
  }

  let open = 0;
  for (const handle of mentioned) {
    if (!resolved.has(handle)) {
      open += 1;
    }
  }
  return open;
}

function getMissingDodSubtasks(templates: DodTemplate[], team: string | null, subtasks: SizingSubtask[]): string[] {
  const template = getDodTemplate(templates, team ?? undefined);
  const presentSummaries = subtasks.map((subtask) => subtask.summary ?? '');
  return template.expectedSubtasks.filter(
    (expectedSubtask) => !presentSummaries.some((summary) => matchesSubtaskTemplate(summary, expectedSubtask)),
  );
}

function computeRisk(input: { openSubtasks: number; missingDoD: number; openQuestions: number }): RiskLevel {
  if (input.missingDoD > 0 || input.openSubtasks >= 6 || input.openQuestions >= 3) {
    return 'high';
  }
  if (input.openSubtasks > 0 || input.openQuestions > 0) {
    return 'medium';
  }
  return 'low';
}

export function computeSizing(input: {
  story: SizingStory;
  subtasks: SizingSubtask[];
  dodTemplates: DodTemplate[];
}): StorySizing {
  const points = parseStoryPoints(input.story.storyPoints);
  const openSubtasks = getOpenSubtasks(input.subtasks);
  const missingDoD = getMissingDodSubtasks(input.dodTemplates, input.story.team, input.subtasks);
  const openQuestions = countOpenQuestions(input.story);
  return {
    points,
    openSubtasks,
    missingDoD,
    openQuestions,
    risk: computeRisk({
      openSubtasks,
      missingDoD: missingDoD.length,
      openQuestions,
    }),
  };
}
