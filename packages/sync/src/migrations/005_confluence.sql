-- Migration 005: Confluence pages, attachments, FTS, and page refs

CREATE TABLE IF NOT EXISTS confluence_pages (
  page_id TEXT PRIMARY KEY,
  space_key TEXT,
  title TEXT,
  url TEXT,
  body_md TEXT,
  labels_json TEXT,
  ancestor_titles TEXT,
  version INTEGER,
  source_updated_at TEXT,
  synced_at TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS confluence_attachments (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  text_content TEXT,
  synced_at TEXT,
  FOREIGN KEY (page_id) REFERENCES confluence_pages(page_id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS confluence_search USING fts5(
  page_id UNINDEXED,
  title,
  body_md,
  labels,
  attachment_names,
  attachment_text,
  tokenize = 'porter'
);

CREATE TABLE IF NOT EXISTS page_refs (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  issue_key TEXT,
  url TEXT,
  domain TEXT,
  FOREIGN KEY (page_id) REFERENCES confluence_pages(page_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_confluence_pages_space_key ON confluence_pages(space_key);
CREATE INDEX IF NOT EXISTS idx_confluence_pages_source_updated_at ON confluence_pages(source_updated_at);
CREATE INDEX IF NOT EXISTS idx_confluence_attachments_page_id ON confluence_attachments(page_id);
CREATE INDEX IF NOT EXISTS idx_page_refs_page_id ON page_refs(page_id);
CREATE INDEX IF NOT EXISTS idx_page_refs_issue_key ON page_refs(issue_key);
