#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import { Command } from 'commander';
import { runDoctor } from './commands/doctor.js';
import { runRefsSearch } from './commands/refs.js';
import { runSearch } from './commands/search.js';
import { runServe } from './commands/serve.js';
import { runSetupHooks } from './commands/setup.js';
import { runSprintCurrent, runSprintNext } from './commands/sprint.js';
import { runStatus } from './commands/status.js';
import {
  runStoriesComments,
  runStoriesCommits,
  runStoriesHistory,
  runStoriesList,
  runStoriesRefs,
  runStoriesSummarize,
  runStoriesSizing,
  runStoriesView,
} from './commands/stories.js';
import { runSyncCommand } from './commands/sync.js';
import { collapseHomePath, formatUnknownFlagToon, formatToon } from './output.js';
import { closeDb, getDb, getStoryCount, getSyncStateValue } from '@tooned/sync';
import { buildSyncMeta } from '@tooned/core';
import { fetchHealth } from './client.js';
import { loadConfigOrEmitError } from './commands/shared.js';
import { buildHomeViewPayload } from './home-view.js';

loadDotenv();

const program = new Command();

program
  .name('tooned')
  .description('Local Jira sync service and agent-friendly CLI')
  .version('0.1.0')
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });

interface FlagValidationRule {
  command: string;
  path: string[];
  flags: string[];
}

const FLAG_RULES: FlagValidationRule[] = [
  { command: 'tooned', path: [], flags: [] },
  { command: 'serve', path: ['serve'], flags: [] },
  { command: 'doctor', path: ['doctor'], flags: ['--verbose'] },
  { command: 'status', path: ['status'], flags: [] },
  { command: 'sync', path: ['sync'], flags: ['--force'] },
  { command: 'setup hooks', path: ['setup', 'hooks'], flags: [] },
  { command: 'sprint current', path: ['sprint', 'current'], flags: ['--workload'] },
  { command: 'sprint next', path: ['sprint', 'next'], flags: ['--review-pack', '--include-backlog', '--enriched'] },
  { command: 'stories list', path: ['stories', 'list'], flags: ['--status', '--assignee', '--sprint', '--limit', '--fields'] },
  { command: 'stories view', path: ['stories', 'view'], flags: ['--full', '--fields'] },
  { command: 'stories comments', path: ['stories', 'comments'], flags: ['--full'] },
  { command: 'stories commits', path: ['stories', 'commits'], flags: [] },
  { command: 'stories refs', path: ['stories', 'refs'], flags: [] },
  { command: 'stories history', path: ['stories', 'history'], flags: ['--since'] },
  { command: 'stories sizing', path: ['stories', 'sizing'], flags: [] },
  { command: 'stories summarize', path: ['stories', 'summarize'], flags: ['--comments', '--since', '--force'] },
  { command: 'search', path: ['search'], flags: ['--in', '--sprint', '--status', '--since'] },
  { command: 'refs search', path: ['refs', 'search'], flags: [] },
];

const RENAMED_FLAGS: Record<string, string> = {
  '--state': '--status',
  '--scope': '--in',
};

function normalizeFlag(token: string): string {
  const [flag] = token.split('=');
  return flag ?? token;
}

function resolveRule(argv: string[]): FlagValidationRule {
  const candidates = [...FLAG_RULES].sort((a, b) => b.path.length - a.path.length);
  for (const candidate of candidates) {
    if (candidate.path.every((segment, index) => argv[index] === segment)) {
      return candidate;
    }
  }
  return FLAG_RULES[0]!;
}

function validateUnknownFlags(argv: string[]): { ok: true } | { ok: false; output: string } {
  const rule = resolveRule(argv);
  const allowed = new Set<string>(['--help', '-h', ...rule.flags]);

  for (const token of argv) {
    if (!token.startsWith('-')) continue;
    const normalized = normalizeFlag(token);
    if (allowed.has(normalized)) continue;
    if (normalized.startsWith('--')) {
      const hint = RENAMED_FLAGS[normalized]
        ? `${normalized} was renamed; use ${RENAMED_FLAGS[normalized]} instead`
        : undefined;
      return {
        ok: false,
        output: formatUnknownFlagToon({
          syncMeta: buildSyncMeta(null, 'error'),
          flag: normalized,
          command: rule.command,
          validFlags: rule.flags.length > 0 ? [...rule.flags, '--help'] : ['--help'],
          hint,
        }),
      };
    }
    if (normalized !== '-h') {
      return {
        ok: false,
        output: formatUnknownFlagToon({
          syncMeta: buildSyncMeta(null, 'error'),
          flag: normalized,
          command: rule.command,
          validFlags: rule.flags.length > 0 ? [...rule.flags, '--help'] : ['--help'],
        }),
      };
    }
  }

  return { ok: true };
}

