---
name: Repo-crawl track — Phase 2
phase: repo-02
depends_on: [repo-01]
track: repo-crawl
---

# Phase 2: Repo index sync

## Why this phase

Crawls configured repositories into a `code_search` FTS index on `tooned sync --force`.

## Prerequisites

- Phase 1 handoff: multi-account config + list/source APIs
- At least one account with valid creds for local verification (optional in CI)

## Tasks

### 2.1 Migration `006_code_search.sql`

- [ ] `code_files` — `account_id`, `provider`, `repository`, `path`, `ref`, `language`, `size`, `source_updated_at`, `synced_at`
- [ ] `code_search` FTS5 — `repository`, `path`, `content` (porter)
- [ ] `sync_state`: `codeBootstrapComplete`, `codeBootstrapCheckpoint` (per-repo progress JSON)

### 2.2 File crawl policy

- [ ] Denylist extensions: images, fonts, archives, lockfiles optional
- [ ] Denylist paths: `node_modules`, `dist`, `.git`, `vendor`, `coverage`
- [ ] Max file bytes from config (default 256KB); skip larger with log
- [ ] Text detection: extension + MIME heuristic

### 2.3 `repo-sync.ts`

- [ ] `runRepoSync(db, config, { force? })` — resolve repo list from `vcs.repos` (expand workspace/org scope)
- [ ] Per repo: walk tree at `HEAD` (or default branch from API), upsert `code_files`, rebuild FTS
- [ ] Checkpoint per `account/repo` for resume
- [ ] Audit optional: `data/repos/{account}/{slug}/manifest.json` (path list + hashes, not every file body)

### 2.4 Pipeline integration

- [ ] Call `runRepoSync` after `runConfluenceSync` on force or incomplete
- [ ] Skip accounts with missing creds; continue others

### 2.5 DB helpers

- [ ] `upsertCodeFile`, `deleteStaleCodeFiles(repo, ref)`
- [ ] `getCodeFile`, `listReposIndexed`, `getCodeFileCount`
- [ ] `searchCode(db, query, limit)` — FTS query (used in Phase 3)

## Agent workflow

Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs **PR2-00N**.

**Watch for:** rate limits on Bitbucket/GitHub APIs, idempotent re-sync, no full repo binary slurping.

## Verification

```bash
pnpm build && pnpm test
pnpm exec tooned sync --force     # with valid VCS creds locally
pnpm exec tooned status           # code file count when configured
```

## Acceptance criteria

- Configured repos indexed into `code_search`
- Checkpoint resume works in tests
- Missing creds skip gracefully; Jira + Confluence sync unaffected
- CI uses fixtures only

## Handoff to Phase 3

- Migration version, indexed repo slugs from dev run
- Sample file path for `code view` verification
- `searchCode` function signature

## Out of scope

- CLI `repos` / `code view` commands
- Wiring `--in code` in HTTP/CLI (Phase 3)
- PR-level code search (commits table unchanged)
