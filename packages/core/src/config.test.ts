import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';
import { buildSyncMeta } from '../src/sync-meta.js';
import { getDodTemplate, loadProjectConfig } from '../src/project-config.js';

const SAMPLE_YAML = `
jira:
  projectKey: TEST
  boardId: 42
fields:
  storyPoints: "10016"
dodTemplates:
  - team: default
    expectedSubtasks: [Test]
`;

describe('loadProjectConfig', () => {
  let dir: string;

  it('loads yaml from explicit path', () => {
    dir = mkdtempSync(join(tmpdir(), 'tooned-config-'));
    const configPath = join(dir, 'tooned.yaml');
    writeFileSync(configPath, SAMPLE_YAML);

    const project = loadProjectConfig({ configPath, cwd: dir });
    expect(project.jira.projectKey).toBe('TEST');
    expect(project.jira.boardId).toBe(42);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('loadConfig', () => {
  let dir: string;

  it('merges env credentials with project yaml', () => {
    dir = mkdtempSync(join(tmpdir(), 'tooned-config-'));
    writeFileSync(join(dir, 'tooned.yaml'), SAMPLE_YAML);

    const config = loadConfig({
      ATLASSIAN_EMAIL: 'user@example.com',
      ATLASSIAN_TOKEN: 'secret',
      ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
      TOONED_CONFIG_PATH: join(dir, 'tooned.yaml'),
    });

    expect(config.ATLASSIAN_BOARD_ID).toBe(42);
    expect(config.JIRA_PROJECT_KEY).toBe('TEST');
    expect(config.TOONED_SERVICE_PORT).toBe(7420);
    expect(config.fieldMap.storyPoints).toBe('10016');
    expect(config.dodTemplates[0]?.expectedSubtasks).toEqual(['Test']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('env overrides yaml for board and project key', () => {
    dir = mkdtempSync(join(tmpdir(), 'tooned-config-'));
    writeFileSync(join(dir, 'tooned.yaml'), SAMPLE_YAML);

    const config = loadConfig({
      ATLASSIAN_EMAIL: 'user@example.com',
      ATLASSIAN_TOKEN: 'secret',
      ATLASSIAN_BASE_URL: 'https://example.atlassian.net',
      TOONED_CONFIG_PATH: join(dir, 'tooned.yaml'),
      JIRA_PROJECT_KEY: 'OVERRIDE',
      ATLASSIAN_BOARD_ID: '99',
    });

    expect(config.JIRA_PROJECT_KEY).toBe('OVERRIDE');
    expect(config.ATLASSIAN_BOARD_ID).toBe(99);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('buildSyncMeta', () => {
  it('computes data age from last sync', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const meta = buildSyncMeta('2026-07-09T11:59:30Z', 'idle', now);
    expect(meta.dataAgeSeconds).toBe(30);
    expect(meta.syncStatus).toBe('idle');
  });

  it('returns null data age when never synced', () => {
    const meta = buildSyncMeta(null, 'idle');
    expect(meta.lastSync).toBeNull();
    expect(meta.dataAgeSeconds).toBeNull();
  });
});

describe('getDodTemplate', () => {
  it('falls back to default template', () => {
    const template = getDodTemplate(
      [{ team: 'default', expectedSubtasks: ['Test'] }],
      undefined,
    );
    expect(template.team).toBe('default');
  });
});
