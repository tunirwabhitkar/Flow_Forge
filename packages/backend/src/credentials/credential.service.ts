import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../db/data-source.js';
import { CredentialEntity } from '../db/entities.js';
import { encryptCredential, decryptCredential } from './encryption.js';
import { config } from '../config/index.js';
import { NotFoundError, ForbiddenError } from '@flowforge/core';
import { logger } from '../observability/logger.js';

export interface CredentialCreateInput {
  name: string;
  type: string;
  data: Record<string, unknown>;
  projectId?: string;
  ownerId: string;
}

export interface CredentialUpdateInput {
  name?: string;
  data?: Record<string, unknown>;
}

export class CredentialService {
  private get repo() {
    return AppDataSource.getRepository(CredentialEntity);
  }

  async create(input: CredentialCreateInput): Promise<CredentialEntity> {
    const encrypted = encryptCredential(input.data);
    const cred = this.repo.create({
      id: uuidv4(),
      name: input.name,
      type: input.type,
      data: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      projectId: input.projectId,
      ownerId: input.ownerId,
    });
    return this.repo.save(cred);
  }

  async findAll(projectId?: string): Promise<CredentialEntity[]> {
    const qb = this.repo.createQueryBuilder('c');
    if (projectId) qb.where('c.project_id = :projectId', { projectId });
    return qb.getMany();
  }

  async findById(id: string): Promise<CredentialEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async update(id: string, input: CredentialUpdateInput): Promise<CredentialEntity> {
    const cred = await this.repo.findOne({ where: { id } });
    if (!cred) throw new NotFoundError('Credential', id);

    if (input.name) cred.name = input.name;
    if (input.data) {
      const encrypted = encryptCredential(input.data);
      cred.data = encrypted.encryptedData;
      cred.iv = encrypted.iv;
      cred.authTag = encrypted.authTag;
    }
    return this.repo.save(cred);
  }

  async delete(id: string): Promise<void> {
    const cred = await this.repo.findOne({ where: { id } });
    if (!cred) throw new NotFoundError('Credential', id);
    await this.repo.remove(cred);
  }

  /**
   * Decrypts and returns the raw credential data for use during execution.
   */
  async getDecryptedData(id: string): Promise<Record<string, unknown>> {
    // Check external secrets provider first
    if (config.EXTERNAL_SECRETS_PROVIDER !== 'none') {
      try {
        return await this.getFromExternalProvider(id);
      } catch (err) {
        logger.warn(`External secrets provider failed for ${id}, falling back to DB`, { err });
      }
    }

    const cred = await this.repo.findOne({ where: { id } });
    if (!cred) throw new NotFoundError('Credential', id);

    return decryptCredential({
      encryptedData: cred.data,
      iv: cred.iv!,
      authTag: cred.authTag!,
    });
  }

  private async getFromExternalProvider(_id: string): Promise<Record<string, unknown>> {
    switch (config.EXTERNAL_SECRETS_PROVIDER) {
      case 'aws':
        return this.getFromAwsSecretsManager(_id);
      case 'azure':
        return this.getFromAzureKeyVault(_id);
      default:
        throw new Error(`External provider '${config.EXTERNAL_SECRETS_PROVIDER}' not configured`);
    }
  }

  private async getFromAwsSecretsManager(secretName: string): Promise<Record<string, unknown>> {
    const AWS = await import('aws-sdk');
    const client = new AWS.SecretsManager({ region: config.EXTERNAL_SECRETS_AWS_REGION });
    const result = await client.getSecretValue({ SecretId: `flowforge/${secretName}` }).promise();
    const value = result.SecretString ?? Buffer.from(result.SecretBinary as string, 'base64').toString();
    return JSON.parse(value) as Record<string, unknown>;
  }

  private async getFromAzureKeyVault(secretName: string): Promise<Record<string, unknown>> {
    const { SecretClient } = await import('@azure/keyvault-secrets');
    const { DefaultAzureCredential } = await import('@azure/identity');
    if (!config.EXTERNAL_SECRETS_AZURE_VAULT_URL) throw new Error('EXTERNAL_SECRETS_AZURE_VAULT_URL not set');
    const client = new SecretClient(config.EXTERNAL_SECRETS_AZURE_VAULT_URL, new DefaultAzureCredential());
    const secret = await client.getSecret(`flowforge-${secretName}`);
    return JSON.parse(secret.value ?? '{}') as Record<string, unknown>;
  }
}

export const credentialService = new CredentialService();
