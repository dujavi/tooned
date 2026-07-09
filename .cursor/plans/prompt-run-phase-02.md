# Ready-to-run: Phase 2 (after Phase 1 complete)

Paste Phase 1 **Handoff** into the block below, or attach it above the prompt.

---

```
You are implementing **Tooned — Phase 2** in the project root.

## Authority (read first)
1. Phase plan: .cursor/plans/phase-02-jira-ingestion.md (tasks + Agent workflow)
2. AXI standards: .cursor/skills/axi/SKILL.md (reference for error/output patterns)
3. Configuration: `.env` (secrets) + `tooned.yaml` (field map) — no hard-coded field IDs

## Prior phase handoff
[PASTE PHASE 1 HANDOFF HERE]

## Workflow — execute in order, loop on step 5 until clean

### Step 1 — Implement
Complete every task in phase-02-jira-ingestion.md (sections 2.1–2.8):
- @tooned/jira client, ADF→md, section parser, refs extraction
- @tooned/sync bootstrap + delta, parent refresh on subtask delta
- Linked Bug shallow sync, changelog, FTS5
- POST /sync, GET /stories, GET /search
- Sanitized fixtures in tests/fixtures/

Use config.fieldMap and getFieldId() — not hard-coded custom field IDs.

Out of scope: Sprint Agile API (2b), Bitbucket (3), TOON CLI (4).

### Step 2 — Cleanup (before validation)
Apply best practices to only this phase's changes:
- Remove dead code, unused imports
- Strict TypeScript, no unjustified `any`
- Parameterized SQL; no secrets/tokens in logs
- Sanitized test fixtures only (no CRM-5673, no org URLs in repo)
- README / tooned.yaml.example if new config keys

Run: `pnpm install && pnpm build && pnpm test`

### Step 3 — Validate
Run every command in the phase plan Verification section:

pnpm exec tooned serve &
pnpm exec tooned sync --force
pnpm exec tooned status
curl "localhost:7420/stories?limit=3"
curl "localhost:7420/search?q=modal"
pnpm test
kill %1

Confirm all Acceptance criteria. Manually verify subtask edit → parent aggregate if possible.

### Step 4 — Code review (no Bugbot — you are the reviewer)
Review all new/changed files. Output table:

| Severity | Count |
| critical | ? |
| high | ? |
| medium | ? |
| low | ? |

List each finding: ID (P2-001…), severity, file:line, issue, fix.

Watch for: rate limits, SQL injection, parent refresh bug, bootstrap resume, token leaks, hard-coded field IDs.

### Step 5 — Fix loop
Fix all critical + high → re-run Steps 2–4 until critical=0 and high=0 (max 5 iterations).

### Step 6 — Deliver handoff
1. What was built (short paragraph)
2. Verification command output
3. Final review counts
4. Filled Handoff for Phase 2b/3: bootstrap JQL, 3 sample story keys, sync_state keys, Jira quirks
5. Next line for user: "Run prompt-run-phase-02b.md and/or prompt-run-phase-03.md"

Do not start Phase 2b or Phase 3 in this session.
```
