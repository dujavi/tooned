import { TOONED_HOME_DESCRIPTION, buildSkillCommandExamples } from './home-view.js';

export function generateSkillMarkdown(): string {
  const examples = buildSkillCommandExamples();
  return `---
name: tooned
description: Inspect sprint health, story delivery risk, and Jira sync status in the current repository.
---
# Tooned

Use Tooned when you need a compact, structured view of local Jira sync state, Confluence docs, indexed code, and sprint execution details.

## Start here

- Run \`${examples[0]}\` for sync freshness and local story counts
- Run \`${examples[1]}\` for current sprint workload
- Run \`${examples[2]}\` to filter synced stories
- Run \`${examples[3]}\` to search stories, docs, and code
- Run \`${examples[4]}\` to browse indexed repositories

## What Tooned provides

- ${TOONED_HOME_DESCRIPTION}
- Story, sprint, sizing, federated search, pages, repos, code, and reference commands with TOON output
- Error/help responses that are safe for automated retries

## Common tasks

- **Check sync health**: \`${examples[0]}\`
- **Review active sprint workload**: \`${examples[1]}\`
- **Find in-progress work**: \`${examples[2]}\`
- **Locate design, docs, or implementation notes**: \`${examples[3]}\`
- **Browse indexed repositories**: \`${examples[4]}\`
`;
}
