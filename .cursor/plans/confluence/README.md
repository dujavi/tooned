# Confluence + search framework

Extends Tooned with Confluence page ingestion and a federated search layer (`--in stories|docs|code|all`). Assumes Phases 1–5 of the [base plans](../README.md) are complete.

**Standards:** [AXI skill](../../skills/axi/SKILL.md)  
**Exploration context:** [exploration-notes.md](./exploration-notes.md)

## Execution order

| Order | Plan | Depends on |
|---|---|---|
| 1 | [phase-01-client-and-config.md](./phase-01-client-and-config.md) | Base Tooned (Jira sync live) |
| 2 | [phase-02-sync-and-store.md](./phase-02-sync-and-store.md) | Phase 01 handoff |
| 3 | [phase-03-search-and-cli.md](./phase-03-search-and-cli.md) | Phase 02 handoff |

Run **one phase per agent session**. Pass the prior **Handoff** section forward.

**Agent workflow:** Steps 1–6 from [phase-agent-prompt-template.md](../phase-agent-prompt-template.md). Finding IDs: **PC1-**, **PC2-**, **PC3-** (Confluence track).

## Agent prompts

| Phase | Prompt |
|---|---|
| 1 | [prompt-run-phase-01.md](./prompt-run-phase-01.md) |
| 2–3 | [phase-agent-prompt-template.md](../phase-agent-prompt-template.md) |

## After this track

Run the [repo-crawl track](../repo-crawl/README.md) to fill `--in code` and complete federated search.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Confluence scope | `confluence.mode: all \| spaces` + optional `spaces: []` in `tooned.yaml` |
| Content depth | Page body + metadata; text MIME attachments only |
| Sync (v1) | Bootstrap on `tooned sync --force` only |
| Code search in this track | `--in code` returns empty + `codeSearchStatus: not_configured` until repo track |
