import { z } from 'zod';
import {
  loadProjectConfig,
  ProjectConfigError,
  type DodTemplate,
  type ProjectConfig,
} from './project-config.js';

const optionalString = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().optional(),
);

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().optional(),
);

const optionalBoolean = z.preprocess(
  (value) => {
    if (value === '' || value === undefined) return undefined;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  },
  z.coerce.boolean().optional(),
);

export const EnvSchema = z.object({
  ATLASSIAN_EMAIL: z.string().min(1, 'ATLASSIAN_EMAIL is required'),
  ATLASSIAN_TOKEN: z.string().min(1, 'ATLASSIAN_TOKEN is required'),
  ATLASSIAN_BASE_URL: z.string().url('ATLASSIAN_BASE_URL must be a valid URL'),
  ATLASSIAN_BOARD_ID: optionalNumber,
  BITBUCKET_USERNAME: optionalString,
  BITBUCKET_TOKEN: optionalString,
  BITBUCKET_WORKSPACE: optionalString,
  GITHUB_TOKEN: optionalString,
  TOONED_SERVICE_PORT: z.preprocess(
    (value) => (value === '' || value === undefined ? 7420 : value),
    z.coerce.number().default(7420),
  ),
  TOONED_DATA_DIR: z.preprocess(
    (value) => (value === '' || value === undefined ? './data' : value),
    z.string().default('./data'),
  ),
  TOONED_SYNC_INTERVAL_MS: z.preprocess(
    (value) => (value === '' || value === undefined ? 300_000 : value),
    z.coerce.number().default(300_000),
  ),
  JIRA_PROJECT_KEY: optionalString,
  JIRA_MAX_CONCURRENT: z.preprocess(
    (value) => (value === '' || value === undefined ? 10 : value),
    z.coerce.number().default(10),
  ),
  TOONED_CONFIG_PATH: optionalString,
  LLM_API_KEY: optionalString,
  LLM_BASE_URL: optionalString,
  LLM_MODEL: optionalString,
  TOONED_ENRICH_ON_SYNC: optionalBoolean,
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export interface Config extends EnvConfig {
  project: ProjectConfig;
  JIRA_PROJECT_KEY: string;
  ATLASSIAN_BOARD_ID: number;
  BITBUCKET_WORKSPACE?: string;
  fieldMap: Record<string, string>;
  dodTemplates: DodTemplate[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsedEnv = EnvSchema.parse(env);
  const project = loadProjectConfig({ configPath: parsedEnv.TOONED_CONFIG_PATH });

  const boardId = parsedEnv.ATLASSIAN_BOARD_ID ?? project.jira.boardId;
  const projectKey = parsedEnv.JIRA_PROJECT_KEY ?? project.jira.projectKey;
  const bitbucketWorkspace =
    parsedEnv.BITBUCKET_WORKSPACE ?? project.vcs.bitbucket?.workspace;

  return {
    ...parsedEnv,
    project,
    ATLASSIAN_BOARD_ID: boardId,
    JIRA_PROJECT_KEY: projectKey,
    BITBUCKET_WORKSPACE: bitbucketWorkspace,
    fieldMap: project.fields,
    dodTemplates: project.dodTemplates,
  };
}

export function formatConfigError(error: unknown): string {
  if (error instanceof ProjectConfigError) {
    return error.message;
  }
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join('; ');
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Invalid configuration';
}

/** @deprecated Use EnvSchema */
export const ConfigSchema = EnvSchema;
