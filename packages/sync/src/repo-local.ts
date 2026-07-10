import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isGitRepo, listGitTrackedFiles } from './repo-git.js';
import {
  hasDeniedPathSegment,
  isDeniedExtension,
  isDeniedSecretBasename,
  isTextSourcePath,
} from './repo-crawl-policy.js';

export function resolveLocalPath(path: string, cwd: string = process.cwd()): string {
  const expanded = path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
  return resolve(cwd, expanded);
}

export function localPathExists(path: string, cwd?: string): boolean {
  try {
    return statSync(resolveLocalPath(path, cwd)).isDirectory();
  } catch {
    return false;
  }
}

function shouldIncludeLocalPath(path: string): boolean {
  if (isDeniedSecretBasename(path) || hasDeniedPathSegment(path) || isDeniedExtension(path)) {
    return false;
  }
  return isTextSourcePath(path);
}

export function warnLocalPathIndexingSafety(rootPath: string, isGitCheckout: boolean): void {
  if (isGitCheckout) {
    console.warn(
      `warn: localPath ${rootPath} uses git ls-files — .gitignore excludes untracked files, but tracked secrets, local data, and node_modules can still be indexed if committed`,
    );
    return;
  }
  console.warn(
    `warn: localPath ${rootPath} is not a git repository — .gitignore is NOT applied; only built-in denylists are used (prefer source: cache to avoid leaking secrets or data)`,
  );
}

function walkLocalDirectory(rootPath: string, relativePrefix = ''): string[] {
  const entries = readdirSync(join(rootPath, relativePrefix), { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (hasDeniedPathSegment(relativePath)) {
        continue;
      }
      paths.push(...walkLocalDirectory(rootPath, relativePath));
      continue;
    }
    if (entry.isFile() && shouldIncludeLocalPath(relativePath)) {
      paths.push(relativePath);
    }
  }
  return paths;
}

export async function listLocalCrawlablePaths(rootPath: string): Promise<string[]> {
  if (isGitRepo(rootPath)) {
    const tracked = await listGitTrackedFiles(rootPath);
    return tracked.filter(shouldIncludeLocalPath);
  }
  return walkLocalDirectory(rootPath);
}

export function readLocalSourceFile(rootPath: string, path: string): string {
  return readFileSync(join(rootPath, path), 'utf8');
}
