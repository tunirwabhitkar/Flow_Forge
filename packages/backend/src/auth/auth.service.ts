import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../db/data-source.js';
import { UserEntity, ApiKeyEntity } from '../db/entities.js';
import { config } from '../config/index.js';
import { generateApiKey, hashApiKey } from '../credentials/encryption.js';
import {
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '@flowforge/core';
import { logger } from '../observability/logger.js';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface LoginInput {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResult {
  token: string;
  user: Omit<UserEntity, 'passwordHash' | 'totpSecret'>;
}

const SALT_ROUNDS = 12;

export class AuthService {
  private get userRepo() {
    return AppDataSource.getRepository(UserEntity);
  }
  private get apiKeyRepo() {
    return AppDataSource.getRepository(ApiKeyEntity);
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.userRepo.findOne({ where: { email: input.email } });
    if (existing) throw new ConflictError(`Email '${input.email}' is already registered`);

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const isFirstUser = (await this.userRepo.count()) === 0;

    const user = this.userRepo.create({
      id: uuidv4(),
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: isFirstUser ? 'owner' : 'member',
    });
    await this.userRepo.save(user);

    logger.info('User registered', { userId: user.id, email: user.email });
    return this.buildAuthResult(user);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepo.findOne({
      where: { email: input.email },
      select: ['id', 'email', 'passwordHash', 'firstName', 'lastName', 'role', 'mfaEnabled', 'totpSecret'],
    });

    if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    // TOTP check
    if (user.mfaEnabled && user.totpSecret) {
      if (!input.totpCode) throw new UnauthorizedError('MFA code required');
      const verified = speakeasy.totp.verify({
        secret: user.totpSecret,
        encoding: 'base32',
        token: input.totpCode,
        window: 1,
      });
      if (!verified) throw new UnauthorizedError('Invalid MFA code');
    }

    return this.buildAuthResult(user);
  }

  // ─── TOTP Setup ────────────────────────────────────────────────────────────

  async setupTotp(userId: string): Promise<{ secret: string; qrCodeUrl: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const secret = speakeasy.generateSecret({ name: `FlowForge (${user.email})`, length: 32 });
    user.totpSecret = secret.base32;
    await this.userRepo.save(user);

    return {
      secret: secret.base32,
      qrCodeUrl: secret.otpauth_url ?? '',
    };
  }

  async enableTotp(userId: string, totpCode: string): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'totpSecret', 'mfaEnabled'],
    });
    if (!user || !user.totpSecret) throw new ValidationError('TOTP not set up');

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!verified) throw new ValidationError('Invalid TOTP code');

    user.mfaEnabled = true;
    await this.userRepo.save(user);
  }

  // ─── JWT ───────────────────────────────────────────────────────────────────

  signToken(payload: JwtPayload): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  // ─── API Keys ──────────────────────────────────────────────────────────────

  async createApiKey(
    userId: string,
    label: string,
    scopes: string[] = [],
    expiresAt?: Date,
  ): Promise<{ key: string; record: ApiKeyEntity }> {
    const raw = generateApiKey();
    const keyHash = hashApiKey(raw);

    const record = this.apiKeyRepo.create({
      id: uuidv4(),
      userId,
      label,
      keyHash,
      scopes,
      expiresAt,
    });
    await this.apiKeyRepo.save(record);

    return { key: raw, record };
  }

  async validateApiKey(raw: string): Promise<ApiKeyEntity | null> {
    const keyHash = hashApiKey(raw);
    const record = await this.apiKeyRepo.findOne({
      where: { keyHash },
      relations: ['user'],
    });
    if (!record) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    // Update last used
    record.lastUsedAt = new Date();
    await this.apiKeyRepo.save(record);
    return record;
  }

  async deleteApiKey(id: string, userId: string): Promise<void> {
    const record = await this.apiKeyRepo.findOne({ where: { id, userId } });
    if (!record) throw new NotFoundError('API key', id);
    await this.apiKeyRepo.remove(record);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildAuthResult(user: UserEntity): AuthResult {
    const token = this.signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const { passwordHash: _, totpSecret: __, ...safeUser } = user;
    return { token, user: safeUser };
  }
}

export const authService = new AuthService();