program.action(async () => {
  const config = loadConfigOrEmitError();
  if (!config) {
    process.exit(1);
  }
  try {
    const db = getDb(config.TOONED_DATA_DIR);
    const syncState = getSyncStateValue<{ lastSync?: string | null; syncStatus?: 'idle' | 'syncing' | 'error' }>(db, 'sync') ?? {};
    const syncMeta = buildSyncMeta(syncState.lastSync ?? null, syncState.syncStatus ?? 'idle');
    let serviceRunning = false;
    let currentSprint: string | null = null;

    try {
      const health = await fetchHealth(config);
      serviceRunning = true;
      currentSprint = health.syncMeta.syncStatus === 'syncing' ? 'syncing' : null;
    } catch {
      serviceRunning = false;
    }

    const openStoryCount = (db
      .prepare("SELECT COUNT(*) AS count FROM stories WHERE lower(coalesce(status, '')) NOT LIKE '%done%'")
      .get() as { count: number }).count;
    const binPath = collapseHomePath(process.argv[1] ?? 'tooned');
    console.log(
      formatToon(
        syncMeta,
        buildHomeViewPayload({
          bin: binPath,
          serviceRunning,
          storyCount: getStoryCount(db),
          openStoryCount,
          currentSprint,
        }),
      ),
    );
    closeDb();
  } catch (error) {
    console.log(formatToon(buildSyncMeta(null, 'error'), { error: error instanceof Error ? error.message : 'Failed to render home view' }));
    process.exit(1);
  }
});

program
  .command('serve')
  .description('Start the Tooned sync service')
  .action(async () => {
    await runServe();
  });

program
  .command('doctor')
  .description('Verify configuration and connectivity')
  .option('--verbose', 'Run board filter verification and story count query')
  .addHelpText('after', '\nExamples:\n  tooned doctor\n  tooned doctor --verbose')
  .action(async (options: { verbose?: boolean }) => {
    const exitCode = await runDoctor(Boolean(options.verbose));
    process.exit(exitCode);
  });

program
  .command('status')
  .description('Show sync metadata and story count')
  .addHelpText('after', '\nExamples:\n  tooned status')
  .action(async () => {
    const exitCode = await runStatus();
    process.exit(exitCode);
  });

program
  .command('sync')
  .description('Run Jira sync now')
  .option('--force', 'Force bootstrap + delta sync')
  .addHelpText('after', '\nExamples:\n  tooned sync\n  tooned sync --force')
  .action(async (options: { force?: boolean }) => {
    const exitCode = await runSyncCommand(Boolean(options.force));
    process.exit(exitCode);
  });

const setup = program.command('setup').description('Agent integration setup');
setup
  .command('hooks')
  .description('Install or repair Cursor session-start hook')
  .addHelpText('after', '\nExamples:\n  tooned setup hooks')
  .action(async () => {
    const exitCode = await runSetupHooks();
    process.exit(exitCode);
  });

const sprint = program.command('sprint').description('Sprint views');
sprint
  .command('current')
  .description('Show current sprint stories')
  .option('--workload', 'Include workload summary')
  .addHelpText('after', '\nExamples:\n  tooned sprint current\n  tooned sprint current --workload')
  .action(async (options: { workload?: boolean }) => {
    const exitCode = await runSprintCurrent(Boolean(options.workload));
    process.exit(exitCode);
  });

sprint
  .command('next')
  .description('Show next sprint preview')
  .option('--review-pack', 'Include review pack details')
  .option('--include-backlog', 'Include backlog stories in review')
  .option('--enriched', 'Include cached implementationHint in review pack')
  .addHelpText('after', '\nExamples:\n  tooned sprint next\n  tooned sprint next --review-pack --enriched')
  .action(async (options: { reviewPack?: boolean; includeBacklog?: boolean; enriched?: boolean }) => {
    const exitCode = await runSprintNext({
      reviewPack: Boolean(options.reviewPack),
      includeBacklog: Boolean(options.includeBacklog),
      enriched: Boolean(options.enriched),
    });
    process.exit(exitCode);
  });

const stories = program.command('stories').description('Story commands');
stories
  .command('list')
  .description('List synced stories')
  .option('--status <status>', 'Filter by status contains')
  .option('--assignee <assignee>', 'Filter by assignee contains')
  .option('--sprint <name>', 'Filter by sprint reference text')
  .option('--limit <n>', 'Limit rows', (value) => Number.parseInt(value, 10), 20)
  .option('--fields <csv>', 'Comma-separated fields')
  .addHelpText('after', '\nExamples:\n  tooned stories list\n  tooned stories list --status "In Progress" --limit 50')
  .action(async (options: { status?: string; assignee?: string; sprint?: string; limit?: number; fields?: string }) => {
    const exitCode = await runStoriesList(options);
    process.exit(exitCode);
  });

