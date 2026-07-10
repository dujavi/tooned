---
name: Confluence track — Phase 3
phase: confluence-03
depends_on: [confluence-02]
track: confluence
---

# Phase 3: Federated search + pages CLI

## Why this phase

Exposes Confluence via agent-friendly search and browse commands. Lays federated search framework; `--in code` stubs until repo track.

## Prerequisites

- Phase 2 handoff: pages in DB, FTS populated, sample page IDs
- Service + CLI patterns from base Phase 4 (TOON output)

## Tasks

### 3.1 Search layer (`@tooned/sync/db.ts`)

- [ ] `searchPages(db, query, limit)` — FTS on `confluence_search`
- [ ] `searchGlobal(db, query, limit)` — top N per source: stories + docs; code returns `[]` with metadata flag
- [ ] Keep `searchStories()` backward compatible; default `--in` without value = federated `all` OR document explicit `stories` (match AXI skill)

### 3.2 HTTP routes (`@tooned/service`)

- [ ] Extend `GET /search` — `in=stories|docs|code|all|comments|notes`
- [ ] `code` scope: `{ results: [], codeSearchStatus: "not_configured", help: [...] }`
- [ ] `GET /pages/:id`, `GET /pages/search?q=`
- [ ] All responses include `syncMeta` + confluence page count in meta where useful

### 3.3 CLI

- [ ] Extend `tooned search` — `--in stories|docs|code|all|comments|notes`
- [ ] TOON output: `source` field per hit (`story` | `doc` | `code`)
- [ ] `tooned pages view <pageId|url>` — resolve URL, show title, space, labels, excerpt
- [ ] `tooned pages list --space CRM --limit 20`
- [ ] Update flag validation in `cli/src/index.ts`
- [ ] `pnpm generate:skill` / home view: page count, confluence sync state

### 3.4 Doctor + status

- [ ] Confluence CQL count or space list probe
- [ ] Report `confluenceBootstrapComplete`, page count, `confluenceLastSync`
- [ ] Warn on empty `spaces` when `mode: spaces`

### 3.5 Tests

- [ ] FTS integration test with fixture pages in DB
- [ ] CLI golden/output test for `search --in docs` and `--in all`
- [ ] Federated search returns both story and doc hits when fixtures present

## Agent workflow

Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs **PC3-00N**.

**Watch for:** AXI `--in` flag semantics, empty `code` scope is explicit not silent, TOON field stability.

## Verification

```bash
pnpm build && pnpm test
pnpm exec tooned doctor --verbose
pnpm exec tooned search "workflow" --in docs
pnpm exec tooned search "workflow" --in all
pnpm exec tooned search "workflow" --in code    # empty + help
pnpm exec tooned pages view <pageId>
pnpm exec tooned pages list --space CRM --limit 5
curl "localhost:7420/search?q=workflow&in=docs"
pnpm generate:skill --check
```

## Acceptance criteria

- Docs search returns Confluence FTS hits
- Global search returns tagged results from stories and docs
- `--in code` returns structured empty state with help (not an error)
- `pages view` / `pages list` work against synced data
- Skill check passes

## Handoff to repo-crawl track

- Search scope enum and HTTP query params documented
- Sample search queries that hit docs
- `searchGlobal` extension point for code (where to plug `searchCode`)
- Next: [repo-crawl/prompt-run-phase-01.md](../repo-crawl/prompt-run-phase-01.md)

## Out of scope

- Repo indexing, `code_search` table, multi-account VCS creds
- Periodic Confluence delta sync
- PDF/Office attachment text
