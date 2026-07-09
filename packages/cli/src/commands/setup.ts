import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { buildSyncMeta } from '@tooned/core';
import { formatToon } from '../output.js';

interface HookConfigEntry {
  command?: string;
  [key: string]: unknown;
}

interface HooksFileShape {
  version?: number;
  hooks?: Record<string, HookConfigEntry[]>;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveCurrentExecutablePath(): string {
  return realpathSync(resolve(process.argv[1] ?? 'tooned'));
}

function resolvePortableHookCommand(): string {
  const executablePath = resolveCurrentExecutablePath();
  try {
    const onPath = execSync('command -v tooned', { encoding: 'utf8' }).trim();
    if (onPath) {
      const resolvedOnPath = realpathSync(resolve(onPath));
      if (resolvedOnPath === executablePath) {
        return 'tooned';
      }
    }
  } catch {
    // Ignore PATH lookup failures and fall back to absolute path.
  }
  return quoteShellArg(executablePath);
}

function readHooksFile(path: string): HooksFileShape {
  if (!existsSync(path)) {
    return { version: 1, hooks: {} };
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as HooksFileShape;
  return {
    version: parsed.version ?? 1,
    hooks: parsed.hooks ?? {},
  };
}

function upsertSessionStartHook(config: HooksFileShape, command: string): 'installed' | 'updated' | 'unchanged' {
  const hooks = config.hooks ?? {};
  const existing = hooks.sessionStart ?? [];
  const currentIndex = existing.findIndex((entry) => (entry.command ?? '').includes('tooned'));
  if (currentIndex === -1) {
    hooks.sessionStart = [...existing, { command }];
    config.hooks = hooks;
    return 'installed';
  }

  const current = existing[currentIndex];
  if (current?.command === command) {
    hooks.sessionStart = existing;
    config.hooks = hooks;
    return 'unchanged';
  }

  const next = [...existing];
  next[currentIndex] = { ...current, command };
  hooks.sessionStart = next;
  config.hooks = hooks;
  return 'updated';
}

export async function runSetupHooks(): Promise<number> {
  try {
    const hooksPath = resolve(process.cwd(), '.cursor/hooks.json');
    const hookCommand = resolvePortableHookCommand();
    const hooks = readHooksFile(hooksPath);
    hooks.version = 1;
    const status = upsertSessionStartHook(hooks, hookCommand);

    mkdirSync(dirname(hooksPath), { recursive: true });
    writeFileSync(hooksPath, `${JSON.stringify(hooks, null, 2)}\n`, 'utf8');

    console.log(
      formatToon(buildSyncMeta(null, 'idle'), {
        setup: {
          target: 'cursor',
          status,
          hookPath: relative(process.cwd(), hooksPath) || '.cursor/hooks.json',
          hookCommand,
        },
        help: [
          'Codex: add `sessionStart` command to `.codex/hooks.json` and enable hooks in `config.toml`',
          'Claude Code: add `SessionStart` command hook in `.claude/settings.json`',
        ],
      }),
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to setup hooks';
    console.log(formatToon(buildSyncMeta(null, 'error'), { error: message }));
    return 1;
  }
}
