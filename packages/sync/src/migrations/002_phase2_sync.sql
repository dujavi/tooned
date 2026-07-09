-- Migration 002: phase 2 sync fields and indexes

ALTER TABLE stories ADD COLUMN issue_id TEXT;
ALTER TABLE stories ADD COLUMN issue_type TEXT;
ALTER TABLE stories ADD COLUMN done_at TEXT;

ALTER TABLE subtasks ADD COLUMN issue_id TEXT;
ALTER TABLE subtasks ADD COLUMN synced_at TEXT;
ALTER TABLE subtasks ADD COLUMN source_updated_at TEXT;

ALTER TABLE bugs ADD COLUMN issue_id TEXT;
ALTER TABLE bugs ADD COLUMN synced_at TEXT;
ALTER TABLE bugs ADD COLUMN source_updated_at TEXT;

ALTER TABLE comments ADD COLUMN updated_at TEXT;
ALTER TABLE comments ADD COLUMN payload TEXT;

ALTER TABLE attachments ADD COLUMN payload TEXT;

CREATE INDEX IF NOT EXISTS idx_stories_source_updated_at ON stories(source_updated_at);
CREATE INDEX IF NOT EXISTS idx_subtasks_parent_key ON subtasks(parent_key);
CREATE INDEX IF NOT EXISTS idx_subtasks_source_updated_at ON subtasks(source_updated_at);
CREATE INDEX IF NOT EXISTS idx_bugs_source_updated_at ON bugs(source_updated_at);
CREATE INDEX IF NOT EXISTS idx_comments_issue_key ON comments(issue_key);
CREATE INDEX IF NOT EXISTS idx_changelog_issue_key ON changelog(issue_key);
CREATE INDEX IF NOT EXISTS idx_attachments_issue_key ON attachments(issue_key);
CREATE INDEX IF NOT EXISTS idx_extracted_refs_issue_key ON extracted_refs(issue_key);
