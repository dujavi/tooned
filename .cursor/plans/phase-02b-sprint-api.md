---
name: Tooned Phase 2b — Sprint API
phase: 2b
depends_on: [phase-02-jira-ingestion]
---

# Phase 2b: Sprint API (Jira Agile)

## Why this phase

Sprint-scoped queries are separate from issue sync — needed for review pack and workload views.

## Prerequisites

- Phase 2 complete: stories in DB with sprint field from `fieldMap.sprint`
- `ATLASSIAN_BOARD_ID` from env or `tooned.yaml`

## Tasks

### 2b.1 `@tooned/jira/agile`

- [ ] `getBoardConfiguration(boardId)`
- [ ] `getSprints(boardId, state: active|future|closed)`
- [ ] `getBacklogIssues(boardId)` or backlog JQL from board config
- [ ] `resolveCurrentSprint(boardId)` → sprint object
- [ ] `resolveNextSprint(boardId)` → earliest future sprint by startDate

### 2b.2 Sprint ↔ story matching

- [ ] Match DB stories by sprint id/name from configured sprint field
- [ ] Handle stories in no sprint (backlog flag)
- [ ] `listStoriesForSprint(sprintId, db)`
- [ ] `listBacklogStories(db, boardId)`

### 2b.3 Workload aggregates (service layer)

- [ ] `computeWorkload(stories[])` — points, assignees, subtasks, time spent

### 2b.4 Review pack builder

- [ ] `buildReviewPack(stories[])` JSON with truncated fields

### 2b.5 Service endpoints

- [ ] `GET /sprints/current?workload=true|false`
- [ ] `GET /sprints/next?reviewPack=true&includeBacklog=true|false`

### 2b.6 Tests

- [ ] Mock Agile API responses (fixtures only)
- [ ] Workload math unit tests

## Agent workflow

Execute Steps 1–6 from [phase-agent-prompt-template.md](./phase-agent-prompt-template.md). Phase **2b**; finding IDs **P2b-00N**. Loop Step 5 until critical/high = 0.

**Watch for:** sprint field from config (not hard-coded customfield), mock-only tests, empty-state responses.

## Verification

```bash
pnpm exec tooned serve &
curl "localhost:7420/sprints/current" | jq '.sprint.name'
curl "localhost:7420/sprints/next?reviewPack=true" | jq '.stories | length'
pnpm test
```

## Acceptance criteria

- Current sprint name matches Jira UI for configured board
- Next sprint returns future sprint or definitive empty state
- Workload numbers consistent with manual spot-check

## Out of scope

- TOON encoding (Phase 4)
- VCS commits (Phase 3)
