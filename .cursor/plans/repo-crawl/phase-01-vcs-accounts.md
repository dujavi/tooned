---
name: Repo-crawl track — Phase 1
phase: repo-01
depends_on: [confluence-03]
track: repo-crawl
---

# Phase 1: Multi-account VCS config

## Why this phase

Supports org/workspace-level and per-repo crawl targets with named credential sets. Preserves backward compatibility with single `BITBUCKET_*` / `GITHUB_TOKEN`.

## Prerequisites

- Confluence track Phase 3 complete (federated search shell exists)
- Base `@tooned/bitbucket` and `@tooned/github` packages present

## Tasks

### 1.1 Config schema (`@tooned/core`)

- [ ] `vcs.accounts[]`: `id`, `provider` (`bitbucket` | `github`), `workspace` or `org`, credential env refs (`usernameEnv`, `tokenEnv`)
- [ ] `vcs.repos[]`: `account`, `slug` (single repo) **or** `scope: workspace | org` (entire account)
- [ ] Zod validation: repo entries reference valid account ids
- [ ] Backward compat: when `accounts` empty, synthesize `default` from legacy env vars + `vcs.bitbucket.workspace`
- [ ] Update `tooned.yaml.example` with commented multi-account sample

### 1.2 Client factory (`@tooned/core` or bitbucket/github)

- [ ] `getVcsClient(config, accountId): VcsClient | null`
- [ ] Bitbucket: per-account username + token
- [ ] GitHub: per-account token
- [ ] Existing story VCS enrich uses default account unless URL implies otherwise

### 1.3 Bitbucket repo listing

- [ ] `listRepositories(workspace)` paginated
- [ ] `listSourcePaths(repo, ref?)` — directory walk via src API (paginated)
- [ ] `getSourceFile(repo, path, ref?)` — raw content
- [ ] Unit tests with sanitized API response fixtures

### 1.4 GitHub repo listing

- [ ] `listRepositories(org)` paginated
- [ ] `getRepoTree` / content API equivalent for file walk
- [ ] `getFileContent(repo, path, ref?)`
- [ ] Fixture tests

### 1.5 Doctor

- [ ] Per-account auth probe (optional warn, not fail)
- [ ] List configured accounts and repo scope summary

## Agent workflow

Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs **PR1-00N**.

**Watch for:** no tokens in yaml, graceful skip when account creds missing, no hard-coded workspace names.

## Verification

```bash
pnpm build && pnpm test
pnpm exec tooned doctor --verbose
```

## Acceptance criteria

- Multi-account schema validates; legacy single-account config still works
- List/get source APIs tested with fixtures
- Doctor reports account status without leaking secrets

## Handoff to Phase 2

- Config shape and env var naming convention
- Account ids in example yaml
- API methods available for repo crawl

## Out of scope

- `code_search` table, repo sync pipeline
- `--in code` wired to real results
- Git clone (API-only crawl)
