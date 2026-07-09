import type {
  BoardConfiguration,
  JiraBacklogIssue,
  JiraClient,
  JiraSprint,
  JiraSprintState,
} from './client.js';

function parseDateValue(value: string | null | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function parseIdValue(value: number): number {
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export async function getBoardConfiguration(
  client: JiraClient,
  boardId: number,
): Promise<BoardConfiguration> {
  return client.getBoardConfiguration(boardId);
}

export async function getSprints(
  client: JiraClient,
  boardId: number,
  state: JiraSprintState,
): Promise<JiraSprint[]> {
  return client.getSprints(boardId, state);
}

export async function getBacklogIssues(
  client: JiraClient,
  boardId: number,
): Promise<JiraBacklogIssue[]> {
  return client.getBacklogIssues(boardId);
}

export async function resolveCurrentSprint(
  client: JiraClient,
  boardId: number,
): Promise<JiraSprint | null> {
  const active = await getSprints(client, boardId, 'active');
  if (active.length === 0) {
    return null;
  }
  return [...active].sort((left, right) => {
    const leftStart = parseDateValue(left.startDate);
    const rightStart = parseDateValue(right.startDate);
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    return parseIdValue(left.id) - parseIdValue(right.id);
  })[0]!;
}

export async function resolveNextSprint(
  client: JiraClient,
  boardId: number,
): Promise<JiraSprint | null> {
  const future = await getSprints(client, boardId, 'future');
  if (future.length === 0) {
    return null;
  }
  return [...future].sort((left, right) => {
    const leftStart = parseDateValue(left.startDate);
    const rightStart = parseDateValue(right.startDate);
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    return parseIdValue(left.id) - parseIdValue(right.id);
  })[0]!;
}
