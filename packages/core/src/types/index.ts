import { z } from 'zod';

// ─── Primitive Types ─────────────────────────────────────────────────────────

export type NodeId = string;
export type WorkflowId = string;
export type ExecutionId = string;
export type CredentialId = string;
export type UserId = string;
export type ProjectId = string;

// ─── Node Parameter Types ────────────────────────────────────────────────────

export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'options'
  | 'multiOptions'
  | 'collection'
  | 'fixedCollection'
  | 'resourceLocator'
  | 'credentialsSelect'
  | 'color'
  | 'dateTime'
  | 'code'
  | 'hidden';

export interface ParameterOption {
  name: string;
  value: string | number | boolean;
  description?: string;
}

export interface NodeParameter {
  displayName: string;
  name: string;
  type: ParameterType;
  default?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: ParameterOption[];
  typeOptions?: {
    multipleValues?: boolean;
    rows?: number;
    language?: 'javascript' | 'python' | 'json' | 'html' | 'markdown';
    loadOptionsMethod?: string;
    loadOptionsDependsOn?: string[];
    numberStepSize?: number;
    minValue?: number;
    maxValue?: number;
  };
  displayOptions?: {
    show?: Record<string, (string | number | boolean)[]>;
    hide?: Record<string, (string | number | boolean)[]>;
  };
  credentialTypes?: string[];
  noDataExpression?: boolean;
  extractValue?: {
    type: 'regex';
    regex: string;
  };
}

// ─── Node Definition ────────────────────────────────────────────────────────

export type NodeCategory =
  | 'trigger'
  | 'action'
  | 'transform'
  | 'flow'
  | 'communication'
  | 'crm'
  | 'database'
  | 'cloud'
  | 'devTools'
  | 'ecommerce'
  | 'marketing'
  | 'ai'
  | 'utility';

export interface NodeInput {
  type: 'main' | 'ai_tool' | 'ai_memory' | 'ai_embedding';
  displayName?: string;
  required?: boolean;
  maxConnections?: number;
}

export interface NodeOutput {
  type: 'main' | 'ai_tool' | 'ai_memory' | 'ai_embedding';
  displayName?: string;
}

export interface NodeDescription {
  displayName: string;
  name: string;
  group: NodeCategory[];
  version: number | number[];
  description: string;
  subtitle?: string;
  icon?: string;
  iconColor?: string;
  color?: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
  credentials?: Array<{ name: string; required?: boolean; displayOptions?: unknown }>;
  properties: NodeParameter[];
  defaults: {
    name: string;
    color?: string;
  };
  documentationUrl?: string;
  triggerPanel?: {
    header?: string;
    executionsHelp?: { inactive: string; active: string };
  };
}

// ─── Workflow Graph ─────────────────────────────────────────────────────────

export interface WorkflowNode {
  id: NodeId;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: CredentialId; name: string }>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  continueOnFail?: boolean;
  onError?: 'continueRegularOutput' | 'continueErrorOutput' | 'stopWorkflow';
}

export interface WorkflowConnection {
  node: NodeId;
  type: 'main' | 'ai_tool' | 'ai_memory' | 'ai_embedding';
  index: number;
}

export type WorkflowConnections = Record<
  NodeId,
  Record<string, WorkflowConnection[][]>
>;

export interface WorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  saveDataErrorExecution?: 'all' | 'none';
  saveDataSuccessExecution?: 'all' | 'none';
  saveManualExecutions?: boolean;
  saveExecutionProgress?: boolean;
  executionTimeout?: number;
  timezone?: string;
  callerIds?: string;
  callerPolicy?: 'workflowsFromAList' | 'any' | 'none';
  errorWorkflow?: WorkflowId;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  name: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnections;
  active: boolean;
  settings?: WorkflowSettings;
  staticData?: Record<string, unknown>;
  tags?: string[];
  versionId?: string;
  meta?: {
    templateId?: string;
    instanceId?: string;
  };
}

// ─── Execution Types ────────────────────────────────────────────────────────

export type ExecutionStatus =
  | 'new'
  | 'running'
  | 'success'
  | 'error'
  | 'canceled'
  | 'waiting'
  | 'crashed';

export type ExecutionMode =
  | 'cli'
  | 'error'
  | 'integrated'
  | 'internal'
  | 'manual'
  | 'retry'
  | 'trigger'
  | 'webhook';

export interface NodeExecutionData {
  json: Record<string, unknown>;
  binary?: Record<string, BinaryData>;
  pairedItem?: { item: number; input?: number } | Array<{ item: number; input?: number }>;
  error?: string;
}

export interface BinaryData {
  mimeType: string;
  fileType?: string;
  fileExtension?: string;
  data: string; // base64 or reference ID
  fileName?: string;
  fileSize?: number;
  id?: string; // for stored binary references
}

export type NodeOutput_data = NodeExecutionData[][];

export interface ExecutionRunData {
  [nodeName: string]: NodeOutput_data;
}

