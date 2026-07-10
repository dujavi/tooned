# Ready-to-run: Confluence track — Phase 1

Copy the entire block below into a new Cursor agent chat.

---

```
You are implementing **Tooned — Confluence track Phase 1** in the project root.

## Authority (read first)
1. Phase plan: .cursor/plans/confluence/phase-01-client-and-config.md
2. Context: .cursor/plans/confluence/exploration-notes.md
3. AXI standards: .cursor/skills/axi/SKILL.md
4. Base plans (already shipped): .cursor/plans/README.md

## Prior phase handoff
Base Tooned Phases 1–5 complete. Jira sync, SQLite, CLI, and service are live. Do not rebuild foundation packages.

## Workflow — execute in order, loop on step 5 until clean

### Step 1 — Implement
Complete every task in phase-01-client-and-config.md (sections 1.1–1.5):
- Fix refs.ts wiki → confluence classification
- confluence config in tooned.yaml schema
- New @tooned/confluence package: client, CQL helpers, storage→markdown, attachment MIME gates
- Sanitized fixtures only in tests

Out of scope: SQLite migration, sync pipeline, search CLI, repo crawl.

### Step 2 — Cleanup
- Match existing @tooned/* package patterns
- Strict TypeScript, parameterized tests
- Update tooned.yaml.example if config keys added
- Never commit .env, tooned.yaml, or secrets

Run: `pnpm install && pnpm build && pnpm test`

### Step 3 — Validate
Run every command in the phase plan Verification section.

### Step 4 — Code review
Output severity table + findings (PC1-001…).

### Step 5 — Fix loop
Fix critical + high until clean (max 5 iterations).

### Step 6 — Handoff
Fill Handoff section from phase plan with real paths and fixture notes.
Next: .cursor/plans/confluence/phase-02-sync-and-store.md

Do not start Phase 2 in this session.
```
