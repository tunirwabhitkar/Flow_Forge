import { z } from 'zod';
import 'dotenv/config';

const Env = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FLOWFORGE_PORT: z.coerce.number().default(5678),
  FLOWFORGE_HOST: z.string().default('0.0.0.0'),
  FLOWFORGE_WEBHOOK_URL: z.string().url().optional(),
  FLOWFORGE_EDITOR_BASE_URL: z.string().url().optional(),
  FLOWFORGE_INSTANCE_ID: z.string().optional(),

  // Database
  DB_TYPE: z.enum(['sqlite', 'postgres', 'mysql']).default('sqlite'),
  DB_SQLITE_DATABASE: z.string().default('./flowforge.db'),
  DB_POSTGRESDB_HOST: z.string().default('localhost'),
  DB_POSTGRESDB_PORT: z.coerce.number().default(5432),
  DB_POSTGRESDB_DATABASE: z.string().default('flowforge'),
  DB_POSTGRESDB_USER: z.string().default('flowforge'),
  DB_POSTGRESDB_PASSWORD: z.string().default(''),
  DB_POSTGRESDB_SCHEMA: z.string().default('public'),
  DB_MYSQLDB_HOST: z.string().default('localhost'),
  DB_MYSQLDB_PORT: z.coerce.number().default(3306),
  DB_MYSQLDB_DATABASE: z.string().default('flowforge'),
  DB_MYSQLDB_USER: z.string().default('flowforge'),
  DB_MYSQLDB_PASSWORD: z.string().default(''),

  // Security
  FLOWFORGE_ENCRYPTION_KEY: z.string().min(32).default('change-me-in-production-32-chars!!'),
  JWT_SECRET: z.string().min(32).default('change-me-jwt-secret-32-chars!!!!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().default('change-me-cookie-secret'),

  // Execution
  EXECUTIONS_MODE: z.enum(['regular', 'queue']).default('regular'),
  EXECUTIONS_TIMEOUT: z.coerce.number().default(0), // 0 = no timeout
  EXECUTIONS_TIMEOUT_MAX: z.coerce.number().default(3600),
  FLOWFORGE_CONCURRENCY_PRODUCTION_LIMIT: z.coerce.number().default(10),
  EXECUTIONS_DATA_SAVE_ON_ERROR: z.enum(['all', 'none']).default('all'),
  EXECUTIONS_DATA_SAVE_ON_SUCCESS: z.enum(['all', 'none']).default('none'),
  EXECUTIONS_DATA_PRUNE: z.boolean({ coerce: true }).default(true),
  EXECUTIONS_DATA_MAX_AGE: z.coerce.number().default(336), // hours
  EXECUTIONS_DATA_HARD_DELETE_BUFFER: z.coerce.number().default(48), // hours

  // Queue / Redis
  QUEUE_BULL_REDIS_HOST: z.string().default('localhost'),
  QUEUE_BULL_REDIS_PORT: z.coerce.number().default(6379),
  QUEUE_BULL_REDIS_PASSWORD: z.string().default(''),
  QUEUE_BULL_REDIS_DB: z.coerce.number().default(0),
  REDIS_URL: z.string().optional(),

  // Binary data
  BINARY_DATA_STORAGE_PATH: z.string().default('./binary-data'),
  BINARY_DATA_MODE: z.enum(['filesystem', 's3']).default('filesystem'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(180),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),

  // SMTP / email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@flowforge.local'),

  // External secrets
  EXTERNAL_SECRETS_PROVIDER: z.enum(['aws', 'azure', 'vault', 'none']).default('none'),
  EXTERNAL_SECRETS_AWS_REGION: z.string().default('us-east-1'),
  EXTERNAL_SECRETS_AZURE_VAULT_URL: z.string().optional(),

  // AI
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ASSISTANT_MODEL: z.string().default('claude-opus-4-20250514'),

  // Observability
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_OUTPUT: z.enum(['console', 'file', 'both']).default('console'),
  SENTRY_DSN: z.string().optional(),
  OTEL_ENABLED: z.boolean({ coerce: true }).default(false),
  OTEL_ENDPOINT: z.string().optional(),

  // Auth
  USER_MANAGEMENT_DISABLED: z.boolean({ coerce: true }).default(false),
  LDAP_ENABLED: z.boolean({ coerce: true }).default(false),
  LDAP_HOST: z.string().optional(),
  LDAP_PORT: z.coerce.number().default(389),
  SAML_ENABLED: z.boolean({ coerce: true }).default(false),
  OIDC_ENABLED: z.boolean({ coerce: true }).default(false),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

function loadConfig(): Config {
  const result = Env.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const config: Config = loadConfig();

// Derived helpers
export const isDev = () => config.NODE_ENV === 'development';
export const isProd = () => config.NODE_ENV === 'production';
export const isTest = () => config.NODE_ENV === 'test';
export const isQueueMode = () => config.EXECUTIONS_MODE === 'queue';

export function getDbConnectionOptions() {
  switch (config.DB_TYPE) {
    case 'sqlite':
      return {
        type: 'better-sqlite3' as const,
        database: config.DB_SQLITE_DATABASE,
        synchronize: config.NODE_ENV !== 'production',
      };
    case 'postgres':
      return {
        type: 'postgres' as const,
        host: config.DB_POSTGRESDB_HOST,
        port: config.DB_POSTGRESDB_PORT,
        database: config.DB_POSTGRESDB_DATABASE,
        username: config.DB_POSTGRESDB_USER,
        password: config.DB_POSTGRESDB_PASSWORD,
        schema: config.DB_POSTGRESDB_SCHEMA,
        synchronize: false,
      };
    case 'mysql':
      return {
        type: 'mysql' as const,
        host: config.DB_MYSQLDB_HOST,
        port: config.DB_MYSQLDB_PORT,
        database: config.DB_MYSQLDB_DATABASE,
        username: config.DB_MYSQLDB_USER,
        password: config.DB_MYSQLDB_PASSWORD,
        synchronize: false,
      };
    default:
      throw new Error(`Unsupported DB_TYPE: ${config.DB_TYPE}`);
  }
}

export function getRedisOptions() {
  if (config.REDIS_URL) {
    return { url: config.REDIS_URL };
  }
  return {
    host: config.QUEUE_BULL_REDIS_HOST,
    port: config.QUEUE_BULL_REDIS_PORT,
    password: config.QUEUE_BULL_REDIS_PASSWORD || undefined,
    db: config.QUEUE_BULL_REDIS_DB,
  };
}
