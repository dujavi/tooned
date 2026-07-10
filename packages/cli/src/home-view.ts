export const TOONED_HOME_DESCRIPTION =
  'Inspect synced Jira stories, Confluence docs, indexed code, and sprint delivery state';

export interface HomeViewInput {
  bin: string;
  serviceRunning: boolean;
  storyCount: number;
  pageCount: number;
  confluenceBootstrapComplete: boolean;
  confluenceLastSync: string | null;
  openStoryCount: number;
  currentSprint: string | null;
}

export function buildHomeViewPayload(input: HomeViewInput): Record<string, unknown> {
  return {
    bin: input.bin,
    description: TOONED_HOME_DESCRIPTION,
    serviceRunning: input.serviceRunning,
    storyCount: input.storyCount,
    pageCount: input.pageCount,
    confluenceBootstrapComplete: input.confluenceBootstrapComplete,
    confluenceLastSync: input.confluenceLastSync,
    openStoryCount: input.openStoryCount,
    currentSprint: input.currentSprint,
    help: input.serviceRunning
      ? [
          'Run `tooned sprint current --workload` to inspect current sprint',
          'Run `tooned search "<query>" --in all` to search stories, docs, and code',
          'Run `tooned pages list --space CRM --limit 20` to browse Confluence pages',
          'Run `tooned repos list` to browse indexed repositories',
        ]
      : [
          'Run `tooned serve` to start the sync service',
          'Run `tooned stories list --limit 20` to browse stories',
        ],
  };
}

export function buildSkillCommandExamples(): string[] {
  return [
    'npx -y @tooned/cli status',
    'npx -y @tooned/cli sprint current --workload',
    'npx -y @tooned/cli stories list --status "In Progress" --limit 20',
    'npx -y @tooned/cli search "<query>" --in all',
    'npx -y @tooned/cli repos list',
  ];
}
