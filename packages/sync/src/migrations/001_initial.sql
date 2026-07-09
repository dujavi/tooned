-- Migration 001: initial schema (Phase 1 stubs)

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  key TEXT PRIMARY KEY,
  summary TEXT,
  status TEXT,
  payload TEXT,
  synced_at TEXT,
  source_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS subtasks (
  key TEXT PRIMARY KEY,
  parent_key TEXT,
  summary TEXT,
  status TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS bugs (
  key TEXT PRIMARY KEY,
  summary TEXT,
  status TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  issue_key TEXT,
  author TEXT,
  body TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS changelog (
  id TEXT PRIMARY KEY,
  issue_key TEXT,
  field TEXT,
  from_value TEXT,
  to_value TEXT,
  changed_at TEXT
);

CREATE TABLE IF NOT EXISTS linked_issues (
  id TEXT PRIMARY KEY,
  source_key TEXT,
  target_key TEXT,
  link_type TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  issue_key TEXT,
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER
);

CREATE TABLE IF NOT EXISTS extracted_refs (
  id TEXT PRIMARY KEY,
  issue_key TEXT,
  url TEXT,
  domain TEXT
);

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  issue_key TEXT,
  repository TEXT,
  hash TEXT,
  message TEXT
);

CREATE TABLE IF NOT EXISTS field_registry (
  field_id TEXT PRIMARY KEY,
  name TEXT,
  schema_type TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS story_search USING fts5(
  key UNINDEXED,
  summary,
  description,
  comments,
  dev_notes,
  attachment_names,
  tokenize = 'porter'
);

CREATE TABLE IF NOT EXISTS enrichments (
  issue_key TEXT PRIMARY KEY,
  kind TEXT,
  payload TEXT,
  created_at TEXT
);
