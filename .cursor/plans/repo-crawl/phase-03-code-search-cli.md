---
name: Repo-crawl track — Phase 3
phase: repo-03
depends_on: [repo-02]
track: repo-crawl
---

# Phase 3: Code search CLI + federated completion

## Why this phase

Wires `--in code` to real FTS results and completes federated `--in all` across stories, docs, and code.

## Prerequisites

- Phase 2 handoff: `code_search` populated, `searchCode()` in db.ts
- Confluence Phase 3: `searchGlobal` extension point identified

## Tasks

### 3.1 Complete federated search

- [ ] `searchGlobal` includes `searchCode` with per-source cap (e.g. 10 each)
- [ ] Remove `codeSearchStatus: not_configured` when index non-empty; show `empty` + help when no repos configured
- [ ] HTTP `GET /search?in=code` returns code hits with `source: code`

### 3.2 CLI commands

- [ ] `tooned repos list` — indexed repos with file counts
- [ ] `tooned code view <account>/<repo>:<path>` — show file content excerpt
- [ ] `tooned search "<q>" --in code` — FTS results with repo + path
- [ ] Update `--in all` TOON output to include code section/tag
- [ ] Flag validation + skill generator update

### 3.3 Status + doctor

- [ ] `tooned status`: code file count, `codeBootstrapComplete`, last code sync
- [ ] Doctor: per-account repo scope summary

### 3.4 Tests

- [ ] Federated search fixture: story + doc + code hit in one `--in all` response
- [ ] CLI golden test for `search --in code`
- [ ] Empty code index returns help, not error

## Agent workflow

Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs **PR3-00N**.

## Verification

```bash
pnpm build && pnpm test
pnpm exec tooned repos list
pnpm exec tooned search "function" --in code
pnpm exec tooned search "function" --in all
pnpm exec tooned code view <account>/<repo>:README.md
curl "localhost:7420/search?q=function&in=code"
pnpm generate:skill --check
```

## Acceptance criteria

- Code search returns indexed file hits
- Federated search includes stories, docs, and code with `source` tags
- `repos list` and `code view` work
- Skill check passes; README updated with new commands

## Handoff (track complete)

- Commands added to README
- Sample queries for each `--in` scope
- Config example for multi-account + workspace scope
- Known limits: HEAD-only, no delta sync, denylist paths

## Out of scope

- Periodic repo delta sync
- Semantic / embedding search
- IDE LSP integration
