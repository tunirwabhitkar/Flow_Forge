import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

function createLogger(): winston.Logger {
  const transports: winston.transport[] = [];

  const shouldLog = config.LOG_OUTPUT;

  if (shouldLog === 'console' || shouldLog === 'both') {
    transports.push(
      new winston.transports.Console({
        format: config.NODE_ENV === 'development' ? devFormat : prodFormat,
      }),
    );
  }

  if (shouldLog === 'file' || shouldLog === 'both') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: prodFormat,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: prodFormat,
      }),
    );
  }

  return winston.createLogger({
    level: config.LOG_LEVEL,
    defaultMeta: { service: 'flowforge' },
    transports,
  });
}

export const logger = createLogger();

// HTTP request logger middleware
export function httpLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.http('Request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: Date.now() - start,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    });
    next();
  };
}
