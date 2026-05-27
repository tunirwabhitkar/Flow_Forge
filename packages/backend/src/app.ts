import 'reflect-metadata';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

import { config } from './config/index.js';
import { createInternalRouter } from './api/internal/router.js';
import { createPublicApiRouter, openApiSpec } from './api/public/router.js';
import { createAIRouter } from './api/internal/ai-router.js';
import { errorHandler, notFoundHandler } from './api/error-handler.js';
import { httpLogger } from './observability/logger.js';
import { metricsRegistry, apiRequests, apiRequestDuration } from './observability/metrics.js';
import { handleWebhookRequest } from './webhooks/webhook.registry.js';

export function createApp(): Express {
  const app = express();

  // ─── Security Headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: config.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ─── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow all in dev, restrict in prod
        if (config.NODE_ENV !== 'production' || !origin) return cb(null, true);
        const allowed = [
          config.FLOWFORGE_EDITOR_BASE_URL,
          `http://localhost:5678`,
          `http://localhost:5173`,
        ].filter(Boolean);
        cb(null, allowed.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    }),
  );

  // ─── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(config.COOKIE_SECRET));

  // ─── HTTP logging ─────────────────────────────────────────────────────────
  app.use(httpLogger());

  // ─── Prometheus metrics middleware ────────────────────────────────────────
  app.use((req, res, next) => {
    const timer = apiRequestDuration.startTimer({ method: req.method, path: req.route?.path ?? req.path });
    res.on('finish', () => {
      apiRequests.inc({ method: req.method, path: req.route?.path ?? req.path, status: String(res.statusCode) });
      timer();
    });
    next();
  });

  // ─── Metrics endpoint ─────────────────────────────────────────────────────
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  // ─── Webhook routes ───────────────────────────────────────────────────────
  // Production webhooks (always live)
  app.all('/webhook/:path(*)', (req, res) => handleWebhookRequest(req, res, 'production'));

  // Test webhooks (short-lived, for editor testing)
  app.all('/webhook-test/:path(*)', (req, res) => handleWebhookRequest(req, res, 'test'));

  // Form/waiting webhooks
  app.all('/webhook-waiting/:path(*)', (req, res) => handleWebhookRequest(req, res, 'form'));

  // ─── API routes ───────────────────────────────────────────────────────────
  // Internal (frontend) API
  app.use('/rest', createInternalRouter());

  // AI assistant routes
  app.use('/rest/ai', createAIRouter());

  // Public API v1
  app.use('/api/v1', createPublicApiRouter());

  // ─── OpenAPI / Swagger ────────────────────────────────────────────────────
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/api/v1/openapi.json', (_req, res) => res.json(openApiSpec));

  // ─── Error handling ───────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
