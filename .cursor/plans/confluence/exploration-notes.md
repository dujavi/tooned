# Confluence exploration notes (2026-07-10)

Reference for implementers — not a runnable phase.

## Local state before this track

- `extracted_refs`: 650 URLs from Jira; **20** are `/wiki/` links (mis-tagged `jira`)
- `commits`: 0 (Bitbucket creds invalid in dev `.env`)
- No Confluence tables or page bodies stored yet

## Site volume (kingtechnologyinc)

| Scope | Pages |
|---|---|
| Full site | 632 |
| CRM / CI / WF / IT | 113 / 147 / 67 / 81 (408 total) |

## URL shapes from Jira stories

- `/wiki/spaces/{SPACE}/pages/{pageId}/{Title}`
- `/wiki/x/{tinyui}` → resolve via API
- `/wiki/pages/resumedraft.action?draftId=...` (draft)
- `/wiki/spaces/{SPACE}/folder/{id}` — not a page; skip
- Strip `?atlOrigin=...` before lookup

## API shapes

- Crawl: CQL `type=page` via `/wiki/rest/api/search` (cursor pagination)
- Page: `GET /wiki/rest/api/content/{id}?expand=body.storage,version,space,metadata.labels,ancestors`
- Body: `body.storage` XHTML (`representation: storage`), not ADF
- Attachments: `GET .../child/attachment`; filter MIME client-side (CQL has no `mediaType` field)
- Mostly PNG inline images; body markdown is primary search value

## Refs bug

[`packages/jira/src/refs.ts`](../../../packages/jira/src/refs.ts) — check `/wiki/` path before `atlassian.net` → `jira`.

## Sensitive content

Some pages contain credentials (e.g. CI “Users/Roles”). Optional warning in `pages view` — not blocking v1.
