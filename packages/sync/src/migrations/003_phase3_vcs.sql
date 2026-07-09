-- Migration 003: phase 3 VCS commit metadata

ALTER TABLE commits ADD COLUMN provider TEXT;
ALTER TABLE commits ADD COLUMN author TEXT;
ALTER TABLE commits ADD COLUMN authored_at TEXT;
ALTER TABLE commits ADD COLUMN url TEXT;
ALTER TABLE commits ADD COLUMN pull_request_url TEXT;
ALTER TABLE commits ADD COLUMN files_changed INTEGER;
ALTER TABLE commits ADD COLUMN lines_added INTEGER;
ALTER TABLE commits ADD COLUMN lines_removed INTEGER;

CREATE INDEX IF NOT EXISTS idx_commits_issue_key ON commits(issue_key);
