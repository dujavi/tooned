# Ready-to-run: Phase 1

Copy the entire block below into a new Cursor agent chat.

---

```
You are implementing **Tooned — Phase 1** in the project root.

## Authority (read first)
1. Phase plan: .cursor/plans/phase-01-foundation.md
2. AXI standards: .cursor/skills/axi/SKILL.md (doctor/status output shape only for now)

## Prior phase handoff
None — greenfield or OSS-adapted baseline. Do not read or commit `.env` or `tooned.yaml`.

## Workflow — execute in order, loop on step 5 until clean

### Step 1 — Implement
Complete every task in phase-01-foundation.md (sections 1.1–1.6):
- pnpm monorepo with packages: core, jira, bitbucket, github, sync, service, cli
- @tooned/core: env + tooned.yaml config, SyncMeta, DoD/fields from yaml
- SQLite schema + migrations + WAL
- Hono service: GET /health, graceful shutdown
- CLI: tooned, tooned serve, tooned doctor, tooned status
- Board filter verification in doctor --verbose (optional bootstrapJql from yaml)

Out of scope: Jira story sync, TOON output, Bitbucket API calls.

### Step 2 — Cleanup
- No hard-coded project keys, field IDs, or org-specific defaults in source
- strict TypeScript, no unjustified `any`
- .gitignore covers .env, tooned.yaml, data/, node_modules/, dist/
- LICENSE, CONTRIBUTING.md, tooned.yaml.example

Run: `pnpm install && pnpm build && pnpm test`

### Step 3 — Validate
pnpm install && pnpm build && pnpm test
cp tooned.yaml.example tooned.yaml  # fill in test values
pnpm exec tooned doctor
pnpm exec tooned serve & ; sleep 2 ; curl -s localhost:7420/health ; pnpm exec tooned status ; kill %1

### Step 4 — Code review
Output severity table + findings (P1-001…).

### Step 5 — Fix loop
Fix critical + high until clean (max 5 iterations).

### Step 6 — Handoff
Repo layout, config model, migration version, run commands.
Next: Run prompt-run-phase-02.md

Do not start Phase 2 in this session.
```
