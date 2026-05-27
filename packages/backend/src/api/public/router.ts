import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requireScope } from '../../auth/middleware.js';
import { workflowService } from '../../execution/workflow.service.js';
import { executionService } from '../../execution/execution.service.js';
import { credentialService } from '../../credentials/credential.service.js';
import { config } from '../../config/index.js';
import { NotFoundError } from '@flowforge/core';

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const defaultLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests on this endpoint.' },
});

export function createPublicApiRouter(): Router {
  const r = Router();

  r.use(defaultLimiter);

  // ─── Health ───────────────────────────────────────────────────────────────

  r.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: process.env['npm_package_version'] ?? '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Workflows ────────────────────────────────────────────────────────────

  r.get(
    '/workflows',
    authenticate,
    requireScope('read:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limit = Math.min(Number(req.query['limit'] ?? 25), 250);
        const cursor = req.query['cursor'] as string | undefined;
        const offset = cursor ? parseInt(Buffer.from(cursor, 'base64').toString(), 10) : 0;

        const [workflows, count] = await workflowService.findAll(undefined, limit, offset);
        const nextOffset = offset + limit;
        const nextCursor =
          nextOffset < count
            ? Buffer.from(String(nextOffset)).toString('base64')
            : null;

        res.json({
          data: workflows.map((w) => ({
            id: w.id,
            name: w.name,
            active: w.active,
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
            tags: [],
          })),
          nextCursor,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.post(
    '/workflows',
    authenticate,
    requireScope('write:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const schema = z.object({
          name: z.string().min(1).max(255),
          nodes: z.array(z.unknown()).default([]),
          connections: z.record(z.unknown()).default({}),
          settings: z.record(z.unknown()).optional(),
        });
        const body = schema.parse(req.body);
        const wf = await workflowService.create({ ...body, ownerId: req.user!.id });
        res.status(201).json({ id: wf.id, name: wf.name });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/workflows/:id',
    authenticate,
    requireScope('read:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const wf = await workflowService.findById(req.params['id']!);
        if (!wf) throw new NotFoundError('Workflow', req.params['id']);
        res.json(wf);
      } catch (err) {
        next(err);
      }
    },
  );

  r.put(
    '/workflows/:id',
    authenticate,
    requireScope('write:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const schema = z.object({
          name: z.string().min(1).max(255).optional(),
          nodes: z.array(z.unknown()).optional(),
          connections: z.record(z.unknown()).optional(),
          settings: z.record(z.unknown()).optional(),
          active: z.boolean().optional(),
        });
        const body = schema.parse(req.body);
        const wf = await workflowService.update(req.params['id']!, body, req.user!.id);
        res.json(wf);
      } catch (err) {
        next(err);
      }
    },
  );

  r.delete(
    '/workflows/:id',
    authenticate,
    requireScope('delete:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await workflowService.delete(req.params['id']!);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  r.post(
    '/workflows/:id/activate',
    authenticate,
    requireScope('write:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const wf = await workflowService.update(req.params['id']!, { active: true }, req.user!.id);
        res.json({ id: wf.id, active: wf.active });
      } catch (err) {
        next(err);
      }
    },
  );

  r.post(
    '/workflows/:id/deactivate',
    authenticate,
    requireScope('write:workflow'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const wf = await workflowService.update(req.params['id']!, { active: false }, req.user!.id);
        res.json({ id: wf.id, active: wf.active });
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── Executions ──────────────────────────────────────────────────────────

  r.post(
    '/workflows/:id/execute',
    authenticate,
    requireScope('write:execution'),
    strictLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const execution = await executionService.execute({
          workflowId: req.params['id']!,
          mode: 'manual',
          userId: req.user!.id,
        });
        res.status(201).json({
          executionId: execution.id,
          status: execution.status,
          startedAt: execution.startedAt,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/executions',
    authenticate,
    requireScope('read:execution'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
        const offset = Number(req.query['offset'] ?? 0);
        const workflowId = req.query['workflowId'] as string | undefined;
        const [executions, count] = await executionService.findAll(workflowId, limit, offset);
        res.json({
          data: executions.map((e) => ({
            id: e.id,
            workflowId: e.workflowId,
            status: e.status,
            mode: e.mode,
            startedAt: e.startedAt,
            stoppedAt: e.stoppedAt,
          })),
          count,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.get(
    '/executions/:id',
    authenticate,
    requireScope('read:execution'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ex = await executionService.findById(req.params['id']!);
        if (!ex) throw new NotFoundError('Execution', req.params['id']);
        res.json(ex);
      } catch (err) {
        next(err);
      }
    },
  );

  r.delete(
    '/executions/:id',
    authenticate,
    requireScope('delete:execution'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await executionService.softDelete(req.params['id']!);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  // ─── Credentials ─────────────────────────────────────────────────────────

  r.get(
    '/credentials',
    authenticate,
    requireScope('read:credential'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const creds = await credentialService.findAll();
        res.json({
          data: creds.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            createdAt: c.createdAt,
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  r.post(
    '/credentials',
    authenticate,
    requireScope('write:credential'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const schema = z.object({
          name: z.string().min(1),
          type: z.string().min(1),
          data: z.record(z.unknown()),
        });
        const body = schema.parse(req.body);
        const cred = await credentialService.create({ ...body, ownerId: req.user!.id });
        res.status(201).json({ id: cred.id, name: cred.name, type: cred.type });
      } catch (err) {
        next(err);
      }
    },
  );

  r.delete(
    '/credentials/:id',
    authenticate,
    requireScope('delete:credential'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await credentialService.delete(req.params['id']!);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return r;
}

// ─── OpenAPI Spec ─────────────────────────────────────────────────────────────

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'FlowForge Public API',
    description: 'REST API for managing workflows, executions, and credentials in FlowForge',
    version: '1.0.0',
    contact: { email: 'api@flowforge.io' },
    license: { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  },
  servers: [{ url: '/api/v1', description: 'FlowForge API v1' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT or API Key (ff_...)',
      },
    },
    schemas: {
      Workflow: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Execution: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workflowId: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['new', 'running', 'success', 'error', 'canceled', 'waiting', 'crashed'],
          },
          mode: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          stoppedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        operationId: 'getHealth',
        security: [],
        responses: { '200': { description: 'Service healthy' } },
      },
    },
    '/workflows': {
      get: {
        summary: 'List workflows',
        operationId: 'listWorkflows',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'List of workflows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Workflow' } },
                    nextCursor: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
