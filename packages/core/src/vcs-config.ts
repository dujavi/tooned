import { z } from 'zod';

export const VcsAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(['bitbucket', 'github']),
  workspace: z.string().min(1).optional(),
  org: z.string().min(1).optional(),
  usernameEnv: z.string().min(1).optional(),
  tokenEnv: z.string().min(1),
});

const VcsRepoSlugTargetSchema = z.object({
  account: z.string().min(1),
  slug: z.string().min(1),
  localPath: z.string().min(1).optional(),
  source: z.enum(['auto', 'api', 'local', 'cache']).optional(),
});

export const VcsRepoTargetSchema = z.union([
  VcsRepoSlugTargetSchema,
  z.object({
    account: z.string().min(1),
    scope: z.enum(['workspace', 'org']),
  }),
]);

export type VcsRepoSlugTarget = z.infer<typeof VcsRepoSlugTargetSchema>;
export type RepoSourceMode = VcsRepoSlugTarget['source'];

export type VcsAccountConfig = z.infer<typeof VcsAccountSchema>;
export type VcsRepoTarget = z.infer<typeof VcsRepoTargetSchema>;

export const VcsConfigSchema = z
  .object({
    bitbucket: z
      .object({
        workspace: z.string().min(1).optional(),
      })
      .optional(),
    urlDomains: z
      .object({
        form: z.array(z.string()).default([]),
        confluence: z.array(z.string()).default([]),
      })
      .default({ form: [], confluence: [] }),
    accounts: z.array(VcsAccountSchema).default([]),
    repos: z.array(VcsRepoTargetSchema).default([]),
    repoCacheDir: z.string().min(1).optional(),
    maxFileBytes: z.number().int().positive().default(262_144),
  })
  .superRefine((value, ctx) => {
    const accountIds = new Set(value.accounts.map((account) => account.id));
    for (const [index, repo] of value.repos.entries()) {
      if (!accountIds.has(repo.account)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['repos', index, 'account'],
          message: `repo references unknown account "${repo.account}"`,
        });
      }
    }
    for (const [index, account] of value.accounts.entries()) {
      if (account.provider === 'bitbucket' && !account.workspace && !value.bitbucket?.workspace) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accounts', index, 'workspace'],
          message: 'bitbucket account requires workspace or vcs.bitbucket.workspace',
        });
      }
    }
  });

export type VcsConfig = z.infer<typeof VcsConfigSchema>;

export interface ResolvedVcsAccount {
  id: string;
  provider: 'bitbucket' | 'github';
  workspace?: string;
  org?: string;
  username?: string;
  token: string;
  configured: boolean;
}

export function synthesizeLegacyVcsAccounts(input: {
  accounts: VcsAccountConfig[];
  bitbucketWorkspace?: string;
  env: NodeJS.ProcessEnv;
}): VcsAccountConfig[] {
  if (input.accounts.length > 0) {
    return input.accounts;
  }

  const synthesized: VcsAccountConfig[] = [];
  if (input.env.BITBUCKET_USERNAME && input.env.BITBUCKET_TOKEN) {
    synthesized.push({
      id: 'default',
      provider: 'bitbucket',
      workspace: input.bitbucketWorkspace,
      usernameEnv: 'BITBUCKET_USERNAME',
      tokenEnv: 'BITBUCKET_TOKEN',
    });
  }
  if (input.env.GITHUB_TOKEN) {
    synthesized.push({
      id: 'default-github',
      provider: 'github',
      tokenEnv: 'GITHUB_TOKEN',
    });
  }
  return synthesized;
}

export function resolveVcsAccounts(input: {
  accounts: VcsAccountConfig[];
  bitbucketWorkspace?: string;
  env?: NodeJS.ProcessEnv;
}): ResolvedVcsAccount[] {
  const env = input.env ?? process.env;
  const accounts = synthesizeLegacyVcsAccounts({
    accounts: input.accounts,
    bitbucketWorkspace: input.bitbucketWorkspace,
    env,
  });

  return accounts.map((account) => {
    const token = env[account.tokenEnv]?.trim() ?? '';
    let username = account.usernameEnv ? env[account.usernameEnv]?.trim() : undefined;
    if (account.provider === 'bitbucket' && !username) {
      username = env.ATLASSIAN_EMAIL?.trim();
    }
    return {
      id: account.id,
      provider: account.provider,
      workspace:
        account.provider === 'bitbucket'
          ? account.workspace ?? input.bitbucketWorkspace
          : undefined,
      org: account.provider === 'github' ? account.org : undefined,
      username,
      token,
      configured:
        account.provider === 'bitbucket'
          ? Boolean(username && token)
          : Boolean(token),
    };
  });
}

export function summarizeVcsRepoTargets(repos: VcsRepoTarget[]): string {
  if (repos.length === 0) {
    return 'no repo crawl targets configured';
  }
  const parts = repos.map((repo) => {
    if ('slug' in repo) {
      const suffix =
        repo.localPath !== undefined
          ? `@${repo.localPath}${repo.source && repo.source !== 'auto' ? ` (${repo.source})` : ''}`
          : repo.source && repo.source !== 'auto'
            ? ` (${repo.source})`
            : '';
      return `${repo.account}:${repo.slug}${suffix}`;
    }
    return `${repo.account}:${repo.scope}`;
  });
  return parts.join(', ');
}
