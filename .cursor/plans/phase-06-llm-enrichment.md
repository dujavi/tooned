---
name: Tooned Phase 6 — LLM enrichment
phase: 6
depends_on: [phase-05-tests-hooks]
optional: true
---

# Phase 6: LLM enrichment (optional)

## Why this phase

Adds cached AI summaries for Friday review-pack (`implementationHint`) and on-demand `summarize`. Optional — Phases 1–5 deliver full read-only value without LLM cost.

## Prerequisites

- Phase 5 complete
- `LLM_API_KEY`, `LLM_BASE_URL` (OpenAI-compatible), `LLM_MODEL` configured
- Phase 2 delta sync working

## Tasks

### 6.1 `@tooned/enrich` package

- [ ] Add to monorepo workspace
- [ ] `EnrichmentProvider` interface: `complete(prompt, maxTokens)`
- [ ] OpenAI-compatible implementation (fetch chat completions)
- [ ] No-op provider when `LLM_API_KEY` unset

### 6.2 Storage

- [ ] `enrichments` table: `storyKey`, `type`, `contentHash`, `content`, `createdAt`
- [ ] Types: `brief`, `commentDigest`, `implementationHint`, `changeDelta`
- [ ] Invalidate when story content hash changes

### 6.3 Enrichment jobs

- [ ] `enrichStory(key, types[])` — async, non-blocking
- [ ] Content hash: hash of description + dev notes + comment ids/dates
- [ ] Prompts (concise, deterministic temperature 0):
  - [ ] **implementationHint:** 1 sentence tech approach from userStory + AC titles
  - [ ] **brief:** 3 sentences max
  - [ ] **commentDigest:** unresolved decisions only

### 6.4 Sync integration

- [ ] After delta sync, queue enrichment for changed stories if `TOONED_ENRICH_ON_SYNC=true`
- [ ] Bootstrap: lazy only (on first access), never inline all 800

### 6.5 Service API

- [ ] `POST /stories/:key/enrich?types=brief,implementationHint`
- [ ] `GET /stories/:key/summary`
- [ ] Review pack: include `implementationHint` when cached (`GET /sprints/next?reviewPack=true&enriched=true`)

### 6.6 CLI

- [ ] `tooned stories summarize <KEY> [--comments] [--since] [--force]`
- [ ] `tooned sprint next --review-pack --enriched` (optional flag)
- [ ] Clear error when LLM key missing: suggest agent-only reasoning

### 6.7 Cursor SDK path (optional stretch)

- [ ] `enrichWithRepoContext(story, commit)` using `CURSOR_API_KEY` + local cwd
- [ ] Only when story has linked commits and user enables `TOONED_ENRICH_REPO=true`

### 6.8 Tests

- [ ] Mock LLM provider returns fixed string
- [ ] Cache hit/miss on same content hash
- [ ] Sync does not await enrichment completion

## Agent workflow

Execute Steps 1–6 from [phase-agent-prompt-template.md](./phase-agent-prompt-template.md). Phase **6** (optional); finding IDs **P6-00N**.

**Watch for:** enrichment never blocks sync, cache invalidation on content hash change, no-op when LLM_API_KEY unset.

## Verification

```bash
export LLM_API_KEY=...
export LLM_MODEL=gpt-4o-mini   # or your choice
pnpm exec tooned serve &
pnpm exec tooned stories summarize DEMO-1 --force
pnpm exec tooned sprint next --review-pack --enriched
pnpm test
```

## Acceptance criteria

- Summarize returns cached result on second call (no LLM call)
- Sync completes before enrichment finishes
- Review pack `--enriched` shows `implementationHint` field when available
- Works with enrichment disabled (no API key) — rest of CLI unaffected

## Handoff

- Document LLM cost expectations (~N stories per delta sync)
- Prompt templates in `packages/enrich/prompts/`

## Out of scope

- LLM in ingestion path
- Embedding/vector search
- Auto-create Jira subtasks
