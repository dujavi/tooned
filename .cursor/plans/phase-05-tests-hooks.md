---
name: Tooned Phase 5 — Tests and agent hooks
phase: 5
depends_on: [phase-04-axi-cli]
---

# Phase 5: Tests + agent integration

## Why this phase

Hardens quality with fixtures/golden tests and wires tooned into agent session lifecycle.

## Prerequisites

- Phase 4 complete: full CLI working
- Sanitized fixtures in repo (no real issue keys required for CI)

## Tasks

### 5.1 Fixtures

- [ ] `tests/fixtures/sample-story.json` — sanitized issue export
- [ ] `tests/fixtures/sample-description.txt` — parser tests
- [ ] `tests/fixtures/agile-sprints.json` — mock active + future sprint

### 5.2 Unit tests (vitest)

- [ ] `@tooned/jira/adf`, `@tooned/jira/sections`
- [ ] `@tooned/core` — DoD templates from yaml config
- [ ] `@tooned/core/sizing` — open-question heuristic
- [ ] `@tooned/core/vcs-url`
- [ ] `@tooned/sync` — parent refresh mock

### 5.3 Golden TOON tests

- [ ] `tests/golden/home.toon`, `service-down.toon`, `sprint-review-pack.toon`, `empty-search.toon`

### 5.4 CI

- [ ] GitHub Actions: `pnpm install && pnpm build && pnpm test && pnpm lint`
- [ ] No Jira secrets on public PRs

### 5.5 `tooned setup hooks`

- [ ] SessionStart hook per AXI §7 (Cursor, Claude Code, Codex, OpenCode as feasible)

### 5.6 Skill generation

- [ ] `pnpm generate:skill` → `.cursor/skills/tooned/SKILL.md`
- [ ] `--check` mode for CI staleness

### 5.7 README

- [ ] Quickstart, config guide, hook vs skill

## Agent workflow

Execute Steps 1–6 from [phase-agent-prompt-template.md](./phase-agent-prompt-template.md). Phase **5**; finding IDs **P5-00N**.

**Watch for:** CI runs without live Jira, golden TOON tests stable (mock clock for syncMeta), no org-specific fixture data.

## Verification

```bash
pnpm test
pnpm generate:skill
pnpm generate:skill --check
```

## Acceptance criteria

- `pnpm test` green without live Jira
- Golden tests catch TOON regressions
- SKILL.md generated from CLI (no org-specific examples)

## Out of scope

- LLM calls in tests
- Production Jira E2E in CI
