import { truncateForToon } from '@tooned/core';
import { buildCodeFileId, closeDb, getCodeFile, getDb } from '@tooned/sync';
import { fetchCodeFile, ServiceClientError } from '../client.js';
import { formatToon } from '../output.js';
import { handleServiceError, loadConfigOrEmitError, localSyncMeta } from './shared.js';

export function parseCodeViewInput(input: string): { accountId: string; repository: string; path: string } | null {
  const colonIndex = input.indexOf(':');
  if (colonIndex <= 0) {
    return null;
  }
  const path = input.slice(colonIndex + 1);
  const accountRepo = input.slice(0, colonIndex);
  const slashIndex = accountRepo.indexOf('/');
  if (slashIndex <= 0 || !path) {
    return null;
  }
  return {
    accountId: accountRepo.slice(0, slashIndex),
    repository: accountRepo.slice(slashIndex + 1),
    path,
  };
}

export async function runCodeView(input: string, options: { full?: boolean }): Promise<number> {
  const config = loadConfigOrEmitError();
  if (!config) return 1;

  const parsed = parseCodeViewInput(input);
  if (!parsed) {
    console.log(
      formatToon(localSyncMeta(config), {
        error: `Could not parse code file reference: ${input}`,
        help: ['Use format `<account>/<repository>:<path>`', 'Example: `gh/acme/tools:README.md`'],
      }),
    );
    return 1;
  }

  const fileId = buildCodeFileId(parsed.accountId, parsed.repository, parsed.path);

  try {
    const response = await fetchCodeFile(config, {
      accountId: parsed.accountId,
      repository: parsed.repository,
      path: parsed.path,
    });
    const content = options.full
      ? response.file.content ?? ''
      : truncateForToon(response.file.content ?? response.file.excerpt ?? '').value;
    console.log(
      formatToon(response.syncMeta, {
        file: {
          fileId: response.file.fileId,
          accountId: response.file.accountId,
          repository: response.file.repository,
          path: response.file.path,
          ref: response.file.ref,
          language: response.file.language,
          sizeBytes: response.file.sizeBytes,
          content,
        },
        help: options.full ? undefined : ['Run `tooned code view <ref> --full` for complete file content'],
      }),
    );
    return 0;
  } catch (error) {
    if (!(error instanceof ServiceClientError)) {
      return handleServiceError(config, error);
    }
  }

  const db = getDb(config.TOONED_DATA_DIR);
  const file = getCodeFile(db, fileId);
  closeDb();
  if (!file) {
    console.log(
      formatToon(localSyncMeta(config), {
        error: `Code file not found: ${input}`,
        help: ['Run `tooned sync --force` to index configured repositories'],
      }),
    );
    return 1;
  }

  const content = options.full ? file.content ?? '' : truncateForToon(file.content ?? '').value;
  console.log(
    formatToon(localSyncMeta(config), {
      file: {
        fileId: file.id,
        accountId: file.accountId,
        repository: file.repository,
        path: file.path,
        ref: file.ref,
        language: file.language,
        sizeBytes: file.sizeBytes,
        content,
      },
      help: options.full ? undefined : ['Run `tooned code view <ref> --full` for complete file content'],
    }),
  );
  return 0;
}
