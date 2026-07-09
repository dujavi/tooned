---
name: Tooned Phase 4 — AXI CLI
phase: 4
depends_on: [phase-02-jira-ingestion, phase-02b-sprint-api, phase-03-vcs-linking]
---

# Phase 4: AXI CLI + workflows

## Why this phase

Agents interact via `tooned` CLI with TOON stdout. Implements all user-facing commands, AXI compliance, and service client error handling.

## Prerequisites

- Phases 2, 2b, 3 complete (service API fully populated)
- Read [`.cursor/skills/axi/SKILL.md`](../skills/axi/SKILL.md) fully
- Read [TOON spec](https://toonformat.dev/reference/spec.html)

## Tasks

### 4.1 TOON boundary (`@tooned/core/toon`)

- [ ] Wrap `@toon-format/toon` `encode()`
- [ ] `projectStoryList`, `projectStoryDetail`, `projectSyncMeta` mappers
- [ ] Truncation helper: 500 char default, total size, `--full` bypass
- [ ] Always prepend `syncMeta` block

### 4.2 Service client (`@tooned/cli/client`)

- [ ] Base URL from config
- [ ] Typed fetch wrappers for all API routes
- [ ] **Service down:** catch ECONNREFUSED → structured error TOON + exit 1
- [ ] Unknown flag validation per subcommand before fetch (exit 2)

### 4.3 Core commands

- [ ] `tooned` home view:
  - [ ] `bin:` (path with `~`)
  - [ ] `description:` one sentence
  - [ ] syncMeta, current sprint name, open story count (compact)
  - [ ] `help[]` contextual hints
- [ ] `tooned sync [--force]`
- [ ] `tooned status`
- [ ] `tooned doctor` — upgrade Phase 1 output to TOON

### 4.4 Sprint commands

- [ ] `tooned sprint current [--workload]`
- [ ] `tooned sprint next [--review-pack] [--include-backlog]`
- [ ] Empty states: no future sprint, no backlog stories

### 4.5 Story commands

- [ ] `tooned stories list [--status] [--assignee] [--sprint] [--limit] [--fields]`
- [ ] `tooned stories view <KEY> [--full] [--fields]`
- [ ] `tooned stories comments <KEY> [--full]`
- [ ] `tooned stories commits <KEY>`
- [ ] `tooned stories refs <KEY>`
- [ ] `tooned stories history <KEY> [--since <ISO date>]`
- [ ] `tooned stories sizing <KEY>`

### 4.6 Sizing logic (`@tooned/core/sizing`)

- [ ] Load story + subtasks from service or shared query
- [ ] Match team → DoD template from `dod-templates.ts`
- [ ] Missing expected subtasks → signal
- [ ] Open-question heuristic: unresolved @mentions (not bare `?`)
- [ ] Output: `{ points, openSubtasks, missingDoD[], openQuestions, risk: low|medium|high }`

### 4.7 Search commands

- [ ] `tooned search <query> [--in all|comments|notes] [--sprint] [--status] [--since]`
- [ ] `tooned refs search <query>`
- [ ] Empty search definitive message (AXI §5)

### 4.8 Service routes (if not done in Phase 2)

- [ ] `GET /stories/:key/history`
- [ ] `GET /stories/:key/sizing`
- [ ] `GET /stories/:key/refs`
- [ ] `GET /refs/search`

### 4.9 AXI compliance pass

- [ ] stdout TOON only; progress on stderr
- [ ] Exit codes 0/1/2
- [ ] List views: `count: N of M total`, derived `comments`, `subtasks`, `prs`
- [ ] Per-subcommand `--help` with examples
- [ ] Bin linked in package.json: `"bin": { "tooned": "./dist/cli.js" }`

### 4.10 Smoke tests

- [ ] Golden TOON snapshot: service-down error
- [ ] Golden TOON snapshot: empty search

## Agent workflow

Execute Steps 1–6 from [phase-agent-prompt-template.md](./phase-agent-prompt-template.md). Phase **4**; finding IDs **P4-00N**. Read AXI skill + TOON spec fully before implementing.

**Watch for:** unknown-flag rejection, service-down TOON errors, syncMeta on every response, token-efficient list schemas.

## Verification

```bash
pnpm build
pnpm exec tooned doctor
pnpm exec tooned serve &
pnpm exec tooned                    # home TOON
pnpm exec tooned sprint current --workload
pnpm exec tooned sprint next --review-pack
pnpm exec tooned stories view DEMO-1
pnpm exec tooned stories sizing DEMO-1
pnpm exec tooned search modal
pnpm exec tooned refs search my-repo
# kill serve, then:
pnpm exec tooned status             # service down error TOON
pnpm test
```

## Acceptance criteria

- All commands in master plan table work end-to-end
- TOON valid per spec (manual spot check)
- Service down never dumps stack trace to stdout
- `--full` shows complete Evaluate DoD-sized content with size hint when truncated

## Handoff to Phase 5

- CLI command tree
- Sample TOON outputs saved in `tests/golden/`
- Known rough edges for golden tests

## Out of scope

- Session hooks (Phase 5)
- LLM summarize (Phase 6)
- `pnpm publish` / global install docs beyond README
