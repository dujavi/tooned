---
name: Tooned Phase 3 — VCS linking
phase: 3
depends_on: [phase-02-jira-ingestion]
---

# Phase 3: VCS linking (Bitbucket + GitHub)

## Why this phase

Enriches stories with PR and commit metadata from Bitbucket (primary) and GitHub (secondary).

## Prerequisites

- Phase 2 complete: stories synced
- `BITBUCKET_USERNAME`, `BITBUCKET_TOKEN` optional
- `BITBUCKET_WORKSPACE` from env or `tooned.yaml` → `vcs.bitbucket.workspace`
- `GITHUB_TOKEN` optional

## Tasks

### 3.1 `@tooned/core/vcs-url`

- [ ] Parse bitbucket/github PR and commit URLs
- [ ] Extract partial SHAs from developer notes field
- [ ] Unit tests with **sanitized** sample URLs in fixtures

### 3.2 `@tooned/bitbucket`

- [ ] Auth: basic with username + app password
- [ ] `getPullRequest`, `getCommit`, `resolveShortSha`, `getDiffstat`

### 3.3 `@tooned/github`

- [ ] `getPullRequest`, `getCommit` — shared `VcsClient` shape in core

### 3.4 `@tooned/sync/vcs-enrich`

- [ ] On story upsert: parse dev notes + remote links → queue VCS fetches
- [ ] Store commits in `commits` table

### 3.5 Service endpoints

- [ ] `GET /stories/:key/commits`
- [ ] `GET /refs/search?q=`

## Agent workflow

Execute Steps 1–6 from [phase-agent-prompt-template.md](./phase-agent-prompt-template.md). Phase **3**; finding IDs **P3-00N**. Loop Step 5 until critical/high = 0.

**Watch for:** graceful skip when VCS creds missing, no hard-coded workspace/repo names, sanitized URL fixtures.

## Verification

```bash
pnpm test
pnpm exec tooned serve &
curl "localhost:7420/stories/DEMO-1/commits" | jq .   # use fixture-backed key in dev
```

## Acceptance criteria

- PR metadata stored when credentials configured
- Graceful skip when Bitbucket/GitHub not configured (doctor warn only)
- No hard-coded workspace or repo names in source

## Out of scope

- TOON CLI (Phase 4)
