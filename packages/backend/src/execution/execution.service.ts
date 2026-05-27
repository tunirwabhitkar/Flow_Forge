import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../db/data-source.js';
import { ExecutionEntity, WorkflowEntity } from '../db/entities.js';
import { config } from '../config/index.js';
import {
  WorkflowExecutionEngine,
  globalEventBus,
  globalNodeRegistry,
  type WorkflowDefinition,
  type ExecutionRunData,
  type NodeExecutionData,
} from '@flowforge/core';
import { credentialService } from '../credentials/credential.service.js';
import { binaryDataService } from './binary-data.service.js';
import { logger } from '../observability/logger.js';
import {
  executionStarted,
  executionCompleted,
  executionDuration,
} from '../observability/metrics.js';
import { NotFoundError } from '@flowforge/core';

export interface StartExecutionInput {
  workflowId: string;
  mode: string;
  userId?: string;
  inputData?: NodeExecutionData[];
  startNodeName?: string;
  runData?: ExecutionRunData;
  sessionId?: string;
}

export interface WebhookExecutionInput {
  workflowId: string;
  nodeId: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  isTest: boolean;
}

// Max concurrent in-process executions
const activeExecutions = new Map<string, AbortController>();

export class ExecutionService {
  private get execRepo() {
    return AppDataSource.getRepository(ExecutionEntity);
  }
  private get workflowRepo() {
    return AppDataSource.getRepository(WorkflowEntity);
  }

  async execute(input: StartExecutionInput): Promise<ExecutionEntity> {
    const workflow = await this.workflowRepo.findOne({ where: { id: input.workflowId } });
    if (!workflow) throw new NotFoundError('Workflow', input.workflowId);

    const workflowDef = this.deserializeWorkflow(workflow);
    const executionId = uuidv4();

    // Create execution record
    const execution = this.execRepo.create({
      id: executionId,
      workflowId: input.workflowId,
      status: 'running',
      mode: input.mode,
      workflowData: JSON.stringify(workflowDef),
      startedAt: new Date(),
    });
    await this.execRepo.save(execution);

    executionStarted.inc({ workflow_id: input.workflowId, mode: input.mode });
    globalEventBus.emit('execution:started', {
      executionId,
      workflowId: input.workflowId,
      mode: input.mode,
    });

    // Queue mode → hand off to Bull
    if (config.EXECUTIONS_MODE === 'queue') {
      await this.enqueueExecution(executionId, input, workflowDef);
      return execution;
    }

    // Regular mode → run in process
    this.runInProcess(executionId, workflowDef, input).catch((err) => {
      logger.error('Unhandled execution error', { err, executionId });
    });

    return execution;
  }