stories
  .command('view')
  .description('View a story by key')
  .argument('<key>', 'Story key, e.g. CRM-100')
  .option('--full', 'Show full long-form fields')
  .option('--fields <csv>', 'Comma-separated fields')
  .addHelpText('after', '\nExamples:\n  tooned stories view CRM-100\n  tooned stories view CRM-100 --full')
  .action(async (key: string, options: { full?: boolean; fields?: string }) => {
    const exitCode = await runStoriesView(key, { full: Boolean(options.full), fields: options.fields });
    process.exit(exitCode);
  });

stories
  .command('comments')
  .description('View story comments')
  .argument('<key>', 'Story key')
  .option('--full', 'Show full comment bodies')
  .addHelpText('after', '\nExamples:\n  tooned stories comments CRM-100\n  tooned stories comments CRM-100 --full')
  .action(async (key: string, options: { full?: boolean }) => {
    const exitCode = await runStoriesComments(key, { full: Boolean(options.full) });
    process.exit(exitCode);
  });

stories
  .command('commits')
  .description('View story commits')
  .argument('<key>', 'Story key')
  .addHelpText('after', '\nExamples:\n  tooned stories commits CRM-100')
  .action(async (key: string) => {
    const exitCode = await runStoriesCommits(key);
    process.exit(exitCode);
  });

stories
  .command('refs')
  .description('View extracted refs for a story')
  .argument('<key>', 'Story key')
  .addHelpText('after', '\nExamples:\n  tooned stories refs CRM-100')
  .action(async (key: string) => {
    const exitCode = await runStoriesRefs(key);
    process.exit(exitCode);
  });

stories
  .command('history')
  .description('View story changelog history')
  .argument('<key>', 'Story key')
  .option('--since <isoDate>', 'Filter history since ISO datetime')
  .addHelpText('after', '\nExamples:\n  tooned stories history CRM-100\n  tooned stories history CRM-100 --since 2026-07-01T00:00:00Z')
  .action(async (key: string, options: { since?: string }) => {
    const exitCode = await runStoriesHistory(key, options.since);
    process.exit(exitCode);
  });

stories
  .command('summarize')
  .description('Summarize a story with optional LLM enrichment')
  .argument('<key>', 'Story key')
  .option('--comments', 'Include comment digest in summary')
  .option('--since <isoDate>', 'Include change delta since ISO datetime')
  .option('--force', 'Regenerate even when cache is valid')
  .addHelpText('after', '\nExamples:\n  tooned stories summarize CRM-100\n  tooned stories summarize CRM-100 --comments --force')
  .action(async (key: string, options: { comments?: boolean; since?: string; force?: boolean }) => {
    const exitCode = await runStoriesSummarize(key, {
      comments: Boolean(options.comments),
      since: options.since,
      force: Boolean(options.force),
    });
    process.exit(exitCode);
  });

stories
  .command('sizing')
  .description('Compute sizing and DoD risk for a story')
  .argument('<key>', 'Story key')
  .addHelpText('after', '\nExamples:\n  tooned stories sizing CRM-100')
  .action(async (key: string) => {
    const exitCode = await runStoriesSizing(key);
    process.exit(exitCode);
  });

program
  .command('search')
  .description('Search stories and notes')
  .argument('<query>', 'Search query')
  .option('--in <scope>', 'all|comments|notes', 'all')
  .option('--sprint <name>', 'Filter by sprint')
  .option('--status <status>', 'Filter by status')
  .option('--since <isoDate>', 'Filter by updated timestamp')
  .addHelpText('after', '\nExamples:\n  tooned search modal\n  tooned search "evaluate dod" --in comments')
  .action(async (query: string, options: { in: 'all' | 'comments' | 'notes'; sprint?: string; status?: string; since?: string }) => {
    const scope = options.in === 'comments' || options.in === 'notes' ? options.in : 'all';
    const exitCode = await runSearch(query, {
      inScope: scope,
      sprint: options.sprint,
      status: options.status,
      since: options.since,
    });
    process.exit(exitCode);
  });

const refs = program.command('refs').description('Reference search commands');
refs
  .command('search')
  .description('Search extracted links and refs')
  .argument('<query>', 'Ref search query')
  .addHelpText('after', '\nExamples:\n  tooned refs search github.com')
  .action(async (query: string) => {
    const exitCode = await runRefsSearch(query);
    process.exit(exitCode);
  });

async function main(): Promise<void> {
  const unknownFlagCheck = validateUnknownFlags(process.argv.slice(2));
  if (!unknownFlagCheck.ok) {
    console.log(unknownFlagCheck.output);
    process.exit(2);
  }
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    console.log(formatToon(buildSyncMeta(null, 'error'), { error: message }));
    process.exit(1);
  }
}

main();
