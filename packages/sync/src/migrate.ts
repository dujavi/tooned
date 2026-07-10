import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CURRENT_MIGRATION_VERSION = 6;

export type Db = DatabaseSync;

function migrationsDir(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '..', 'src', 'migrations'),
  ];
  for (const candidate of candidates) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not locate migrations directory');
}

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const files = readdirSync(migrationsDir())
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = Number.parseInt(file.split('_')[0] ?? '', 10);
    if (Number.isNaN(version) || applied.has(version)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir(), file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
  }
}

export function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}
