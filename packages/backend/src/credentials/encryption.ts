import crypto from 'crypto';
import { config } from '../config/index.js';
import { CredentialDecryptionError } from '@flowforge/core';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export interface EncryptedPayload {
  encryptedData: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts a JSON-serializable value using AES-256-GCM.
 */
export function encryptCredential(data: Record<string, unknown>): EncryptedPayload {
  const key = deriveKey(config.FLOWFORGE_ENCRYPTION_KEY);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts credential data previously encrypted with encryptCredential().
 */
export function decryptCredential(payload: EncryptedPayload): Record<string, unknown> {
  try {
    const key = deriveKey(config.FLOWFORGE_ENCRYPTION_KEY);
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as Record<string, unknown>;
  } catch {
    throw new CredentialDecryptionError('unknown');
  }
}

/**
 * Encrypts sensitive string (e.g. for stored tokens).
 */
export function encryptString(value: string): string {
  const { encryptedData, iv, authTag } = encryptCredential({ v: value });
  return `${iv}:${authTag}:${encryptedData}`;
}

export function decryptString(encoded: string): string {
  const [iv, authTag, encryptedData] = encoded.split(':');
  if (!iv || !authTag || !encryptedData) throw new Error('Invalid encrypted string format');
  const result = decryptCredential({ iv, authTag, encryptedData });
  return result['v'] as string;
}

// ─── OAuth token helpers ─────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export function encryptOAuthTokens(tokens: OAuthTokens): EncryptedPayload {
  return encryptCredential(tokens as unknown as Record<string, unknown>);
}

export function decryptOAuthTokens(payload: EncryptedPayload): OAuthTokens {
  return decryptCredential(payload) as unknown as OAuthTokens;
}

// ─── Hash helpers ────────────────────────────────────────────────────────────

export function hashApiKey(key: string): string {
  return crypto.createHmac('sha256', config.FLOWFORGE_ENCRYPTION_KEY).update(key).digest('hex');
}

export function generateApiKey(): string {
  return `ff_${crypto.randomBytes(24).toString('hex')}`;
}
