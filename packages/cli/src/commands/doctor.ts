import { accessSync, constants, writeFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import {
  jqlMatchesExpected,
  confluenceConfigWarnings,
  getResolvedVcsAccounts,
  getVcsClient,
  summarizeVcsRepoTargets,
  type Config,
} from '@tooned/core';
import '@tooned/bitbucket';
import '@tooned/github';
import {
  createJiraClient,
  JiraError,
} from '@tooned/jira';
import { confluenceWikiBaseUrl, buildCrawlCql, createConfluenceClient } from '@tooned/confluence';
import {
  closeDb,
  ensureDataDir,
  getConfluencePageCount,
  getDb,
  getSyncStateValue,
  setSyncStateValue,
  CONFLUENCE_BOOTSTRAP_COMPLETE_KEY,
  CONFLUENCE_LAST_SYNC_KEY,
} from '@tooned/sync';
import { fetchHealth } from '../client.js';
import {
  computeOverall,
  formatToon,
  type DoctorCheck,
  type DoctorResult,
} from '../output.js';
import { loadConfigOrEmitError, localSyncMeta } from './shared.js';

function checkEnv(config: Config): DoctorCheck {
  const missing: string[] = [];
  if (!config.ATLASSIAN_EMAIL) missing.push('ATLASSIAN_EMAIL');
  if (!config.ATLASSIAN_TOKEN) missing.push('ATLASSIAN_TOKEN');
  if (!config.ATLASSIAN_BASE_URL) missing.push('ATLASSIAN_BASE_URL');

  if (missing.length > 0) {
    return {
      name: 'env',
      status: 'fail',
      message: `Missing required variables: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'env',
    status: 'pass',
    message: 'Required Atlassian variables present',
  };
}

function checkConfluence(config: Config): DoctorCheck {
  const warnings = confluenceConfigWarnings(config.project);
  const wikiBase = confluenceWikiBaseUrl(config);
  const db = getDb(config.TOONED_DATA_DIR);
  const pageCount = getConfluencePageCount(db);
  const bootstrapComplete =
    getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false;

  if (warnings.length > 0) {
    return {
      name: 'confluence',
      status: 'warn',
      message: `${warnings[0]} (wiki base: ${wikiBase}, pages: ${pageCount}, bootstrapComplete: ${bootstrapComplete})`,
    };
  }

  return {
    name: 'confluence',
    status: 'pass',
    message: `Confluence configured (wiki base: ${wikiBase}, pages: ${pageCount}, bootstrapComplete: ${bootstrapComplete})`,
  };
}

async function checkVcs(config: Config): Promise<DoctorCheck> {
  const accounts = getResolvedVcsAccounts(config);
  const repoSummary = summarizeVcsRepoTargets(config.project.vcs.repos);

  if (accounts.length === 0) {
    return {
      name: 'vcs',
      status: 'warn',
      message: `No VCS accounts configured (${repoSummary})`,
    };
  }

  const accountStatuses: string[] = [];
  let probeSuccesses = 0;
  let probeFailures = 0;

  for (const account of accounts) {
    if (!account.configured) {
      accountStatuses.push(`${account.id}(${account.provider}): credentials missing`);
      continue;
    }

    const client = getVcsClient(config, account.id);
    if (!client) {
      accountStatuses.push(`${account.id}(${account.provider}): client unavailable`);
      continue;
    }

    try {
      if (account.provider === 'bitbucket') {
        const scope = account.workspace ?? config.BITBUCKET_WORKSPACE ?? '';
        if (!scope) {
          accountStatuses.push(`${account.id}(bitbucket): workspace not set`);
          continue;
        }
        await client.listRepositories(scope);
      } else {
        const scope = account.org;
        if (scope) {
          await client.listRepositories(scope);
        } else {
          const response = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${account.token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
          if (!response.ok) {
            throw new Error(`GitHub auth probe failed (${response.status})`);
          }
        }
      }
      accountStatuses.push(`${account.id}(${account.provider}): ok`);
      probeSuccesses += 1;
    } catch {
      accountStatuses.push(`${account.id}(${account.provider}): auth probe failed`);
      probeFailures += 1;
    }
  }

  const status =
    probeSuccesses > 0 && probeFailures === 0
      ? 'pass'
      : probeSuccesses > 0
        ? 'warn'
        : 'warn';

  return {
    name: 'vcs',
    status,
    message: `${accountStatuses.join('; ')} | repos: ${repoSummary}`,
  };
}

function checkDataDir(dataDir: string): DoctorCheck {
  const resolved = resolve(dataDir);
  try {
    ensureDataDir(resolved);
    accessSync(resolved, constants.W_OK | constants.R_OK);
    const probe = resolve(resolved, '.write-probe');
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    return {
      name: 'dataDir',
      status: 'pass',
      message: `Writable at ${resolved}`,
    };
  } catch {
    return {
      name: 'dataDir',
      status: 'fail',
      message: `Data directory not writable: ${resolved}`,
    };
  }
}

async function checkPort(config: Config): Promise<DoctorCheck> {
  try {
    const health = await fetchHealth(config);
    if (health.ok) {
      return {
        name: 'port',
        status: 'pass',
        message: `Service already healthy on port ${config.TOONED_SERVICE_PORT}`,
      };
    }
  } catch {
    // service not running — check port availability
  }

  const available = await isPortAvailable(config.TOONED_SERVICE_PORT);
  if (available) {
    return {
      name: 'port',
      status: 'pass',
      message: `Port ${config.TOONED_SERVICE_PORT} available`,
    };
  }

  return {
    name: 'port',
    status: 'fail',
    message: `Port ${config.TOONED_SERVICE_PORT} in use and service is not healthy`,
  };
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function checkJira(config: Config): Promise<DoctorCheck> {
  const client = createJiraClient(config);
  try {
    const myself = await client.getMyself();
    return {
      name: 'jira',
      status: 'pass',
      message: `Authenticated as ${myself.displayName}`,
    };
  } catch (error) {
    if (error instanceof JiraError) {
      return {
        name: 'jira',
        status: 'fail',
        message: error.message,
      };
    }
    const message = error instanceof Error ? error.message : 'Jira check failed';
    return {
      name: 'jira',
      status: 'fail',
      message,
    };
  }
}

async function runBoardVerification(
  config: Config,
): Promise<Record<string, string | number | boolean | null>> {
  const client = createJiraClient(config);
  const boardConfig = await client.getBoardConfiguration(config.ATLASSIAN_BOARD_ID);
  const filterId = boardConfig.filter?.id;
  let filterJql = boardConfig.filter?.query ?? '';

  if (!filterJql && filterId !== undefined) {
    const filter = await client.getFilter(filterId);
    filterJql = filter.jql ?? '';
  }

  const bootstrapJql = config.project.jira.bootstrapJql;
  const matchesExpected =
    bootstrapJql !== undefined ? jqlMatchesExpected(filterJql, bootstrapJql) : null;
  const countJql = filterJql || bootstrapJql || `project = ${config.JIRA_PROJECT_KEY}`;
  const bootstrapStoryCount = await client.countIssues(countJql);

  const db = getDb(config.TOONED_DATA_DIR);
  setSyncStateValue(db, 'bootstrapStoryCount', bootstrapStoryCount);
  setSyncStateValue(db, 'boardFilterJql', filterJql);

  return {
    boardId: config.ATLASSIAN_BOARD_ID,
    filterJql,
    bootstrapJql: bootstrapJql ?? null,
    matchesExpected,
    bootstrapStoryCount,
  };
}

async function runConfluenceVerification(
  config: Config,
): Promise<Record<string, string | number | boolean | null>> {
  const db = getDb(config.TOONED_DATA_DIR);
  const cql = buildCrawlCql(config.project.confluence.mode, config.project.confluence.spaces);
  let apiReachable = false;
  let cqlSampleCount = 0;

  try {
    const client = createConfluenceClient(config);
    const page = await client.searchCql(cql);
    apiReachable = true;
    cqlSampleCount = page.results.length;
  } catch {
    apiReachable = false;
  }

  return {
    confluenceBootstrapComplete:
      getSyncStateValue<boolean>(db, CONFLUENCE_BOOTSTRAP_COMPLETE_KEY) ?? false,
    confluenceLastSync: getSyncStateValue<string>(db, CONFLUENCE_LAST_SYNC_KEY) ?? null,
    confluencePageCount: getConfluencePageCount(db),
    confluenceCql: cql,
    confluenceApiReachable: apiReachable,
    confluenceCqlSampleCount: cqlSampleCount,
  };
}

export async function runDoctor(verbose: boolean): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) {
    return 1;
  }

  const checks: DoctorCheck[] = [
    checkEnv(config),
    await checkJira(config),
    checkConfluence(config),
    checkDataDir(config.TOONED_DATA_DIR),
    await checkPort(config),
    await checkVcs(config),
  ];

  const result: DoctorResult = {
    overall: computeOverall(checks),
    checks,
    help:
      computeOverall(checks) === 'fail'
        ? ['Fix failing checks above, then re-run `tooned doctor`']
        : ['Run `tooned serve` to start the sync service'],
  };

  if (verbose && result.overall !== 'fail') {
    try {
      const board = await runBoardVerification(config);
      const confluence = await runConfluenceVerification(config);
      result.verbose = { ...board, ...confluence };
    } catch (error) {
      const message = error instanceof JiraError ? error.message : 'Board verification failed';
      checks.push({
        name: 'board',
        status: 'fail',
        message,
      });
      result.checks = checks;
      result.overall = computeOverall(checks);
    }
  } else if (verbose) {
    result.help?.push('Board verification skipped until required checks pass');
  }

  console.log(
    formatToon(localSyncMeta(config), {
      doctor: result,
    }),
  );
  closeDb();

  return result.overall === 'fail' ? 1 : 0;
}
