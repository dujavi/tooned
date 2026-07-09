import { serve } from '@hono/node-server';
import { config as loadDotenv } from 'dotenv';
import { loadConfig, formatConfigError } from '@tooned/core';
import { closeDb, getDb, runSync } from '@tooned/sync';
import { createApp } from './app.js';

loadDotenv();

export async function startService(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`error: ${formatConfigError(error)}`);
    process.exit(1);
  }

  getDb(config.TOONED_DATA_DIR);

  const app = createApp(config);
  const server = serve({
    fetch: app.fetch,
    port: config.TOONED_SERVICE_PORT,
  });
  let syncing = false;
  const syncTick = async () => {
    if (syncing) {
      return;
    }
    syncing = true;
    try {
      await runSync(config, { force: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Background sync failed';
      console.error(`error: ${message}`);
    } finally {
      syncing = false;
    }
  };

  const interval = setInterval(() => {
    void syncTick();
  }, config.TOONED_SYNC_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(interval);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startService().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Service failed to start';
    console.error(`error: ${message}`);
    process.exit(1);
  });
}
