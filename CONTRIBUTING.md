# Contributing to Tooned

Thanks for your interest in contributing!

## Development setup

```bash
pnpm install
cp .env.example .env
cp tooned.yaml.example tooned.yaml
pnpm build
pnpm test
```

Fill in `.env` with your Jira Cloud credentials and customize `tooned.yaml` for your instance (project key, board ID, custom field IDs).

## Pull requests

1. Fork the repository and create a feature branch.
2. Keep changes focused — one concern per PR.
3. Run `pnpm build`, `pnpm test`, and `pnpm lint` before opening a PR.
4. Do not commit `.env`, `tooned.yaml` (local overrides), or `data/`.
5. Use sanitized fixtures in tests — no real issue keys, company URLs, or credentials.

## Code style

- Match existing TypeScript conventions in the package you are editing.
- Prefer configuration over hard-coded Jira field IDs, project keys, or workflow names.
- CLI output should follow AXI conventions (structured stdout, actionable errors).

## Reporting issues

Open a GitHub issue with:

- Tooned version / commit
- Node.js version
- Relevant redacted config (never paste tokens)
- Steps to reproduce and expected behavior