export interface ExecutionData {
  startData?: {
    destinationNode?: string;
    runNodeFilter?: string[];
  };
  resultData: {
    error?: Error;
    runData: ExecutionRunData;
    pinData?: Record<string, NodeExecutionData[]>;
    lastNodeExecuted?: string;
  };
  executionData?: {
    contextData: Record<string, unknown>;
    nodeExecutionStack: Array<{
      node: WorkflowNode;
      data: { main: NodeExecutionData[][] };
      source: Record<string, Array<{ previousNode: string; previousNodeOutput?: number }>>;
    }>;
    waitingExecution: Record<string, NodeOutput_data>;
    waitingExecutionSource: Record<string, unknown>;
  };
}

export interface ExecutionRecord {
  id: ExecutionId;
  workflowId: WorkflowId;
  status: ExecutionStatus;
  mode: ExecutionMode;
  startedAt: Date;
  stoppedAt?: Date;
  data: ExecutionData;
  workflowData: WorkflowDefinition;
  retryOf?: ExecutionId;
  retrySuccessId?: ExecutionId;
  deletedAt?: Date;
}

// ─── Node Execution Context ────────────────────────────────────────────────

export interface NodeExecutionContext {
  workflowId: WorkflowId;
  executionId: ExecutionId;
  node: WorkflowNode;
  workflow: WorkflowDefinition;
  runIndex: number;
  itemIndex: number;

  // Data access
  getInputData(inputIndex?: number, inputName?: string): NodeExecutionData[];
  getNodeParameter<T = unknown>(paramName: string, itemIndex: number, fallback?: T): T;
  getCredentials<T extends object>(type: string): Promise<T>;
  helpers: ExecutionHelpers;

  // Execution control
  sendMessageToUI(message: string): void;
  logNodeOutput(data: unknown): void;
}

export interface ExecutionHelpers {
  request(options: RequestOptions): Promise<unknown>;
  requestWithAuthentication(
    credentialType: string,
    requestOptions: RequestOptions,
    credentialData?: Record<string, unknown>,
  ): Promise<unknown>;
  prepareBinaryData(
    data: Buffer,
    fileName?: string,
    mimeType?: string,
  ): Promise<BinaryData>;
  getBinaryDataBuffer(binaryData: BinaryData): Promise<Buffer>;
  returnJsonArray(data: unknown[]): NodeExecutionData[];
  constructExecutionMetaData(
    inputData: NodeExecutionData[],
    options: { itemData: { item: number } | Array<{ item: number }> },
  ): NodeExecutionData[];
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  qs?: Record<string, unknown>;
  body?: unknown;
  json?: boolean;
  timeout?: number;
  auth?: { user: string; pass: string };
  encoding?: string | null;
  resolveWithFullResponse?: boolean;
}

// ─── Node Interface ─────────────────────────────────────────────────────────

export interface INode {
  description: NodeDescription;
  execute?(context: NodeExecutionContext): Promise<NodeOutput_data>;
  trigger?(context: NodeExecutionContext): Promise<void>;
  webhook?(context: NodeExecutionContext): Promise<WebhookResponse>;
  poll?(context: NodeExecutionContext): Promise<NodeOutput_data | null>;
  loadOptions?: Record<
    string,
    (context: NodeExecutionContext) => Promise<ParameterOption[]>
  >;
}

export interface WebhookResponse {
  workflowData?: NodeExecutionData[][];
  webhookResponse?: {
    body?: string | object;
    headers?: Record<string, string>;
    statusCode?: number;
  };
  noWebhookResponse?: boolean;
}

// ─── Credential Types ───────────────────────────────────────────────────────

export type CredentialAuthType =
  | 'oAuth1Api'
  | 'oAuth2Api'
  | 'apiKey'
  | 'basicAuth'
  | 'bearerAuth'
  | 'awsSignature'
  | 'custom';

export interface CredentialTypeDescription {
  name: string;
  displayName: string;
  authType: CredentialAuthType;
  properties: NodeParameter[];
  extends?: string[];
  documentationUrl?: string;
  icon?: string;
  httpRequestNode?: {
    hidden?: boolean;
  };
}

// ─── Zod schemas ────────────────────────────────────────────────────────────

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()),
  credentials: z.record(z.object({ id: z.string(), name: z.string() })).optional(),
  disabled: z.boolean().optional(),
  retryOnFail: z.boolean().optional(),
  maxTries: z.number().optional(),
  continueOnFail: z.boolean().optional(),
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255),
  nodes: z.array(WorkflowNodeSchema),
  connections: z.record(z.record(z.array(z.array(z.object({
    node: z.string(),
    type: z.string(),
    index: z.number(),
  }))))),
  active: z.boolean(),
  settings: z.object({
    executionTimeout: z.number().optional(),
    timezone: z.string().optional(),
    errorWorkflow: z.string().optional(),
  }).optional(),
});
