-- Migration 006: Repository code files and FTS index

CREATE TABLE IF NOT EXISTS code_files (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  repository TEXT NOT NULL,
  path TEXT NOT NULL,
  ref TEXT NOT NULL,
  language TEXT,
  size_bytes INTEGER,
  content TEXT,
  content_hash TEXT,
  source_updated_at TEXT,
  synced_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS code_search USING fts5(
  file_id UNINDEXED,
  repository,
  path,
  content,
  tokenize = 'porter'
);

CREATE INDEX IF NOT EXISTS idx_code_files_repository_ref ON code_files(repository, ref);
CREATE INDEX IF NOT EXISTS idx_code_files_account_id ON code_files(account_id);
CREATE INDEX IF NOT EXISTS idx_code_files_synced_at ON code_files(synced_at);
