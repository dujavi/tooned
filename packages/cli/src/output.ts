import { buildSyncMeta, encodeToonDocument, type SyncMeta } from '@tooned/core';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface DoctorResult {
  overall: CheckStatus;
  checks: DoctorCheck[];
  verbose?: Record<string, string | number | boolean | null>;
  help?: string[];
}

export function collapseHomePath(path: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function statusRank(status: CheckStatus): number {
  if (status === 'fail') return 2;
  if (status === 'warn') return 1;
  return 0;
}

export function computeOverall(checks: DoctorCheck[]): CheckStatus {
  let overall: CheckStatus = 'pass';
  for (const check of checks) {
    if (statusRank(check.status) > statusRank(overall)) {
      overall = check.status;
    }
  }
  return overall;
}

export function formatToon(syncMeta: SyncMeta, payload: Record<string, unknown>): string {
  return encodeToonDocument(syncMeta, payload);
}

export function formatConfigErrorToon(errorMessage: string): string {
  return formatToon(
    buildSyncMeta(null, 'error'),
    {
      error: errorMessage,
      help: ['Copy .env.example to .env and tooned.yaml.example to tooned.yaml'],
    },
  );
}

export function formatServiceDownToon(port: number, reason: 'connection_refused' | 'timeout'): string {
  const help = reason === 'timeout'
    ? [`Ensure service on port ${port} responds and retry \`tooned status\``]
    : [`Run \`tooned serve\` to start service on port ${port}`];
  return formatToon(
    buildSyncMeta(null, 'error'),
    {
      error: `tooned service unavailable on port ${port}`,
      help,
    },
  );
}

export function formatUnknownFlagToon(input: {
  syncMeta?: SyncMeta;
  flag: string;
  command: string;
  validFlags: string[];
  hint?: string;
}): string {
  return formatToon(
    input.syncMeta ?? buildSyncMeta(null, 'error'),
    {
      error: `unknown flag ${input.flag} for \`${input.command}\``,
      help: input.hint
        ? [input.hint]
        : [`valid flags for \`${input.command}\`: ${input.validFlags.join(', ')}`],
    },
  );
}

export function formatEmptySearchToon(
  syncMeta: SyncMeta,
  query: string,
  scope: 'all' | 'stories' | 'docs' | 'code' | 'comments' | 'notes' = 'all',
  extra?: {
    codeSearchStatus?: 'not_configured' | 'empty';
    help?: string[];
  },
): string {
  const scopeLabel =
    scope === 'docs'
      ? 'docs'
      : scope === 'code'
        ? 'code'
        : scope === 'comments'
          ? 'comments'
          : scope === 'notes'
            ? 'notes'
            : scope === 'stories'
              ? 'stories'
              : 'results';
  return formatToon(syncMeta, {
    search: `0 ${scopeLabel} found for "${query}"`,
    ...(extra?.codeSearchStatus ? { codeSearchStatus: extra.codeSearchStatus } : {}),
    help:
      extra?.help ??
      (scope === 'all'
        ? [
            'Run `tooned search "<query>" --in stories` for Jira stories only',
            'Run `tooned search "<query>" --in docs` for Confluence pages',
            'Run `tooned search "<query>" --in code` for indexed repositories',
          ]
        : scope === 'code'
          ? ['Run `tooned repos list` to verify indexed repositories']
          : ['Try `tooned search "<query>" --in all` to search stories, docs, and code together']),
  });
}
