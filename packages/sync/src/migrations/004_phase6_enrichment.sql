-- Migration 004: phase 6 enrichment cache schema

ALTER TABLE enrichments RENAME TO enrichments_legacy;

CREATE TABLE IF NOT EXISTS enrichments (
  story_key TEXT NOT NULL,
  type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (story_key, type)
);

INSERT INTO enrichments (story_key, type, content_hash, content, created_at)
SELECT issue_key, kind, '', payload, COALESCE(created_at, datetime('now'))
FROM enrichments_legacy
WHERE issue_key IS NOT NULL AND kind IS NOT NULL AND payload IS NOT NULL;

DROP TABLE enrichments_legacy;

CREATE INDEX IF NOT EXISTS idx_enrichments_story_key ON enrichments(story_key);
