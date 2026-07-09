---
name: Tooned Phase 2 — Jira ingestion
phase: 2
depends_on: [phase-01-foundation]
---

# Phase 2: Jira ingestion + sync pipeline

## Why this phase

Populates the local store from Jira: stories, subtasks, linked bugs, comments, changelog, attachments, refs, FTS. This is the data layer everything else reads.

## Prerequisites

- Phase 1 complete and verified
- Handoff: board filter JQL, bootstrap story count, DB path, `fieldMap` from `tooned.yaml`
- No hard-coded field IDs — use `config.fieldMap` and `getFieldId()`

## Tasks

### 2.1 `@tooned/jira` client

- [ ] Basic auth client (`ATLASSIAN_EMAIL` + `ATLASSIAN_TOKEN`)
- [ ] `searchIssues(jql, fields, pagination)` with rate limit wrapper
- [ ] `getIssue(key, fields, expand?)`
- [ ] `getChangelog(issueId)` paginated
- [ ] Curated `STORY_FIELDS` built from `config.fieldMap` + standard fields
- [ ] Dev-status: `getDevStatus(issueId, appType, dataType)`

### 2.2 ADF → markdown (`@tooned/jira/adf`)

- [ ] Convert ADF doc to markdown/plain text
- [ ] Handle mentions, links, lists, code blocks
- [ ] Unit tests with **sanitized** inline ADF fixtures (`tests/fixtures/`)

### 2.3 Description parsing (`@tooned/jira/sections`)

- [ ] Parse: userStory, requirements, sme, acceptanceCriteria[], notes
- [ ] SME regex: `**SME**:\s*(.+)` (multiline) — configurable pattern in yaml optional
- [ ] AC extraction: `AC\d+` blocks with GIVEN/WHEN/THEN
- [ ] Unit tests with sanitized description fixture

### 2.4 URL extraction (`@tooned/jira/refs`)

- [ ] Extract URLs from markdown text + ADF link nodes
- [ ] Tag `domain`: confluence | bitbucket | github | form | jira | other
- [ ] Form/confluence hosts from `tooned.yaml` → `vcs.urlDomains`

### 2.5 `@tooned/sync` orchestration

- [ ] **Bootstrap:** board-scoped JQL from filter or `bootstrapJql`, paginated, resumable checkpoint
- [ ] **Delta:** `updated >= lastSync` for Story, Sub-task, Bug (issue types from config)
- [ ] **Parent refresh:** subtask delta → queue parent story re-fetch
- [ ] Rate limit: max `JIRA_MAX_CONCURRENT`, backoff 429/503
- [ ] Upsert: stories, subtasks, comments, changelog, attachments, extracted_refs
- [ ] Linked **Bug** shallow sync (one hop from issuelinks)
- [ ] Changelog: full on bootstrap; on delta only if `sourceUpdatedAt` changed
- [ ] Compute `doneAt` from changelog status → Done transition
- [ ] JSON audit blob: `data/issues/{KEY}.json`
- [ ] Update `sync_state`: `lastSync`, `syncStatus`, checkpoint keys
- [ ] Background poll loop in service (`TOONED_SYNC_INTERVAL_MS`)

### 2.6 FTS5

- [ ] Rebuild/update `story_search` on upsert
- [ ] Refs stored in `extracted_refs` for Phase 4

### 2.7 Service API endpoints

- [ ] `POST /sync`, `GET /sync/status`
- [ ] `GET /stories`, `GET /stories/:key`, `GET /search?q=`

### 2.8 Fixtures

- [ ] `tests/fixtures/sample-story-minimal.json` — sanitized issue payload
- [ ] `tests/fixtures/sample-description.txt` — parser tests

## Agent workflow

Execute in order. **Loop on Step 5** until critical and high findings are zero (max 5 iterations). Do not start Phase 2b/3 in the same session.

### Step 1 — Implement

- Complete every task above (sections 2.1–2.8).
- Stay within **Out of scope**.
- Use `config.fieldMap`, `getFieldId()`, and yaml-driven settings — no hard-coded Jira field IDs or org names.
- Never read or commit `.env`, `tooned.yaml`, or secrets.

### Step 2 — Cleanup (before validation)

Apply best practices to **only this phase's changes**:

- Remove dead code, unused imports, commented-out blocks
- Strict TypeScript — no unjustified `any`
- Parameterized SQL only (no string interpolation into queries)
- Jira/API errors handled and translated — no token leakage in logs or stdout
- Sanitized fixtures only in tests (no real issue keys or company URLs)
- Update `tooned.yaml.example` / README if new config keys added

Run: `pnpm install && pnpm build && pnpm test` — fix failures before Step 3.

### Step 3 — Validate

Run **every command** in **Verification** below. Confirm all **Acceptance criteria**.

Manual if possible: edit a subtask in Jira → delta sync → parent aggregates update.

### Step 4 — Code review (no Bugbot — you are the reviewer)

Review **all new/changed files**. Output:

| Severity | Count |
|---|---|
| critical | ? |
| high | ? |
| medium | ? |
| low | ? |

Each finding: **ID** (P2-001…), **severity**, **file:line**, **issue**, **fix**.

**Severity guide**

- **critical**: secrets exposed, SQL injection, crash on sync/serve happy path, data loss
- **high**: phase requirement missing, Jira calls without error handling, parent refresh bug, bootstrap not resumable
- **medium / low**: non-blocking

**Watch for:** rate-limit handling, 429/503 backoff, parent refresh on subtask delta, checkpoint resume, hard-coded field IDs.

### Step 5 — Fix loop

Fix all **critical + high** → re-run Steps 2–4 until critical = 0 and high = 0.

### Step 6 — Deliver handoff

1. What was built (short paragraph)
2. Verification command output
3. Final review counts (critical/high must be 0)
4. Filled **Handoff to Phase 2b** section below
5. Next line: `Run prompt-run-phase-02b.md` and/or `prompt-run-phase-03.md`

## Verification

```bash
pnpm exec tooned serve &
pnpm exec tooned sync --force
pnpm exec tooned status          # lastSync set, story count > 0
curl "localhost:7420/stories?limit=3"
curl "localhost:7420/search?q=modal"
pnpm test
```

## Acceptance criteria

- Bootstrap completes resumably
- Stories stored with fields from `fieldMap`
- Subtask change refreshes parent aggregates
- Linked bug shallow record works
- FTS finds keyword from description or comments
- All API responses include `syncMeta`
- Tests use fixtures only (no live Jira in CI)

## Handoff to Phase 2b

- Confirmed JQL used for bootstrap
- Sample story keys in DB (list 3)
- `sync_state` keys documented
- Field map keys confirmed against Jira `/field` API

## Out of scope

- Sprint Agile API (Phase 2b)
- Bitbucket commit enrich (Phase 3)
- TOON CLI output (Phase 4)