  private async runInProcess(
    executionId: string,
    workflowDef: WorkflowDefinition,
    input: StartExecutionInput,
  ): Promise<void> {
    const timeoutMs = (workflowDef.settings?.executionTimeout ?? config.EXECUTIONS_TIMEOUT) * 1000;
    const abortController = new AbortController();
    activeExecutions.set(executionId, abortController);

    const timer = executionDuration.startTimer({
      workflow_id: input.workflowId,
      status: 'pending',
    });

    try {
      const engine = new WorkflowExecutionEngine({
        nodeRegistry: globalNodeRegistry.toExecutionMap(),
        timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
        onNodeStart: (nodeId, nodeName) => {
          logger.debug(`Node started: ${nodeName}`, { nodeId, executionId });
        },
        onNodeFinish: (nodeId, nodeName) => {
          logger.debug(`Node finished: ${nodeName}`, { nodeId, executionId });
        },
        onNodeError: (nodeId, nodeName, error) => {
          logger.error(`Node error: ${nodeName}`, { nodeId, executionId, error });
        },
        binaryDataManager: binaryDataService,
      });

      const result = await engine.run(workflowDef, executionId, input.inputData, input.startNodeName);
      const status = result.status === 'success' ? 'success' : 'error';

      await this.execRepo.update(executionId, {
        status,
        stoppedAt: new Date(),
        data: JSON.stringify({
          resultData: {
            runData: result.runData,
            lastNodeExecuted: result.lastNodeExecuted,
            error: result.error ? { message: result.error.message, stack: result.error.stack } : undefined,
          },
        }),
      });

      timer({ status });
      executionCompleted.inc({ workflow_id: input.workflowId, status });
      globalEventBus.emit('execution:finished', {
        executionId,
        workflowId: input.workflowId,
        status,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Execution crashed', { err: error, executionId });

      await this.execRepo.update(executionId, {
        status: 'crashed',
        stoppedAt: new Date(),
        data: JSON.stringify({ error: { message: error.message } }),
      });

      timer({ status: 'crashed' });
      executionCompleted.inc({ workflow_id: input.workflowId, status: 'crashed' });
      globalEventBus.emit('execution:error', {
        executionId,
        workflowId: input.workflowId,
        error,
      });
    } finally {
      activeExecutions.delete(executionId);
    }
  }

  async executeWebhook(input: WebhookExecutionInput): Promise<{
    webhookResponse?: { statusCode?: number; headers?: Record<string, string>; body?: unknown };
  }> {
    const triggerData: NodeExecutionData[] = [{
      json: {
        body: input.body,
        headers: input.headers,
        query: input.query,
        method: input.method,
        path: input.path,
      },
    }];

    await this.execute({
      workflowId: input.workflowId,
      mode: input.isTest ? 'manual' : 'webhook',
      inputData: triggerData,
    });

    return {};
  }

  async cancel(executionId: string): Promise<void> {
    const controller = activeExecutions.get(executionId);
    controller?.abort();

    await this.execRepo.update(executionId, {
      status: 'canceled',
      stoppedAt: new Date(),
    });

    globalEventBus.emit('execution:canceled', { executionId });
    logger.info(`Execution canceled: ${executionId}`);
  }

  async retry(executionId: string): Promise<ExecutionEntity> {
    const original = await this.execRepo.findOne({ where: { id: executionId } });
    if (!original) throw new NotFoundError('Execution', executionId);

    const workflowData = original.workflowData ? JSON.parse(original.workflowData) as WorkflowDefinition : null;
    if (!workflowData) throw new Error('Cannot retry: workflow data not found');

    return this.execute({
      workflowId: original.workflowId,
      mode: 'retry',
      inputData: undefined,
    });
  }

  async findAll(workflowId?: string, limit = 20, offset = 0): Promise<[ExecutionEntity[], number]> {
    const qb = this.execRepo
      .createQueryBuilder('e')
      .withDeleted()
      .where('e.deleted_at IS NULL')
      .orderBy('e.started_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (workflowId) qb.andWhere('e.workflow_id = :workflowId', { workflowId });

    return qb.getManyAndCount();
  }

  async findById(id: string): Promise<ExecutionEntity | null> {
    return this.execRepo.findOne({ where: { id } });
  }

  async softDelete(id: string): Promise<void> {
    await this.execRepo.softDelete(id);
  }

  async hardDelete(id: string): Promise<void> {
    await this.execRepo.delete(id);
  }

  private deserializeWorkflow(entity: WorkflowEntity): WorkflowDefinition {
    return {
      id: entity.id,
      name: entity.name,
      active: entity.active,
      nodes: JSON.parse(entity.nodes),
      connections: JSON.parse(entity.connections),
      settings: entity.settings ? JSON.parse(entity.settings) : undefined,
      staticData: entity.staticData ? JSON.parse(entity.staticData) : undefined,
    };
  }

  private async enqueueExecution(
    executionId: string,
    input: StartExecutionInput,
    workflowDef: WorkflowDefinition,
  ): Promise<void> {
    // Dynamically import Bull to avoid loading it in regular mode
    const { default: Queue } = await import('bull');
    const { getRedisOptions } = await import('../config/index.js');
    const queue = new Queue('executions', { redis: getRedisOptions() as any });

    await queue.add(
      { executionId, workflowDef, input },
      {
        jobId: executionId,
        attempts: 1,
        timeout: (workflowDef.settings?.executionTimeout ?? config.EXECUTIONS_TIMEOUT) * 1000 || undefined,
      },
    );
    await queue.close();
  }
}

export const executionService = new ExecutionService();
