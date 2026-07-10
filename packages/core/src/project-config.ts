import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { VcsConfigSchema } from './vcs-config.js';

const DodTemplateSchema = z.object({
  team: z.string().min(1),
  expectedSubtasks: z.array(z.string().min(1)).min(1),
});

export const ProjectConfigSchema = z.object({
  jira: z.object({
    projectKey: z.string().min(1),
    boardId: z.coerce.number().int().positive(),
    storyIssueType: z.string().min(1).default('Story'),
    bootstrapJql: z.string().min(1).optional(),
  }),
  fields: z.record(z.string(), z.string()).default({}),
  dodTemplates: z.array(DodTemplateSchema).default([
    {
      team: 'default',
      expectedSubtasks: ['Test', 'Evaluate DoD'],
    },
  ]),
  vcs: VcsConfigSchema.default({
    urlDomains: { form: [], confluence: [] },
    accounts: [],
    repos: [],
    maxFileBytes: 262_144,
  }),
  confluence: z
    .object({
      mode: z.enum(['all', 'spaces']).default('all'),
      spaces: z.array(z.string().min(1)).default([]),
      maxAttachmentBytes: z.number().int().positive().default(524_288),
    })
    .default({ mode: 'all', spaces: [], maxAttachmentBytes: 524_288 }),
  parsing: z
    .object({
      smePattern: z.string().min(1).optional(),
    })
    .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type DodTemplate = z.infer<typeof DodTemplateSchema>;

const DEFAULT_CONFIG_PATHS = ['tooned.yaml', 'tooned.yml'];

export function resolveConfigPath(explicitPath?: string, cwd: string = process.cwd()): string | null {
  if (explicitPath) {
    const resolved = resolve(cwd, explicitPath);
    return existsSync(resolved) ? resolved : null;
  }

  for (const candidate of DEFAULT_CONFIG_PATHS) {
    const resolved = resolve(cwd, candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

export function loadProjectConfig(options?: {
  configPath?: string;
  cwd?: string;
}): ProjectConfig {
  const cwd = options?.cwd ?? process.cwd();
  const configPath =
    options?.configPath ??
    process.env.TOONED_CONFIG_PATH ??
    undefined;
  const path = resolveConfigPath(configPath, cwd);

  if (!path) {
    throw new ProjectConfigError(
      'Project config not found. Copy tooned.yaml.example to tooned.yaml or set TOONED_CONFIG_PATH.',
    );
  }

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    throw new ProjectConfigError(`Failed to parse ${path}: ${message}`);
  }

  try {
    return ProjectConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ProjectConfigError(
        `Invalid project config in ${path}: ${error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    throw error;
  }
}

export class ProjectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConfigError';
  }
}

export function getDodTemplate(
  templates: DodTemplate[],
  team: string | undefined,
): DodTemplate {
  const normalized = team?.trim() ?? '';
  const match = templates.find(
    (template) => template.team.toLowerCase() === normalized.toLowerCase(),
  );
  return match ?? templates.find((template) => template.team === 'default') ?? templates[0]!;
}

export function matchesSubtaskTemplate(subtaskSummary: string, templateSubstring: string): boolean {
  return subtaskSummary.toLowerCase().includes(templateSubstring.toLowerCase());
}

export function normalizeJql(jql: string): string {
  return jql.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function jqlMatchesExpected(actual: string, expected: string): boolean {
  return normalizeJql(actual) === normalizeJql(expected);
}

export function getFieldId(fields: Record<string, string>, name: string): string | undefined {
  const value = fields[name];
  if (!value) {
    return undefined;
  }
  if (value.startsWith('customfield_')) {
    return value;
  }
  if (/^\d+$/.test(value)) {
    return `customfield_${value}`;
  }
  return value;
}

export function suggestConfluenceHosts(
  configuredHosts: string[],
  atlassianBaseUrl: string,
): string[] {
  if (configuredHosts.length > 0) {
    return configuredHosts;
  }
  try {
    return [new URL(atlassianBaseUrl).hostname];
  } catch {
    return [];
  }
}

export function confluenceConfigWarnings(project: ProjectConfig): string[] {
  const warnings: string[] = [];
  if (project.confluence.mode === 'spaces' && project.confluence.spaces.length === 0) {
    warnings.push('confluence.mode is "spaces" but confluence.spaces is empty');
  }
  return warnings;
}
