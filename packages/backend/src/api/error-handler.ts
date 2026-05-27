import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  FlowForgeError,
  ApiError,
  UserError,
  ValidationError,
  isFlowForgeError,
} from '@flowforge/core';
import { logger } from '../observability/logger.js';

interface ErrorResponse {
  error: string;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  stack?: string;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation error
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.');
      fieldErrors[path] = fieldErrors[path] ?? [];
      fieldErrors[path]!.push(issue.message);
    }
    res.status(422).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fieldErrors,
    } satisfies ErrorResponse);
    return;
  }

  // Known FlowForge errors
  if (isFlowForgeError(err)) {
    const status = err instanceof ApiError
      ? err.httpStatus
      : err instanceof UserError
        ? err.httpStatus
        : 500;

    if (status >= 500) {
      logger.error(err.message, { err: err.toJSON(), path: req.path, method: req.method });
    } else {
      logger.warn(err.message, { code: err instanceof ApiError ? err.code : undefined });
    }

    const body: ErrorResponse = {
      error: err.message,
      code: err instanceof ApiError ? err.code : undefined,
    };

    if (err instanceof ValidationError && err.fieldErrors) {
      body.fieldErrors = err.fieldErrors;
    }

    res.status(status).json(body);
    return;
  }

  // TypeORM / DB errors
  if ((err as any)?.code === 'SQLITE_CONSTRAINT' || (err as any)?.code === '23505') {
    res.status(409).json({ error: 'Unique constraint violation', code: 'CONFLICT' });
    return;
  }

  // Unknown errors
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  const body: ErrorResponse = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  };

  if (process.env['NODE_ENV'] !== 'production') {
    body.stack = error.stack;
    body.message = error.message;
  }

  res.status(500).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
}
