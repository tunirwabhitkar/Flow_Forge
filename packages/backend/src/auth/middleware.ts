import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { AppDataSource } from '../db/data-source.js';
import { UserEntity } from '../db/entities.js';
import { UnauthorizedError, ForbiddenError } from '@flowforge/core';
import type { UserRole } from '../db/entities.js';

// Extend Express Request
declare module 'express' {
  interface Request {
    user?: UserEntity;
    apiKeyScopes?: string[];
  }
}

/**
 * Parses and validates a JWT from the Authorization header or cookie.
 * Attaches `req.user` if valid.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // Try Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // Check if it's an API key
      if (token.startsWith('ff_')) {
        const apiKey = await authService.validateApiKey(token);
        if (!apiKey) throw new UnauthorizedError('Invalid API key');

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id: apiKey.userId } });
        if (!user) throw new UnauthorizedError('User not found');

        req.user = user;
        req.apiKeyScopes = apiKey.scopes ?? [];
        return next();
      }

      // JWT
      const payload = authService.verifyToken(token);
      const userRepo = AppDataSource.getRepository(UserEntity);
      const user = await userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedError('User not found');

      req.user = user;
      return next();
    }

    // Try session cookie
    if (req.cookies?.['ff_token']) {
      const payload = authService.verifyToken(req.cookies['ff_token'] as string);
      const userRepo = AppDataSource.getRepository(UserEntity);
      const user = await userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedError('User not found');
      req.user = user;
      return next();
    }

    throw new UnauthorizedError();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication — doesn't fail if no token present.
 */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    await authenticate(req, _res, () => undefined);
  } catch {
    // Ignore auth errors for optional auth
  }
  next();
}

/**
 * Require the user to have at least the specified role.
 * Role hierarchy: owner > admin > member > viewer
 */
const ROLE_WEIGHTS: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const userWeight = ROLE_WEIGHTS[req.user.role] ?? 0;
    const minRequired = Math.min(...roles.map((r) => ROLE_WEIGHTS[r] ?? 99));

    if (userWeight < minRequired) {
      next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`));
      return;
    }
    next();
  };
}

/**
 * Enforce API key scope. Only applies when request uses an API key.
 */
export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // If authenticated via session JWT, scopes don't restrict
    if (!req.apiKeyScopes) return next();

    if (!req.apiKeyScopes.includes(scope) && !req.apiKeyScopes.includes('*')) {
      next(new ForbiddenError(`API key missing required scope: ${scope}`));
      return;
    }
    next();
  };
}

/**
 * Shorthand: authenticate + requireRole
 */
export function requireAuth(...roles: UserRole[]) {
  return [authenticate, requireRole(...roles)];
}
