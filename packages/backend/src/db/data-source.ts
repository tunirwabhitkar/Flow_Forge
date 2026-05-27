import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { config } from '../config/index.js';
import {
  UserEntity,
  ProjectEntity,
  ProjectMemberEntity,
  WorkflowEntity,
  WorkflowVersionEntity,
  CredentialEntity,
  ExecutionEntity,
  WebhookEntity,
  ApiKeyEntity,
  TagEntity,
  TagWorkflowEntity,
  InstalledNodeEntity,
} from './entities.js';
import { logger } from '../observability/logger.js';

const entities = [
  UserEntity,
  ProjectEntity,
  ProjectMemberEntity,
  WorkflowEntity,
  WorkflowVersionEntity,
  CredentialEntity,
  ExecutionEntity,
  WebhookEntity,
  ApiKeyEntity,
  TagEntity,
  TagWorkflowEntity,
  InstalledNodeEntity,
];

function buildOptions(): DataSourceOptions {
  const base = {
    entities,
    migrations: ['dist/db/migrations/*.js'],
    logging: config.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  };

  switch (config.DB_TYPE) {
    case 'sqlite':
      return {
        ...base,
        type: 'better-sqlite3',
        database: config.DB_SQLITE_DATABASE,
        synchronize: config.NODE_ENV !== 'production',
      } as DataSourceOptions;

    case 'postgres':
      return {
        ...base,
        type: 'postgres',
        host: config.DB_POSTGRESDB_HOST,
        port: config.DB_POSTGRESDB_PORT,
        database: config.DB_POSTGRESDB_DATABASE,
        username: config.DB_POSTGRESDB_USER,
        password: config.DB_POSTGRESDB_PASSWORD,
        schema: config.DB_POSTGRESDB_SCHEMA,
        synchronize: false,
        ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      } as DataSourceOptions;

    case 'mysql':
      return {
        ...base,
        type: 'mysql',
        host: config.DB_MYSQLDB_HOST,
        port: config.DB_MYSQLDB_PORT,
        database: config.DB_MYSQLDB_DATABASE,
        username: config.DB_MYSQLDB_USER,
        password: config.DB_MYSQLDB_PASSWORD,
        synchronize: false,
      } as DataSourceOptions;

    default:
      throw new Error(`Unsupported database type: ${config.DB_TYPE}`);
  }
}

export const AppDataSource = new DataSource(buildOptions());

export async function initDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) return;

  logger.info(`Connecting to ${config.DB_TYPE} database...`);
  await AppDataSource.initialize();
  logger.info('Database connected');

  // Run pending migrations for non-SQLite (SQLite uses synchronize in dev)
  if (config.DB_TYPE !== 'sqlite' || config.NODE_ENV === 'production') {
    const pending = await AppDataSource.showMigrations();
    if (pending) {
      logger.info('Running pending migrations...');
      await AppDataSource.runMigrations({ transaction: 'each' });
      logger.info('Migrations complete');
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('Database disconnected');
  }
}
