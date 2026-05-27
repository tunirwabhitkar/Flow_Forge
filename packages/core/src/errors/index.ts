// ─── FlowForge Error Hierarchy ──────────────────────────────────────────────

export type ErrorSeverity = 'warning' | 'error' | 'critical';
export type ErrorCategory = 'user' | 'operational' | 'unexpected' | 'nodeExecution' | 'api';

export interface FlowForgeErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  retryable?: boolean;
  extra?: Record<string, unknown>;
}

/**
 * Base error for all FlowForge errors.
 */
export class FlowForgeError extends Error {
  readonly category: ErrorCategory = 'unexpected';
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly extra?: Record<string, unknown>;
  readonly cause?: Error;
  readonly timestamp: Date = new Date();

  constructor(message: string, options: FlowForgeErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.severity = options.severity ?? 'error';
    this.retryable = options.retryable ?? false;
    this.extra = options.extra;
    this.cause = options.cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      severity: this.severity,
      message: this.message,
      retryable: this.retryable,
      extra: this.extra,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Errors caused by bad user input or configuration. Not retryable.
 */
export class UserError extends FlowForgeError {
  readonly category: ErrorCategory = 'user';
  readonly httpStatus: number;

  constructor(message: string, options: FlowForgeErrorOptions & { httpStatus?: number } = {}) {
    super(message, { severity: 'warning', retryable: false, ...options });
    this.httpStatus = options.httpStatus ?? 400;
  }
}

/**
 * Errors that are expected to occur during normal operation.
 */
export class OperationalError extends FlowForgeError {
  readonly category: ErrorCategory = 'operational';

  constructor(message: string, options: FlowForgeErrorOptions = {}) {
    super(message, { severity: 'error', ...options });
  }
}

/**
 * Errors thrown during node execution.
 */
export class NodeExecutionError extends FlowForgeError {
  readonly category: ErrorCategory = 'nodeExecution';
  readonly nodeName: string;
  readonly nodeType: string;
  readonly itemIndex: number;
  readonly runIndex: number;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options: FlowForgeErrorOptions & {
      nodeName: string;
      nodeType: string;
      itemIndex?: number;
      runIndex?: number;
      context?: Record<string, unknown>;
    },
  ) {
    super(message, options);
    this.nodeName = options.nodeName;
    this.nodeType = options.nodeType;
    this.itemIndex = options.itemIndex ?? 0;
    this.runIndex = options.runIndex ?? 0;
    this.context = options.context;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      nodeName: this.nodeName,
      nodeType: this.nodeType,
      itemIndex: this.itemIndex,
      runIndex: this.runIndex,
      context: this.context,
    };
  }
}

/**
 * Errors from the REST API layer.
 */
export class ApiError extends FlowForgeError {
  readonly category: ErrorCategory = 'api';
  readonly httpStatus: number;
  readonly code?: string;

  constructor(
    message: string,
    options: FlowForgeErrorOptions & { httpStatus: number; code?: string } = {
      httpStatus: 500,
    },
  ) {
    super(message, options);
    this.httpStatus = options.httpStatus;
    this.code = options.code;
  }
}

// Convenience subclasses

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' not found` : `${resource} not found`, {
      httpStatus: 404,
      code: 'NOT_FOUND',
    });
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, { httpStatus: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, { httpStatus: 403, code: 'FORBIDDEN' });
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, { httpStatus: 409, code: 'CONFLICT' });
  }
}

export class ValidationError extends UserError {
  readonly fieldErrors?: Record<string, string[]>;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message, { httpStatus: 422 });
    this.fieldErrors = fieldErrors;
  }
}

export class WorkflowCycleError extends UserError {
  constructor(cycle: string[]) {
    super(`Workflow contains a cycle: ${cycle.join(' → ')}`, { httpStatus: 422 });
  }
}

export class ExecutionTimeoutError extends OperationalError {
  readonly executionId: string;
  readonly timeoutMs: number;

  constructor(executionId: string, timeoutMs: number) {
    super(`Execution ${executionId} timed out after ${timeoutMs}ms`, { retryable: false });
    this.executionId = executionId;
    this.timeoutMs = timeoutMs;
  }
}

export class CredentialDecryptionError extends OperationalError {
  constructor(credentialId: string) {
    super(`Failed to decrypt credential ${credentialId}`, { retryable: false });
  }
}

// Type guard
export function isFlowForgeError(e: unknown): e is FlowForgeError {
  return e instanceof FlowForgeError;
}

export function isRetryableError(e: unknown): boolean {
  return isFlowForgeError(e) && e.retryable;
}
