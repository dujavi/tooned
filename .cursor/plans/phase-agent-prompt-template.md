# Phase agent prompt template

Copy everything inside the fenced block below into a **new agent session**. Replace `{PHASE}`, `{PLAN_FILE}`, and `{PRIOR_HANDOFF}`.

---

## PROMPT (copy from here)

```
You are implementing **Tooned — Phase {PHASE}** in the project root.

## Authority (read first)
1. Phase plan: .cursor/plans/{PLAN_FILE}
2. AXI standards (for CLI work): .cursor/skills/axi/SKILL.md
3. Configuration: `.env` (secrets) + `tooned.yaml` (project/fields) — no hard-coded org or field IDs

## Prior phase handoff
{PRIOR_HANDOFF}

## Workflow — execute in order, loop on step 5 until clean

### Step 1 — Implement
- Complete every task in the phase plan (checkboxes).
- Stay within phase **Out of scope**.
- Use `config.fieldMap`, `config.dodTemplates`, and yaml-driven settings — not hard-coded Jira customizations.
- Never commit `.env`, `tooned.yaml`, or secrets.

### Step 2 — Cleanup (before validation)
Apply best practices to **only this phase's changes**:
- Remove dead code, unused imports, commented-out blocks
- Consistent naming and package boundaries (`@tooned/*`)
- Strict TypeScript — no `any` unless justified in comment
- Single responsibility; no premature abstractions
- Errors: actionable messages, no swallowed exceptions
- Config via Zod + env + tooned.yaml; no hardcoded credentials or field IDs
- README / tooned.yaml.example updated if new config keys added

Run: `pnpm build && pnpm test` (fix failures before step 3).

### Step 3 — Validate
Run **every command** in the phase plan's **Verification** section. Fix until all pass.

Also confirm **Acceptance criteria** in the phase plan.

### Step 4 — Code review (no Bugbot — you are the reviewer)
Perform a structured review of **this phase's diff** (all new/changed files). Output:

#### Review summary
| Severity | Count |
|---|---|
| critical | N |
| high | N |
| medium | N |
| low | N |

#### Findings (each item)
- **ID**: P{PHASE}-001
- **Severity**: critical | high | medium | low
- **File**: path:line
- **Issue**: one sentence
- **Fix**: concrete action

**Severity guide**
- **critical**: security (secrets, injection), data loss, crash on normal path, breaks verification
- **high**: incorrect behavior vs phase plan, missing error handling on external calls, race that corrupts store
- **medium**: maintainability, missing edge case, weak typing, incomplete tests for new logic
- **low**: style, naming nit, optional polish

**Do not** report medium/low as blockers unless trivial to fix in the same pass.

### Step 5 — Fix loop
- If **any critical or high** findings exist: fix them, re-run Step 2 (cleanup) + Step 3 (validate), then **Step 4** again.
- Repeat until **critical = 0 and high = 0**.
- Maximum 5 review iterations; if still blocked, list remaining issues and stop.

### Step 6 — Deliver handoff
When clean, output:

1. **Phase complete** — one paragraph what was built
2. **Verification output** — paste key command results
3. **Review summary** — final counts (all zeros for critical/high)
4. **Handoff** — copy the phase plan's Handoff section filled in with real values (paths, counts, JQL, sample keys, quirks)
5. **Next agent prompt** — single line: which phase plan file to run next

Do not start the next phase in this session.
```

---

## Placeholder reference

| Phase | `{PHASE}` | `{PLAN_FILE}` | `{PRIOR_HANDOFF}` |
|---|---|---|---|
| 1 | 1 | phase-01-foundation.md | None — greenfield |
| 2 | 2 | phase-02-jira-ingestion.md | Paste Phase 1 Handoff |
| 2b | 2b | phase-02b-sprint-api.md | Paste Phase 2 Handoff |
| 3 | 3 | phase-03-vcs-linking.md | Paste Phase 2 Handoff |
| 4 | 4 | phase-04-axi-cli.md | Paste 2 + 2b + 3 handoffs (brief) |
| 5 | 5 | phase-05-tests-hooks.md | Paste Phase 4 Handoff |
| 6 | 6 | phase-06-llm-enrichment.md | Paste Phase 5 Handoff |

Phases **2b** and **3** can run in parallel after Phase 2 (both use Phase 2 handoff).
