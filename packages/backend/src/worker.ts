import 'reflect-metadata';
import Queue from 'bull';
import { initDatabase } from './db/data-source.js';
import { binaryDataService } from './execution/binary-data.service.js';
import { loadAllNodes } from './nodes/loader.js';
import { config, getRedisOptions } from './config/index.js';
import { logger } from './observability/logger.js';
import {
  WorkflowExecutionEngine,
  globalNodeRegistry,
  globalEventBus,
  type WorkflowDefinition,
  type NodeExecutionData,
} from '@flowforge/core';
import { AppDataSource } from './db/data-source.js';
import { ExecutionEntity } from './db/entities.js';
import { activeWorkers } from './observability/metrics.js';

interface ExecutionJobData {
  executionId: string;
  workflowDef: WorkflowDefinition;
  input: {
    workflowId: string;
    mode: string;
    inputData?: NodeExecutionData[];
    startNodeName?: string;
  };
}

async function startWorker(): Promise<void> {
  logger.info('🔧 FlowForge worker starting in queue mode...');

  await initDatabase();
  await binaryDataService.initialize();
  await loadAllNodes();

  const queue = new Queue<ExecutionJobData>('executions', {
    redis: getRedisOptions() as any,
  });

  const concurrency = config.FLOWFORGE_CONCURRENCY_PRODUCTION_LIMIT;
  logger.info(`Worker ready. Concurrency: ${concurrency}`);
  activeWorkers.inc();

  queue.process(concurrency, async (job) => {
    const { executionId, workflowDef, input } = job.data;
    const execRepo = AppDataSource.getRepository(ExecutionEntity);

    logger.info(`Processing execution ${executionId}`, { workflowId: input.workflowId });

    await execRepo.update(executionId, { status: 'running' });
    globalEventBus.emit('execution:started', {
      executionId,
      workflowId: input.workflowId,
      mode: input.mode,
    });

    try {
      const engine = new WorkflowExecutionEngine({
        nodeRegistry: globalNodeRegistry.toExecutionMap(),
        timeoutMs:
          (workflowDef.settings?.executionTimeout ?? config.EXECUTIONS_TIMEOUT) * 1000 || undefined,
        binaryDataManager: binaryDataService,
      });

      const result = await engine.run(workflowDef, executionId, input.inputData, input.startNodeName);
      const status = result.status === 'success' ? 'success' : 'error';

      await execRepo.update(executionId, {
        status,
        stoppedAt: new Date(),
        data: JSON.stringify({
          resultData: {
            runData: result.runData,
            lastNodeExecuted: result.lastNodeExecuted,
            error: result.error ? { message: result.error.message } : undefined,
          },
        }),
      });

      globalEventBus.emit('execution:finished', {
        executionId,
        workflowId: input.workflowId,
        status,
      });

      return { status, executionId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await execRepo.update(executionId, {
        status: 'crashed',
        stoppedAt: new Date(),
        data: JSON.stringify({ error: { message: error.message } }),
      });
      globalEventBus.emit('execution:error', {
        executionId,
        workflowId: input.workflowId,
        error,
      });
      throw error;
    }
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed`, { err, executionId: job.data.executionId });
  });

  queue.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed`, { executionId: job.data.executionId });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} — worker shutting down`);
    activeWorkers.dec();
    await queue.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorker().catch((err) => {
  console.error('Worker startup error:', err);
  process.exit(1);
});
