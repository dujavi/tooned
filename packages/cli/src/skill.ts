import { TOONED_HOME_DESCRIPTION, buildSkillCommandExamples } from './home-view.js';

export function generateSkillMarkdown(): string {
  const examples = buildSkillCommandExamples();
  return `---
name: tooned
description: Inspect sprint health, story delivery risk, and Jira sync status in the current repository.
---
# Tooned

Use Tooned when you need a compact, structured view of local Jira sync state, Confluence docs, and sprint execution details.

## Start here

- Run \`${examples[0]}\` for sync freshness and local story counts
- Run \`${examples[1]}\` for current sprint workload
- Run \`${examples[2]}\` to filter synced stories
- Run \`${examples[3]}\` to search stories and Confluence docs
- Run \`${examples[4]}\` to browse synced Confluence pages

## What Tooned provides

- ${TOONED_HOME_DESCRIPTION}
- Story, sprint, sizing, federated search, pages, and reference commands with TOON output
- Error/help responses that are safe for automated retries

## Common tasks

- **Check sync health**: \`${examples[0]}\`
- **Review active sprint workload**: \`${examples[1]}\`
- **Find in-progress work**: \`${examples[2]}\`
- **Locate design or implementation notes**: \`${examples[3]}\`
- **Browse Confluence docs**: \`${examples[4]}\`
`;
}
