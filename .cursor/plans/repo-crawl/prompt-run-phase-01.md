# Ready-to-run: Repo-crawl track — Phase 1

Copy the entire block below into a new Cursor agent chat.

---

```
You are implementing **Tooned — Repo-crawl track Phase 1** in the project root.

## Authority (read first)
1. Phase plan: .cursor/plans/repo-crawl/phase-01-vcs-accounts.md
2. Confluence track (must be complete): .cursor/plans/confluence/README.md
3. AXI standards: .cursor/skills/axi/SKILL.md

## Prior phase handoff
Confluence track Phases 1–3 complete. Federated search exists with --in code stubbed. Paste Confluence Phase 3 handoff if available.

## Workflow — execute in order, loop on step 5 until clean

### Step 1 — Implement
Complete every task in phase-01-vcs-accounts.md (sections 1.1–1.5):
- Multi-account vcs config schema with backward compat
- Per-account Bitbucket/GitHub client factory
- listRepositories + source file APIs on both providers
- Doctor account probes

Out of scope: code_search migration, repo-sync pipeline, --in code results.

### Step 2 — Cleanup
Run: `pnpm install && pnpm build && pnpm test`
Never commit .env, tooned.yaml, or secrets.

### Step 3 — Validate
Run every command in the phase plan Verification section.

### Step 4 — Code review
Findings PR1-001…

### Step 5 — Fix loop
Fix critical + high until clean (max 5 iterations).

### Step 6 — Handoff
Next: .cursor/plans/repo-crawl/phase-02-repo-index.md

Do not start Phase 2 in this session.
```
