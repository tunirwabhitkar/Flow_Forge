import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'flowforge_node_' });

// ─── Execution metrics ───────────────────────────────────────────────────────

export const executionStarted = new Counter({
  name: 'flowforge_executions_started_total',
  help: 'Total number of workflow executions started',
  labelNames: ['workflow_id', 'mode'],
  registers: [metricsRegistry],
});

export const executionCompleted = new Counter({
  name: 'flowforge_executions_completed_total',
  help: 'Total number of workflow executions completed',
  labelNames: ['workflow_id', 'status'],
  registers: [metricsRegistry],
});

export const executionDuration = new Histogram({
  name: 'flowforge_execution_duration_seconds',
  help: 'Workflow execution duration in seconds',
  labelNames: ['workflow_id', 'status'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

// ─── Queue metrics ───────────────────────────────────────────────────────────

export const queueDepth = new Gauge({
  name: 'flowforge_queue_depth',
  help: 'Number of jobs in the execution queue',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

export const activeWorkers = new Gauge({
  name: 'flowforge_active_workers',
  help: 'Number of active worker processes',
  registers: [metricsRegistry],
});

// ─── Webhook metrics ─────────────────────────────────────────────────────────

export const webhookRequests = new Counter({
  name: 'flowforge_webhook_requests_total',
  help: 'Total webhook requests received',
  labelNames: ['method', 'status'],
  registers: [metricsRegistry],
});

// ─── API metrics ─────────────────────────────────────────────────────────────

export const apiRequests = new Counter({
  name: 'flowforge_api_requests_total',
  help: 'Total API requests received',
  labelNames: ['method', 'path', 'status'],
  registers: [metricsRegistry],
});

export const apiRequestDuration = new Histogram({
  name: 'flowforge_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});
