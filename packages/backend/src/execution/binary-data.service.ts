import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { logger } from '../observability/logger.js';

export class BinaryDataService {
  private readonly basePath: string;

  constructor() {
    this.basePath = config.BINARY_DATA_STORAGE_PATH;
  }

  async initialize(): Promise<void> {
    if (config.BINARY_DATA_MODE === 'filesystem') {
      await fs.mkdir(this.basePath, { recursive: true });
    }
  }

  async store(buffer: Buffer, fileName?: string, mimeType?: string): Promise<string> {
    const id = uuidv4();

    if (config.BINARY_DATA_MODE === 's3') {
      return this.storeS3(id, buffer, fileName, mimeType);
    }
    return this.storeFilesystem(id, buffer);
  }

  async retrieve(id: string): Promise<Buffer> {
    if (config.BINARY_DATA_MODE === 's3') {
      return this.retrieveS3(id);
    }
    return this.retrieveFilesystem(id);
  }

  async delete(id: string): Promise<void> {
    if (config.BINARY_DATA_MODE === 's3') {
      await this.deleteS3(id);
    } else {
      await this.deleteFilesystem(id);
    }
  }

  private async storeFilesystem(id: string, buffer: Buffer): Promise<string> {
    const dir = path.join(this.basePath, id.slice(0, 2));
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, id);
    await fs.writeFile(filePath, buffer);
    return id;
  }

  private async retrieveFilesystem(id: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, id.slice(0, 2), id);
    return fs.readFile(filePath);
  }

  private async deleteFilesystem(id: string): Promise<void> {
    const filePath = path.join(this.basePath, id.slice(0, 2), id);
    await fs.unlink(filePath).catch(() => undefined);
  }

  private async storeS3(id: string, buffer: Buffer, fileName?: string, mimeType?: string): Promise<string> {
    const AWS = await import('aws-sdk');
    const s3 = new AWS.S3({ region: config.AWS_S3_REGION });
    await s3.putObject({
      Bucket: config.AWS_S3_BUCKET!,
      Key: `binary-data/${id}`,
      Body: buffer,
      ContentType: mimeType,
      ContentDisposition: fileName ? `attachment; filename="${fileName}"` : undefined,
    }).promise();
    return id;
  }

  private async retrieveS3(id: string): Promise<Buffer> {
    const AWS = await import('aws-sdk');
    const s3 = new AWS.S3({ region: config.AWS_S3_REGION });
    const result = await s3.getObject({
      Bucket: config.AWS_S3_BUCKET!,
      Key: `binary-data/${id}`,
    }).promise();
    return result.Body as Buffer;
  }

  private async deleteS3(id: string): Promise<void> {
    const AWS = await import('aws-sdk');
    const s3 = new AWS.S3({ region: config.AWS_S3_REGION });
    await s3.deleteObject({
      Bucket: config.AWS_S3_BUCKET!,
      Key: `binary-data/${id}`,
    }).promise();
  }

  /**
   * GC: delete binary files with no references older than maxAgeMs.
   */
  async garbageCollect(maxAgeMs: number): Promise<number> {
    if (config.BINARY_DATA_MODE !== 'filesystem') {
      logger.warn('Binary GC only supported for filesystem mode');
      return 0;
    }

    let deleted = 0;
    const cutoff = Date.now() - maxAgeMs;

    const subdirs = await fs.readdir(this.basePath).catch(() => [] as string[]);
    for (const sub of subdirs) {
      const subPath = path.join(this.basePath, sub);
      const stat = await fs.stat(subPath).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const files = await fs.readdir(subPath).catch(() => [] as string[]);
      for (const file of files) {
        const filePath = path.join(subPath, file);
        const fileStat = await fs.stat(filePath).catch(() => null);
        if (fileStat && fileStat.mtimeMs < cutoff) {
          await fs.unlink(filePath).catch(() => undefined);
          deleted++;
        }
      }
    }

    logger.info(`Binary GC: deleted ${deleted} files`);
    return deleted;
  }
}

export const binaryDataService = new BinaryDataService();
