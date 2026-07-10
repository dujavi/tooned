# Tooned

Local Jira sync service and agent-friendly CLI. Tooned ingests Jira issues into SQLite and exposes structured commands for sprint review, sizing, and search — designed for autonomous agents (AXI).

## Quickstart

```bash
pnpm install
cp .env.example .env          # Atlassian credentials
cp tooned.yaml.example tooned.yaml   # project + field mapping
pnpm build
pnpm exec tooned doctor
pnpm exec tooned serve
```

In another terminal:

```bash
curl -s localhost:7420/health
pnpm exec tooned status
```

## Configuration

Tooned uses two layers:

| Layer | File | Purpose |
|---|---|---|
| **Secrets** | `.env` | API tokens, email, base URL |
| **Project** | `tooned.yaml` | Project key, board ID, custom field IDs, DoD templates |

Environment variables override `tooned.yaml` for `JIRA_PROJECT_KEY`, `ATLASSIAN_BOARD_ID`, and `BITBUCKET_WORKSPACE`.

Set `TOONED_CONFIG_PATH` to use a preset from `examples/` instead of `./tooned.yaml`.

### Required `.env` variables

- `ATLASSIAN_EMAIL`, `ATLASSIAN_TOKEN`, `ATLASSIAN_BASE_URL`

See `.env.example` for optional variables.

### `tooned.yaml` essentials

```yaml
jira:
  projectKey: MYPROJ
  boardId: 1
  storyIssueType: Story
  bootstrapJql: "project = MYPROJ AND issuetype = Story"  # optional, for doctor --verbose

fields:
  storyPoints: "10016"   # instance-specific custom field IDs
  sprint: "10020"
```

Custom field IDs vary per Jira Cloud instance. Discover them via **Jira Settings → Issues → Custom fields** or `GET /rest/api/3/field`.

### Search scopes

| Scope | Example |
|---|---|
| All sources | `tooned search "workflow" --in all` |
| Jira stories | `tooned search "CRM-101" --in stories` |
| Confluence docs | `tooned search "onboarding" --in docs` |
| Indexed code | `tooned search "function" --in code` |
| Comments / notes | `tooned search "blocked" --in comments` |

## Commands

| Command | Description |
|---|---|
| `tooned` | Home view with sync metadata |
| `tooned serve` | Start the HTTP sync service (default port 7420) |
| `tooned doctor` | Verify env, config, Jira auth, data dir, and port |
| `tooned doctor --verbose` | Fetch board filter JQL, optional bootstrap JQL check, story count |
| `tooned status` | Show sync metadata and local story count |
| `tooned sync --force` | Force bootstrap + delta sync |
| `tooned sprint current --workload` | Current sprint workload summary |
| `tooned sprint next --review-pack` | Next sprint planning + review pack |
| `tooned stories list --limit 20` | Story list with filters |
| `tooned stories sizing <KEY>` | Compute points, DoD gaps, and open questions |
| `tooned search "<query>" --in all` | Search stories, Confluence docs, and indexed code |
| `tooned search "<query>" --in code` | Search indexed repository files |
| `tooned repos list` | List indexed repositories with file counts |
| `tooned code view <account>/<repo>:<path>` | View indexed file content |
| `tooned pages list --space CRM --limit 20` | Browse synced Confluence pages |
| `tooned refs search <query>` | Search extracted links and refs |
| `tooned setup hooks` | Install/repair Cursor SessionStart hook |

## Examples

See `examples/sample-preset/tooned.yaml` for a fuller configuration template with DoD templates and URL domain rules.

## Agent integration

Tooned supports two integration paths. You only need one:

- **Hook-first (ambient context every session)**: run `pnpm exec tooned setup hooks` to install `.cursor/hooks.json` with a `sessionStart` hook that runs `tooned`.
- **Skill (on-demand discovery)**: run `pnpm generate:skill` to generate `.cursor/skills/tooned/SKILL.md`.

For non-Cursor agents:

- **Codex**: add a `sessionStart` hook in `.codex/hooks.json` and enable hooks in `config.toml`.
- **Claude Code**: add a `SessionStart` command hook in `.claude/settings.json`.

Skill staleness check (for CI or local validation):

```bash
pnpm generate:skill --check
```

## Packages

| Package | Purpose |
|---|---|
| `@tooned/core` | Config, types, project YAML schema |
| `@tooned/jira` | Jira API client |
| `@tooned/sync` | SQLite schema and migrations |
| `@tooned/service` | Hono HTTP service |
| `@tooned/cli` | `tooned` CLI |
| `@tooned/bitbucket` | Bitbucket API client |
| `@tooned/github` | GitHub API client |
| `@tooned/confluence` | Confluence page crawl client |

## Development

```bash
pnpm build
pnpm test
pnpm lint
pnpm generate:skill --check
```

Data is stored under `TOONED_DATA_DIR` (default `./data`).

## License

MIT — see [LICENSE](LICENSE).
