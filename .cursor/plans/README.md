# Tooned implementation plans

Run **one phase per agent session** for context management. Each phase plan is self-contained with prerequisites, tasks, verification, and handoff notes.

**Standards:** [`.cursor/skills/axi/SKILL.md`](../skills/axi/SKILL.md)

**Configuration:** Secrets in `.env`; project/instance settings in `tooned.yaml` (see `tooned.yaml.example`). No hard-coded Jira field IDs or org names in source.

**Agent workflow:** Every phase plan includes an **Agent workflow** section (Steps 1–6: implement → cleanup → validate → code review → fix loop → handoff). Full template: [phase-agent-prompt-template.md](./phase-agent-prompt-template.md). Ready-to-run prompts: `prompt-run-phase-01.md`, `prompt-run-phase-02.md`.

## Execution order

| Order | Plan | Agent prompt starter |
|---|---|---|
| 1 | [phase-01-foundation.md](./phase-01-foundation.md) | [prompt-run-phase-01.md](./prompt-run-phase-01.md) |
| 2 | [phase-02-jira-ingestion.md](./phase-02-jira-ingestion.md) | [prompt-run-phase-02.md](./prompt-run-phase-02.md) |
| 3 | [phase-02b-sprint-api.md](./phase-02b-sprint-api.md) | [phase-agent-prompt-template.md](./phase-agent-prompt-template.md) |
| 4 | [phase-03-vcs-linking.md](./phase-03-vcs-linking.md) | template |
| 5 | [phase-04-axi-cli.md](./phase-04-axi-cli.md) | template |
| 6 | [phase-05-tests-hooks.md](./phase-05-tests-hooks.md) | template |
| 7 | [phase-06-llm-enrichment.md](./phase-06-llm-enrichment.md) | optional |

## Multi-agent tips

- Pass the **Handoff** section from the prior phase to the next agent.
- Do not skip verification — each phase lists commands that must pass before handoff.
- Use sanitized fixtures in tests; never commit real issue exports or credentials.
- Phase 6 is optional; Phases 1–5 deliver a complete read-only product.

## Agent prompts

| Phase | Prompt file |
|---|---|
| 1 | [prompt-run-phase-01.md](./prompt-run-phase-01.md) |
| 2 | [prompt-run-phase-02.md](./prompt-run-phase-02.md) |
| 2b–6 | [phase-agent-prompt-template.md](./phase-agent-prompt-template.md) |
