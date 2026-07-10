---
name: tooned
description: Inspect sprint health, story delivery risk, and Jira sync status in the current repository.
---
# Tooned

Use Tooned when you need a compact, structured view of local Jira sync state, Confluence docs, indexed code, and sprint execution details.

## Start here

- Run `npx -y @tooned/cli status` for sync freshness and local story counts
- Run `npx -y @tooned/cli sprint current --workload` for current sprint workload
- Run `npx -y @tooned/cli stories list --status "In Progress" --limit 20` to filter synced stories
- Run `npx -y @tooned/cli search "<query>" --in all` to search stories, docs, and code
- Run `npx -y @tooned/cli repos list` to browse indexed repositories

## What Tooned provides

- Inspect synced Jira stories, Confluence docs, indexed code, and sprint delivery state
- Story, sprint, sizing, federated search, pages, repos, code, and reference commands with TOON output
- Error/help responses that are safe for automated retries

## Common tasks

- **Check sync health**: `npx -y @tooned/cli status`
- **Review active sprint workload**: `npx -y @tooned/cli sprint current --workload`
- **Find in-progress work**: `npx -y @tooned/cli stories list --status "In Progress" --limit 20`
- **Locate design, docs, or implementation notes**: `npx -y @tooned/cli search "<query>" --in all`
- **Browse indexed repositories**: `npx -y @tooned/cli repos list`
