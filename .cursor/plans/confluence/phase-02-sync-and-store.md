---
name: Confluence track — Phase 2
phase: confluence-02
depends_on: [confluence-01]
track: confluence
---

# Phase 2: Confluence sync + local store

## Why this phase

Crawls Confluence pages into SQLite and audit blobs. Resumable bootstrap on `tooned sync --force`.

## Prerequisites

- Phase 1 handoff: `@tooned/confluence` client, config schema, refs fix merged
- Migration slot: next version after current highest in `packages/sync/src/migrations/`

## Tasks

### 2.1 Migration `005_confluence.sql`

- [ ] `confluence_pages` — `page_id`, `space_key`, `title`, `url`, `body_md`, `labels_json`, `ancestor_titles`, `version`, `source_updated_at`, `synced_at`, `payload`
- [ ] `confluence_attachments` — `id`, `page_id`, `filename`, `mime_type`, `text_content`, `synced_at`
- [ ] `confluence_search` FTS5 — `title`, `body_md`, `labels`, `attachment_names`, `attachment_text` (porter)
- [ ] `page_refs` — `id`, `page_id`, `issue_key`, `url`, `domain` (Jira keys + URLs extracted from page body)
- [ ] Indexes on `space_key`, `source_updated_at`

### 2.2 `confluence-sync.ts`

- [ ] `runConfluenceSync(db, config, { force? })` — bootstrap when `confluenceBootstrapComplete` false or `--force`
- [ ] CQL paginated crawl per `confluence.mode` / `spaces`
- [ ] Checkpoint in `sync_state`: `confluenceBootstrapCheckpoint`, `confluenceBootstrapComplete`, `confluenceLastSync`
- [ ] Per page: fetch body, convert to markdown, upsert `confluence_pages`, rebuild FTS row
- [ ] Attachments: download text MIME only; filename-only for binary
- [ ] Extract `CRM-\d+` (use `config.project.jira.projectKey` prefix pattern) → `page_refs`
- [ ] Audit blob: `data/pages/{pageId}.json`
- [ ] Skip folders; log unresolved tiny/draft URLs

### 2.3 Pipeline integration

- [ ] Call `runConfluenceSync` from `executeSync()` after Jira sync when force or incomplete
- [ ] Re-tag existing `extracted_refs` wiki URLs on force (optional migration step in sync)

### 2.4 DB helpers (`db.ts`)

- [ ] `upsertConfluencePage`, `replacePageAttachments`, `replacePageRefs`
- [ ] `getPageById`, `listPages({ space?, limit })`, `getConfluencePageCount`
- [ ] `rebuildConfluenceSearchRow(pageId)`

## Agent workflow

Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs **PC2-00N**.

**Watch for:** parameterized SQL, checkpoint resume tests, no token leakage in errors, graceful partial failure per page.

## Verification

```bash
pnpm build && pnpm test
pnpm exec tooned sync --force          # requires live Confluence creds locally
pnpm exec tooned status                # page count > 0 when crawl completes
# spot-check: ls data/pages/*.json | head
```

## Acceptance criteria

- Bootstrap resumable via checkpoint
- Pages + FTS rows stored; `tooned status` reports page count
- Text attachments indexed when present; PNG stored as filename only
- `page_refs` links pages to Jira keys found in body
- CI uses fixtures only

## Handoff to Phase 3

- Migration version number
- `sync_state` keys and sample page count from dev run
- 3 sample `page_id` values for search/CLI verification
- Known quirks (draft URLs, folders skipped)

## Out of scope

- `tooned search --in docs`, federated `--in all`
- `tooned pages` CLI
- Repo crawl
