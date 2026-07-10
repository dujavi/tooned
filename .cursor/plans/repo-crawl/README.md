# Repo crawl + code search

Extends Tooned with multi-account VCS config, repository file indexing, and `--in code` search. Run **after** the [Confluence track](../confluence/README.md) (needs federated search framework from Confluence Phase 3).

**Standards:** [AXI skill](../../skills/axi/SKILL.md)

## Execution order

| Order | Plan | Depends on |
|---|---|---|
| 1 | [phase-01-vcs-accounts.md](./phase-01-vcs-accounts.md) | Confluence track Phase 3 (search framework) |
| 2 | [phase-02-repo-index.md](./phase-02-repo-index.md) | Phase 01 handoff |
| 3 | [phase-03-code-search-cli.md](./phase-03-code-search-cli.md) | Phase 02 handoff |

Run **one phase per agent session**. Finding IDs: **PR1-**, **PR2-**, **PR3-**.

## Agent prompts

| Phase | Prompt |
|---|---|
| 1 | [prompt-run-phase-01.md](./prompt-run-phase-01.md) |
| 2–3 | [phase-agent-prompt-template.md](../phase-agent-prompt-template.md) |

## Decisions (locked)

| Topic | Choice |
|---|---|
| Repo selection | Org/workspace scope **or** individual repo slugs per account |
| Credentials | Named accounts in yaml; secrets via env var indirection |
| Index content | Text source files; denylist `node_modules`, binaries, images |
| Sync (v1) | Bootstrap on `tooned sync --force` only |
| Backward compat | Existing `BITBUCKET_*` / `GITHUB_TOKEN` map to default account |

## Exploration notes

- Bitbucket 2.0: `GET /2.0/repositories/{workspace}`, `.../src/HEAD/{path}`, `.../pullrequests/{id}`
- `@tooned/bitbucket` already has PR/commit client — repo crawl adds src tree walk
- Dev `.env` Bitbucket creds returned 401 during exploration; doctor should surface clearly
