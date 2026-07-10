# Knowledge index orchestration

Run the two extension tracks **in order** with one phase per agent session. Each phase agent loops code review until critical/high = 0.

## Track order

```
confluence/phase-01 → phase-02 → phase-03
        ↓ (handoff)
repo-crawl/phase-01 → phase-02 → phase-03
```

## Orchestrator checklist

For each phase:

1. Spawn agent with the phase's `prompt-run-phase-01.md` (first phase) or [phase-agent-prompt-template.md](./phase-agent-prompt-template.md) (later phases)
2. Pass **Prior phase handoff** from the previous session
3. Wait for Step 6 deliverable: verification output + filled handoff + review counts (critical/high = 0)
4. Do not start next phase until verification passes

## Phase index

| # | Track | Plan | Prompt starter | Finding prefix |
|---|---|---|---|---|
| 1 | confluence | [phase-01-client-and-config.md](./confluence/phase-01-client-and-config.md) | [prompt-run](./confluence/prompt-run-phase-01.md) | PC1- |
| 2 | confluence | [phase-02-sync-and-store.md](./confluence/phase-02-sync-and-store.md) | template | PC2- |
| 3 | confluence | [phase-03-search-and-cli.md](./confluence/phase-03-search-and-cli.md) | template | PC3- |
| 4 | repo-crawl | [phase-01-vcs-accounts.md](./repo-crawl/phase-01-vcs-accounts.md) | [prompt-run](./repo-crawl/prompt-run-phase-01.md) | PR1- |
| 5 | repo-crawl | [phase-02-repo-index.md](./repo-crawl/phase-02-repo-index.md) | template | PR2- |
| 6 | repo-crawl | [phase-03-code-search-cli.md](./repo-crawl/phase-03-code-search-cli.md) | template | PR3- |

## Orchestrator prompt (copy to parent agent)

```
You are the orchestrator for Tooned knowledge-index extension (6 phases).

Rules:
- Run phases 1→6 in order; one sub-agent per phase
- Each sub-agent follows its phase plan + phase-agent-prompt-template.md workflow (Steps 1–6, review loop)
- Do not advance until handoff reports critical=0 and high=0
- Pass prior handoff verbatim into the next sub-agent prompt
- Never commit .env or tooned.yaml

Start with: .cursor/plans/confluence/prompt-run-phase-01.md

After phase 3 handoff, start: .cursor/plans/repo-crawl/prompt-run-phase-01.md

Final verification (all tracks complete):
pnpm build && pnpm test
pnpm exec tooned sync --force
pnpm exec tooned search "workflow" --in all
pnpm exec tooned search "function" --in code
pnpm generate:skill --check
```

## Template placeholders for phases 2–6

| Phase | `{PHASE}` | `{PLAN_FILE}` |
|---|---|---|
| Confluence 2 | confluence-02 | confluence/phase-02-sync-and-store.md |
| Confluence 3 | confluence-03 | confluence/phase-03-search-and-cli.md |
| Repo 1 | repo-01 | repo-crawl/phase-01-vcs-accounts.md |
| Repo 2 | repo-02 | repo-crawl/phase-02-repo-index.md |
| Repo 3 | repo-03 | repo-crawl/phase-03-code-search-cli.md |

Use finding ID prefix PC2/PC3/PR1/PR2/PR3 instead of P{PHASE} in reviews.
