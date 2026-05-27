import 'reflect-metadata';
import { createApp } from './app.js';
import { initDatabase, closeDatabase } from './db/data-source.js';
import { binaryDataService } from './execution/binary-data.service.js';
import { webhookRegistry } from './webhooks/webhook.registry.js';
import { scheduler } from './scheduler/scheduler.js';
import { config } from './config/index.js';
import { logger } from './observability/logger.js';
import { globalEventBus } from '@flowforge/core';
import { loadAllNodes } from './nodes/loader.js';

async function bootstrap(): Promise<void> {
  logger.info('🔥 FlowForge starting up...', {
    env: config.NODE_ENV,
    mode: config.EXECUTIONS_MODE,
    db: config.DB_TYPE,
  });

  // Init DB
  await initDatabase();

  // Init binary storage
  await binaryDataService.initialize();

  // Load all built-in nodes into the registry
  await loadAllNodes();

  // Load webhooks into cache
  await webhookRegistry.initialize();

  // Start background scheduler
  if (config.EXECUTIONS_MODE === 'regular') {
    scheduler.start();
  }

  // Start HTTP server
  const app = createApp();
  const server = app.listen(config.FLOWFORGE_PORT, config.FLOWFORGE_HOST, () => {
    logger.info(`🚀 FlowForge API ready at http://${config.FLOWFORGE_HOST}:${config.FLOWFORGE_PORT}`);
    logger.info(`📖 API docs: http://${config.FLOWFORGE_HOST}:${config.FLOWFORGE_PORT}/api/v1/docs`);
    globalEventBus.emit('system:startup', {});
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully...`);
    globalEventBus.emit('system:shutdown', {});
    scheduler.stop();

    server.close(async () => {
      await closeDatabase();
      logger.info('FlowForge shut down cleanly');
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err });
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
