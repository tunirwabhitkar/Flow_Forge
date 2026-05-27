import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';
import { AppDataSource } from '../db/data-source.js';
import { WebhookEntity, WorkflowEntity } from '../db/entities.js';
import { globalEventBus } from '@flowforge/core';
import { ConflictError, NotFoundError } from '@flowforge/core';
import { executionService } from '../execution/execution.service.js';
import { logger } from '../observability/logger.js';
import { webhookRequests } from '../observability/metrics.js';

export type WebhookType = 'production' | 'test' | 'form';

export interface WebhookRegistration {
  workflowId: string;
  nodeId: string;
  nodeName: string;
  path: string;
  method: string;
  webhookType: WebhookType;
}

// In-memory cache for fast lookups (also persisted in DB)
const webhookCache = new Map<string, WebhookEntity>();

function cacheKey(method: string, path: string): string {
  return `${method.toUpperCase()}:${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export class WebhookRegistry {
  private get repo() {
    return AppDataSource.getRepository(WebhookEntity);
  }

  async initialize(): Promise<void> {
    // Load all production webhooks into memory
    const webhooks = await this.repo.find({ where: { webhookType: 'production' } });
    for (const wh of webhooks) {
      webhookCache.set(cacheKey(wh.method, wh.webhookPath), wh);
    }
    logger.info(`Webhook registry loaded ${webhooks.length} production webhooks`);
  }

  async register(reg: WebhookRegistration): Promise<WebhookEntity> {
    const key = cacheKey(reg.method, reg.path);

    // Check for collision
    const existing = await this.repo.findOne({
      where: { webhookPath: normalizePath(reg.path), method: reg.method.toUpperCase() },
    });

    if (existing && existing.workflowId !== reg.workflowId) {
      throw new ConflictError(
        `Webhook path collision: ${reg.method} ${reg.path} is already registered by workflow ${existing.workflowId}`,
      );
    }

    if (existing) return existing;

    const entity = this.repo.create({
      id: uuidv4(),
      workflowId: reg.workflowId,
      nodeId: reg.nodeId,
      nodeName: reg.nodeName,
      webhookPath: normalizePath(reg.path),
      method: reg.method.toUpperCase(),
      webhookType: reg.webhookType,
      pathLength: reg.path.split('/').length,
    });
    const saved = await this.repo.save(entity);

    if (reg.webhookType === 'production') {
      webhookCache.set(key, saved);
    }

    globalEventBus.emit('webhook:registered', {
      path: reg.path,
      workflowId: reg.workflowId,
      method: reg.method,
    });

    logger.info(`Webhook registered: ${reg.method} ${reg.path}`, { workflowId: reg.workflowId });
    return saved;
  }

  async unregister(workflowId: string, nodeId?: string): Promise<void> {
    const where: Partial<WebhookEntity> = { workflowId };
    if (nodeId) where.nodeId = nodeId;

    const webhooks = await this.repo.find({ where });
    for (const wh of webhooks) {
      const key = cacheKey(wh.method, wh.webhookPath);
      webhookCache.delete(key);
      globalEventBus.emit('webhook:unregistered', { path: wh.webhookPath });
    }
    await this.repo.remove(webhooks);
    logger.info(`Webhooks unregistered for workflow ${workflowId}`);
  }

  findInCache(method: string, path: string): WebhookEntity | undefined {
    return webhookCache.get(cacheKey(method, path));
  }

  async findInDb(method: string, path: string): Promise<WebhookEntity | null> {
    return this.repo.findOne({
      where: { webhookPath: normalizePath(path), method: method.toUpperCase() },
    });
  }
}

export const webhookRegistry = new WebhookRegistry();

// ─── Webhook Handler ─────────────────────────────────────────────────────────

export async function handleWebhookRequest(
  req: Request,
  res: Response,
  webhookType: WebhookType,
): Promise<void> {
  const path = req.params['path'] ?? req.path;
  const method = req.method;

  let webhook: WebhookEntity | undefined | null;

  if (webhookType === 'production') {
    webhook = webhookRegistry.findInCache(method, path) ?? await webhookRegistry.findInDb(method, path);
  } else {
    webhook = await webhookRegistry.findInDb(method, path);
  }

  if (!webhook) {
    webhookRequests.inc({ method, status: '404' });
    res.status(404).json({ error: 'Webhook not found' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const headers = req.headers as Record<string, string>;
  const query = req.query as Record<string, unknown>;

  logger.info(`Webhook triggered: ${method} ${path}`, { workflowId: webhook.workflowId });
  webhookRequests.inc({ method, status: '200' });

  try {
    const result = await executionService.executeWebhook({
      workflowId: webhook.workflowId,
      nodeId: webhook.nodeId,
      method,
      path,
      body,
      headers,
      query,
      isTest: webhookType === 'test',
    });

    if (result.webhookResponse) {
      const { statusCode = 200, headers: respHeaders = {}, body: respBody } = result.webhookResponse;
      for (const [key, val] of Object.entries(respHeaders)) {
        res.setHeader(key, val);
      }
      res.status(statusCode).json(respBody ?? { success: true });
    } else {
      res.status(200).json({ success: true });
    }
  } catch (err) {
    logger.error('Webhook execution error', { err, workflowId: webhook.workflowId });
    webhookRequests.inc({ method, status: '500' });
    res.status(500).json({ error: 'Webhook execution failed' });
  }
}
