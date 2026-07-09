export type EnrichmentType = 'brief' | 'commentDigest' | 'implementationHint' | 'changeDelta';

export interface EnrichmentPromptInput {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  developerNotes: string;
  comments: Array<{ id: string; createdAt: string | null; updatedAt: string | null; body: string }>;
  changelog: Array<{ field: string | null; fromValue: string | null; toValue: string | null; changedAt: string | null }>;
  since?: string;
}

function trimBody(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function formatComments(input: EnrichmentPromptInput): string {
  if (input.comments.length === 0) {
    return 'No comments';
  }
  return input.comments
    .map((comment) => {
      const at = comment.updatedAt ?? comment.createdAt ?? 'unknown time';
      return `- [${comment.id}] (${at}) ${trimBody(comment.body, 220)}`;
    })
    .join('\n');
}

function formatChangelog(input: EnrichmentPromptInput): string {
  const rows = input.since
    ? input.changelog.filter((item) => (item.changedAt ?? '') >= input.since!)
    : input.changelog;
  if (rows.length === 0) {
    return 'No changelog entries';
  }
  return rows
    .slice(0, 40)
    .map((item) => `- ${item.changedAt ?? 'unknown'}: ${item.field ?? 'field'} :: ${item.fromValue ?? ''} -> ${item.toValue ?? ''}`)
    .join('\n');
}

function baseStoryContext(input: EnrichmentPromptInput): string {
  return [
    `Story: ${input.key}`,
    `Summary: ${input.summary}`,
    'Description:',
    input.description || '(empty)',
    'Acceptance criteria:',
    input.acceptanceCriteria.length > 0 ? input.acceptanceCriteria.map((item) => `- ${item}`).join('\n') : '- (none)',
    'Developer notes:',
    input.developerNotes || '(empty)',
  ].join('\n');
}

export function buildPrompt(type: EnrichmentType, input: EnrichmentPromptInput): string {
  const base = baseStoryContext(input);
  switch (type) {
    case 'implementationHint':
      return [
        'You are a concise implementation planning assistant.',
        'Return exactly one sentence, plain text.',
        'Focus on a concrete technical approach derived from the story description and acceptance criteria.',
        'Do not include bullets, numbering, hedging, or markdown.',
        '',
        base,
      ].join('\n');
    case 'brief':
      return [
        'You are writing a short engineering briefing.',
        'Return at most 3 sentences, plain text.',
        'Include only concrete scope, risk, and next-action information from the story context.',
        'Do not include markdown.',
        '',
        base,
      ].join('\n');
    case 'commentDigest':
      return [
        'You summarize unresolved decisions from issue comments.',
        'Return plain text with at most 4 bullets prefixed by "- ".',
        'Only include unresolved decisions, open questions, or blocked choices.',
        'If no unresolved items exist, return exactly: "No unresolved decisions noted."',
        '',
        base,
        '',
        'Comments:',
        formatComments(input),
      ].join('\n');
    case 'changeDelta':
      return [
        'You summarize noteworthy story changes.',
        'Return 2-4 bullets prefixed by "- " and plain text only.',
        'Focus on status/scope/priority decision changes visible in changelog.',
        '',
        base,
        '',
        `Since: ${input.since ?? 'all history'}`,
        'Changelog:',
        formatChangelog(input),
      ].join('\n');
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}
