#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateSkillMarkdown } from '../packages/cli/dist/skill.js';

function run() {
  const checkMode = process.argv.includes('--check');
  const targetPath = resolve(process.cwd(), '.cursor/skills/tooned/SKILL.md');
  const nextContent = `${generateSkillMarkdown().trim()}\n`;

  mkdirSync(dirname(targetPath), { recursive: true });

  let currentContent = null;
  try {
    currentContent = readFileSync(targetPath, 'utf8');
  } catch {
    currentContent = null;
  }

  if (checkMode) {
    if (currentContent === nextContent) {
      process.stdout.write('SKILL.md is up to date\n');
      return;
    }
    process.stderr.write('SKILL.md is stale. Run `pnpm generate:skill`.\n');
    process.exit(1);
  }

  writeFileSync(targetPath, nextContent, 'utf8');
  process.stdout.write(`Generated ${targetPath}\n`);
}

run();
