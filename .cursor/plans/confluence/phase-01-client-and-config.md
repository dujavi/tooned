---
name: Confluence track — Phase 1
phase: confluence-01
depends_on: [base-tooned-phases-1-5]
track: confluence
---

# Phase 1: Confluence client + config + refs fix

## Why this phase

Establishes `@tooned/confluence` and yaml-driven crawl settings. Fixes wiki URL domain tagging so Jira-extracted Confluence links are discoverable before full page ingest.

## Prerequisites

- Base Tooned built and tested (`pnpm build && pnpm test`)
- Jira sync working (`tooned sync`, stories in DB)
- `ATLASSIAN_*` credentials valid for Confluence (same token as Jira Cloud)

## Tasks

### 1.1 Fix ref domain classification (`@tooned/jira/refs`)

- [ ] Classify URLs with path `/wiki/` as `confluence` before `atlassian.net` → `jira`
- [ ] Add `parseConfluenceUrl()` helper: extract `pageId` from standard URLs; flag `folder/`, `resumedraft`, `tinyui` shapes
- [ ] Strip `atlOrigin` query param during normalization
- [ ] Unit tests with sanitized wiki URL fixtures (no real org URLs in committed fixtures)

### 1.2 `tooned.yaml` schema (`@tooned/core`)

- [ ] Add `confluence` block: `mode: all | spaces`, `spaces: string[]`, `maxAttachmentBytes` (default 524288)
- [ ] Doctor warns when `mode: spaces` and `spaces` is empty
- [ ] Auto-suggest `vcs.urlDomains.confluence` host from `ATLASSIAN_BASE_URL` when list empty
- [ ] Update `tooned.yaml.example`

### 1.3 New package `@tooned/confluence`

- [ ] `createConfluenceClient(config)` — reuse `ATLASSIAN_EMAIL`, `ATLASSIAN_TOKEN`, wiki base `{ATLASSIAN_BASE_URL}/wiki`
- [ ] Rate limit wrapper mirroring `@tooned/jira` client pattern
- [ ] `listSpaces()`, `searchCql(cql, cursor?)`, `getPage(pageId, expand?)`, `listAttachments(pageId)`
- [ ] `buildCrawlCql(mode, spaces)` — `type=page` + optional `space in (...)`
- [ ] `resolvePageId(url)` — standard, tiny link (API lookup), draft id; return null for folders

### 1.4 Storage → markdown (`@tooned/confluence/storage`)

- [ ] Convert `body.storage` XHTML to markdown/plain text
- [ ] Handle lists, links, headings, code blocks, tables (best-effort)
- [ ] Fallback: strip tags to plain text on parse failure
- [ ] Unit tests with sanitized storage HTML fixtures

### 1.5 Attachment helpers

- [ ] `isTextMime(mime: string): boolean` — `text/*`, `application/json`, `application/xml`, common code types
- [ ] `shouldDownload(size, mime, maxBytes)` — gate before fetch

## Agent workflow

Execute Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs **PC1-00N**. Loop Step 5 until critical/high = 0.

**Watch for:** no secrets in fixtures, no hard-coded space keys in source, parameterized tests only.

## Verification

```bash
pnpm build && pnpm test
pnpm exec tooned doctor --verbose   # confluence host / auth hint if added
```

## Acceptance criteria

- Wiki URLs in refs tests classify as `confluence`
- `@tooned/confluence` exports client + storage converter; tests pass with fixtures only
- Config schema validates `confluence.mode` and `spaces`
- No live Confluence calls in CI

## Handoff to Phase 2

- Package path: `packages/confluence`
- Config keys added to `project-config.ts`
- `parseConfluenceUrl` / `resolvePageId` behavior for URL shapes documented
- Sample fixture page IDs used in tests (sanitized)

## Out of scope

- SQLite migration, sync pipeline, search, CLI pages commands
- Attachment download during sync
- Repo / code search
