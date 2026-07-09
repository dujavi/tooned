---
name: Tooned Phase 1 — Foundation
phase: 1
depends_on: []
---

# Phase 1: Foundation + operability

## Why this phase

Establishes the monorepo, config, database shell, and service lifecycle so every later phase has a runnable `tooned serve` / `tooned doctor` baseline.

## Prerequisites

- Node 20+, pnpm installed
- `.env` with Atlassian credentials (do not commit)
- `tooned.yaml` from `tooned.yaml.example` (do not commit local overrides)
- Read master plan architecture section

## Tasks

### 1.1 Monorepo scaffold

- [x] Initialize git repo (if not already)
- [x] Create `pnpm-workspace.yaml` with `packages/*`
- [x] Root `package.json`: scripts `build`, `dev`, `test`, `lint`
- [x] TypeScript project references (`tsconfig.base.json`)
- [x] Packages (empty shells with `package.json`, `tsconfig.json`, `src/index.ts`):
  - `@tooned/core`
  - `@tooned/jira`
  - `@tooned/bitbucket`
  - `@tooned/github`
  - `@tooned/sync`
  - `@tooned/service`
  - `@tooned/cli`
- [x] `.gitignore`: `.env`, `tooned.yaml`, `data/`, `node_modules/`, `dist/`
- [x] `.env.example` (variable names only)
- [x] `tooned.yaml.example` (project config template — no secrets)
- [x] `LICENSE` (MIT)
- [x] `README.md`: project goal, `pnpm install`, `tooned doctor`, `tooned serve`

### 1.2 `@tooned/core`

- [x] Zod env schema + `tooned.yaml` project config (`ProjectConfigSchema`)
- [x] `loadConfig()` merges env + yaml (env overrides board/project/workspace)
- [x] Shared types: `SyncMeta`, `Story` (stub fields OK), `SyncStatus`
- [x] `buildSyncMeta(lastSync, syncStatus)` helper
- [x] DoD templates loaded from `tooned.yaml` (not hard-coded)
- [x] Field map loaded from `tooned.yaml` `fields:` (not hard-coded IDs in code)
- [x] Unit tests: config parses, yaml merge, env overrides

### 1.3 SQLite schema (`@tooned/sync`)

- [x] Migration runner (numbered SQL files)
- [x] Tables (columns can be minimal stubs expanded in Phase 2):
  - `sync_state`, `stories`, `subtasks`, `bugs`, `comments`, `changelog`, `linked_issues`
  - `attachments`, `extracted_refs`, `commits`, `field_registry`
  - FTS5 `story_search`, `enrichments`
- [x] `getDb(path)` singleton using `node:sqlite`
- [x] WAL mode enabled

### 1.4 `@tooned/service` HTTP shell

- [x] Hono app on `TOONED_SERVICE_PORT` (default 7420)
- [x] `GET /health` → `{ ok: true, syncMeta }`
- [x] Graceful shutdown on SIGINT/SIGTERM
- [x] `packages/service/src/main.ts` entry for `tooned serve`

### 1.5 `@tooned/cli` lifecycle commands

- [x] Commander.js root command `tooned`
- [x] `tooned serve` → runs service main
- [x] `tooned doctor`: env, config, Jira, data dir, port, optional Bitbucket warn
- [x] `tooned status` → syncMeta + story count
- [x] Service client helper: `fetchHealth()` with connection error detection
- [x] AXI structured stdout (plain text Phase 1)

### 1.6 Board verification (`doctor --verbose`)

- [x] Fetch board configuration + filter JQL via filter API
- [x] Optional compare to `jira.bootstrapJql` from `tooned.yaml` (if set)
- [x] Count query; store in `sync_state` as `bootstrapStoryCount`
- [x] Document config model in README (not instance-specific JQL in repo)

## Agent workflow

Execute in order. **Loop on Step 5** until critical and high findings are zero (max 5 iterations).

### Step 1 — Implement

Complete every task above (sections 1.1–1.6). Stay within **Out of scope**.

### Step 2 — Cleanup (before validation)

- Remove dead code, unused imports
- Strict TypeScript, no unjustified `any`
- No hard-coded project keys, field IDs, or org names in source
- `.gitignore` covers `.env`, `tooned.yaml`, `data/`

Run: `pnpm install && pnpm build && pnpm test`

### Step 3 — Validate

Run **Verification** below; confirm **Acceptance criteria**.

### Step 4 — Code review

Structured review with severity table and findings (P1-001…). Watch for: secrets in repo, DB init safety, doctor/serve crash paths.

### Step 5 — Fix loop

Fix critical + high → re-run Steps 2–4 until clean.

### Step 6 — Deliver handoff

Filled handoff section + next: `prompt-run-phase-02.md`

## Verification

```bash
pnpm install
pnpm build
pnpm test
cp tooned.yaml.example tooned.yaml   # customize for your instance
pnpm exec tooned doctor
pnpm exec tooned serve &
curl -s localhost:7420/health | jq .ok
pnpm exec tooned status
kill %1
```

## Acceptance criteria

- Monorepo builds with zero TS errors
- `.env` and `tooned.yaml` not tracked; examples committed
- SQLite file created under `TOONED_DATA_DIR` on first serve
- Doctor fails clearly when Jira token invalid
- No hard-coded project keys, field IDs, or org names in source

## Handoff to Phase 2

- Repo structure and package names
- Config: `.env` + `tooned.yaml` + `TOONED_CONFIG_PATH`
- `fieldMap` keys from yaml
- Board filter JQL from `doctor --verbose` → `sync_state.boardFilterJql`
- DB migration version: 1

## Out of scope for Phase 1

- Jira story sync, FTS content, Bitbucket calls
- TOON output (Phase 4)
- Full story types implementation
