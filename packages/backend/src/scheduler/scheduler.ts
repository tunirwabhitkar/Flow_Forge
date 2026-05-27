import cron from 'node-cron';
import { DateTime } from 'luxon';
import { AppDataSource } from '../db/data-source.js';
import { ExecutionEntity, WorkflowEntity } from '../db/entities.js';
import { executionService } from '../execution/execution.service.js';
import { binaryDataService } from '../execution/binary-data.service.js';
import { config } from '../config/index.js';
import { logger } from '../observability/logger.js';
import { LessThan, IsNull, Not } from 'typeorm';

interface CronJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  tz?: string;
}

export class Scheduler {
  private readonly tasks: cron.ScheduledTask[] = [];

  start(): void {
    const jobs: CronJob[] = [
      {
        name: 'execution-pruner-soft',
        schedule: '0 * * * *', // Every hour
        task: () => this.pruneExecutions(),
      },
      {
        name: 'execution-pruner-hard',
        schedule: '30 * * * *', // Every hour + 30 min
        task: () => this.hardDeleteExecutions(),
      },
      {
        name: 'binary-data-gc',
        schedule: '0 2 * * *', // 2am daily
        task: () => this.garbageCollectBinaryData(),
      },
      {
        name: 'stale-webhook-cleanup',
        schedule: '0 3 * * *', // 3am daily
        task: () => this.cleanStaleTestWebhooks(),
      },
      {
        name: 'workflow-cron-dispatcher',
        schedule: '* * * * *', // Every minute
        task: () => this.dispatchCronWorkflows(),
      },
    ];

    for (const job of jobs) {
      const task = cron.schedule(
        job.schedule,
        async () => {
          logger.debug(`Running scheduled job: ${job.name}`);
          try {
            await job.task();
          } catch (err) {
            logger.error(`Scheduled job failed: ${job.name}`, { err });
          }
        },
        { timezone: 'UTC' },
      );
      this.tasks.push(task);
      logger.info(`Scheduled job registered: ${job.name} (${job.schedule})`);
    }
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    logger.info('All scheduled jobs stopped');
  }

  private async pruneExecutions(): Promise<void> {
    if (!config.EXECUTIONS_DATA_PRUNE) return;

    const cutoff = DateTime.utc()
      .minus({ hours: config.EXECUTIONS_DATA_MAX_AGE })
      .toJSDate();

    const repo = AppDataSource.getRepository(ExecutionEntity);
    const result = await repo
      .createQueryBuilder()
      .softDelete()
      .where('started_at < :cutoff', { cutoff })
      .andWhere('deleted_at IS NULL')
      .andWhere("status IN ('success', 'error', 'canceled')")
      .execute();

    if (result.affected && result.affected > 0) {
      logger.info(`Soft-deleted ${result.affected} executions older than ${config.EXECUTIONS_DATA_MAX_AGE}h`);
    }
  }

  private async hardDeleteExecutions(): Promise<void> {
    const cutoff = DateTime.utc()
      .minus({ hours: config.EXECUTIONS_DATA_HARD_DELETE_BUFFER })
      .toJSDate();

    const repo = AppDataSource.getRepository(ExecutionEntity);
    const toDelete = await repo.find({
      withDeleted: true,
      where: {
        deletedAt: LessThan(cutoff),
      },
      take: 500,
    });

    if (toDelete.length === 0) return;

    await repo.remove(toDelete);
    logger.info(`Hard-deleted ${toDelete.length} executions`);
  }

  private async garbageCollectBinaryData(): Promise<void> {
    const maxAgeMs = config.EXECUTIONS_DATA_MAX_AGE * 60 * 60 * 1000;
    const deleted = await binaryDataService.garbageCollect(maxAgeMs);
    logger.info(`Binary GC complete: ${deleted} files removed`);
  }

  private async cleanStaleTestWebhooks(): Promise<void> {
    const { WebhookEntity } = await import('../db/entities.js');
    const repo = AppDataSource.getRepository(WebhookEntity);

    const cutoff = DateTime.utc().minus({ days: 1 }).toJSDate();
    const stale = await repo.find({
      where: {
        webhookType: 'test',
        createdAt: LessThan(cutoff),
      } as any,
    });

    if (stale.length > 0) {
      await repo.remove(stale);
      logger.info(`Cleaned ${stale.length} stale test webhooks`);
    }
  }

  private async dispatchCronWorkflows(): Promise<void> {
    const now = DateTime.utc();
    const repo = AppDataSource.getRepository(WorkflowEntity);

    // Find active workflows with cron triggers
    const activeWorkflows = await repo.find({ where: { active: true } });

    for (const wf of activeWorkflows) {
      try {
        const nodes = JSON.parse(wf.nodes) as Array<{ type: string; parameters: Record<string, unknown> }>;
        const cronNodes = nodes.filter((n) => n.type === 'flowforge.scheduleTrigger');

        for (const node of cronNodes) {
          const cronExpr = node.parameters['cronExpression'] as string | undefined;
          if (!cronExpr) continue;

          // Check if this cron should fire now
          if (cron.validate(cronExpr) && this.shouldFireNow(cronExpr, now)) {
            await executionService.execute({
              workflowId: wf.id,
              mode: 'trigger',
            });
          }
        }
      } catch (err) {
        logger.error(`Cron dispatch failed for workflow ${wf.id}`, { err });
      }
    }
  }

  private shouldFireNow(expression: string, now: DateTime): boolean {
    // Simplified check — in production use a proper cron parser
    // This is just for demonstration
    return cron.validate(expression);
  }
}

export const scheduler = new Scheduler();
