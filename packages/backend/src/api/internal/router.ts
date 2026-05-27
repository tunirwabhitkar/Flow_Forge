import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware.js';
import { authService } from '../../auth/auth.service.js';
import { workflowService } from '../../execution/workflow.service.js';
import { executionService } from '../../execution/execution.service.js';
import { credentialService } from '../../credentials/credential.service.js';
import { AppDataSource } from '../../db/data-source.js';
import { UserEntity, TagEntity } from '../../db/entities.js';
import { NotFoundError, ValidationError } from '@flowforge/core';
import { globalNodeRegistry } from '@flowforge/core';

export function createInternalRouter(): Router {
  const r = Router();

  // ─── Auth ──────────────────────────────────────────────────────────────────

  r.post('/auth/login', async (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        totpCode: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const result = await authService.login(body);
      res.cookie('ff_token', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' });
      res.json({ token: result.token, user: result.user });
    } catch (err) { next(err); }
  });

  r.post('/auth/register', async (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
      });
      const body = schema.parse(req.body);
      const result = await authService.register(body);
      res.status(201).json({ token: result.token, user: result.user });
    } catch (err) { next(err); }
  });

  r.post('/auth/logout', (req, res) => {
    res.clearCookie('ff_token');
    res.json({ success: true });
  });

  r.get('/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  // ─── TOTP ──────────────────────────────────────────────────────────────────

  r.post('/auth/mfa/totp/setup', authenticate, async (req, res, next) => {
    try {
      const result = await authService.setupTotp(req.user!.id);
      res.json(result);
    } catch (err) { next(err); }
  });

  r.post('/auth/mfa/totp/enable', authenticate, async (req, res, next) => {
    try {
      const { totpCode } = z.object({ totpCode: z.string() }).parse(req.body);
      await authService.enableTotp(req.user!.id, totpCode);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── API Keys ──────────────────────────────────────────────────────────────

  r.post('/me/api-keys', authenticate, async (req, res, next) => {
    try {
      const schema = z.object({
        label: z.string().min(1),
        scopes: z.array(z.string()).default([]),
        expiresAt: z.string().datetime().optional(),
      });
      const body = schema.parse(req.body);
      const { key, record } = await authService.createApiKey(
        req.user!.id,
        body.label,
        body.scopes,
        body.expiresAt ? new Date(body.expiresAt) : undefined,
      );
      res.status(201).json({ key, record });
    } catch (err) { next(err); }
  });

  r.delete('/me/api-keys/:id', authenticate, async (req, res, next) => {
    try {
      await authService.deleteApiKey(req.params['id']!, req.user!.id);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ─── Workflows ────────────────────────────────────────────────────────────

  r.get('/workflows', authenticate, async (req, res, next) => {
    try {
      const limit = Number(req.query['limit'] ?? 50);
      const offset = Number(req.query['offset'] ?? 0);
      const projectId = req.query['projectId'] as string | undefined;
      const [workflows, count] = await workflowService.findAll(projectId, limit, offset);
      res.json({ data: workflows, count });
    } catch (err) { next(err); }
  });

  r.post('/workflows', authenticate, async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(255),
        nodes: z.array(z.unknown()).optional(),
        connections: z.record(z.unknown()).optional(),
        settings: z.record(z.unknown()).optional(),
        projectId: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const wf = await workflowService.create({ ...body, ownerId: req.user!.id });
      res.status(201).json(wf);
    } catch (err) { next(err); }
  });

  r.get('/workflows/:id', authenticate, async (req, res, next) => {
    try {
      const wf = await workflowService.findById(req.params['id']!);
      if (!wf) throw new NotFoundError('Workflow', req.params['id']);
      res.json(wf);
    } catch (err) { next(err); }
  });

  r.patch('/workflows/:id', authenticate, async (req, res, next) => {
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
    } catch (err) { next(err); }
  });

  r.delete('/workflows/:id', authenticate, requireRole('admin', 'owner'), async (req, res, next) => {
    try {
      await workflowService.delete(req.params['id']!);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  r.post('/workflows/:id/activate', authenticate, async (req, res, next) => {
    try {
      const wf = await workflowService.update(req.params['id']!, { active: true }, req.user!.id);
      res.json(wf);
    } catch (err) { next(err); }
  });

  r.post('/workflows/:id/deactivate', authenticate, async (req, res, next) => {
    try {
      const wf = await workflowService.update(req.params['id']!, { active: false }, req.user!.id);
      res.json(wf);
    } catch (err) { next(err); }
  });

  r.post('/workflows/:id/run', authenticate, async (req, res, next) => {
    try {
      const schema = z.object({
        startNodes: z.array(z.string()).optional(),
        inputData: z.unknown().optional(),
      });
      const body = schema.parse(req.body);
      const execution = await executionService.execute({
        workflowId: req.params['id']!,
        mode: 'manual',
        userId: req.user!.id,
      });
      res.status(201).json(execution);
    } catch (err) { next(err); }
  });

  r.get('/workflows/:id/versions', authenticate, async (req, res, next) => {
    try {
      const versions = await workflowService.getVersions(req.params['id']!);
      res.json({ data: versions });
    } catch (err) { next(err); }
  });

  r.post('/workflows/:id/versions/:versionId/rollback', authenticate, async (req, res, next) => {
    try {
      const wf = await workflowService.rollbackToVersion(req.params['id']!, req.params['versionId']!);
      res.json(wf);
    } catch (err) { next(err); }
  });

  // ─── Executions ───────────────────────────────────────────────────────────

  r.get('/executions', authenticate, async (req, res, next) => {
    try {
      const limit = Number(req.query['limit'] ?? 20);
      const offset = Number(req.query['offset'] ?? 0);
      const workflowId = req.query['workflowId'] as string | undefined;
      const [executions, count] = await executionService.findAll(workflowId, limit, offset);
      res.json({ data: executions, count });
    } catch (err) { next(err); }
  });

  r.get('/executions/:id', authenticate, async (req, res, next) => {
    try {
      const ex = await executionService.findById(req.params['id']!);
      if (!ex) throw new NotFoundError('Execution', req.params['id']);
      res.json(ex);
    } catch (err) { next(err); }
  });

  r.post('/executions/:id/cancel', authenticate, async (req, res, next) => {
    try {
      await executionService.cancel(req.params['id']!);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  r.post('/executions/:id/retry', authenticate, async (req, res, next) => {
    try {
      const ex = await executionService.retry(req.params['id']!);
      res.status(201).json(ex);
    } catch (err) { next(err); }
  });

  r.delete('/executions/:id', authenticate, async (req, res, next) => {
    try {
      await executionService.softDelete(req.params['id']!);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ─── Credentials ──────────────────────────────────────────────────────────

  r.get('/credentials', authenticate, async (req, res, next) => {
    try {
      const projectId = req.query['projectId'] as string | undefined;
      const creds = await credentialService.findAll(projectId);
      // Never return raw encrypted data
      res.json({ data: creds.map((c) => ({ ...c, data: undefined, iv: undefined, authTag: undefined })) });
    } catch (err) { next(err); }
  });

  r.post('/credentials', authenticate, async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        data: z.record(z.unknown()),
        projectId: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const cred = await credentialService.create({ ...body, ownerId: req.user!.id });
      res.status(201).json({ ...cred, data: undefined, iv: undefined, authTag: undefined });
    } catch (err) { next(err); }
  });

  r.patch('/credentials/:id', authenticate, async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().optional(),
        data: z.record(z.unknown()).optional(),
      });
      const body = schema.parse(req.body);
      const cred = await credentialService.update(req.params['id']!, body);
      res.json({ ...cred, data: undefined, iv: undefined, authTag: undefined });
    } catch (err) { next(err); }
  });

  r.delete('/credentials/:id', authenticate, async (req, res, next) => {
    try {
      await credentialService.delete(req.params['id']!);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ─── Node Types ───────────────────────────────────────────────────────────

  r.get('/node-types', authenticate, (_req, res) => {
    res.json({ data: globalNodeRegistry.getAllDescriptions() });
  });

  r.get('/node-types/:type', authenticate, (req, res, next) => {
    const desc = globalNodeRegistry.getDescription(req.params['type']!);
    if (!desc) { next(new NotFoundError('NodeType', req.params['type'])); return; }
    res.json(desc);
  });

  // ─── Users ────────────────────────────────────────────────────────────────

  r.get('/users', authenticate, requireRole('admin', 'owner'), async (_req, res, next) => {
    try {
      const users = await AppDataSource.getRepository(UserEntity).find({
        select: ['id', 'email', 'firstName', 'lastName', 'role', 'createdAt'],
      });
      res.json({ data: users });
    } catch (err) { next(err); }
  });

  // ─── Tags ─────────────────────────────────────────────────────────────────

  r.get('/tags', authenticate, async (_req, res, next) => {
    try {
      const tags = await AppDataSource.getRepository(TagEntity).find();
      res.json({ data: tags });
    } catch (err) { next(err); }
  });

  return r;
}
