import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowDefinition,
  WorkflowNode,
  NodeId,
  ExecutionData,
  ExecutionRunData,
  NodeExecutionData,
  NodeOutput_data,
  INode,
  NodeExecutionContext,
  ExecutionHelpers,
} from '../types/index.js';
import {
  WorkflowCycleError,
  NodeExecutionError,
  ExecutionTimeoutError,
} from '../errors/index.js';
import { EventBus } from '../events/event-bus.js';

// ─── DAG Graph Builder ───────────────────────────────────────────────────────

export interface AdjacencyList {
  /** outgoing edges: nodeId → [successor nodeIds] */
  successors: Map<NodeId, NodeId[]>;
  /** incoming edges: nodeId → [predecessor nodeIds] */
  predecessors: Map<NodeId, NodeId[]>;
}

export function buildAdjacencyList(workflow: WorkflowDefinition): AdjacencyList {
  const successors = new Map<NodeId, NodeId[]>();
  const predecessors = new Map<NodeId, NodeId[]>();

  // Initialise all nodes
  for (const node of workflow.nodes) {
    successors.set(node.id, []);
    predecessors.set(node.id, []);
  }

  // Build a name → id lookup
  const nameToId = new Map<string, NodeId>(workflow.nodes.map((n) => [n.name, n.id]));

  // Parse connections
  for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
    const sourceId = nameToId.get(sourceName);
    if (!sourceId) continue;

    for (const connectionList of Object.values(outputs)) {
      for (const connections of connectionList) {
        for (const conn of connections) {
          const targetId = nameToId.get(conn.node) ?? conn.node;
          successors.get(sourceId)?.push(targetId);
          predecessors.get(targetId)?.push(sourceId);
        }
      }
    }
  }

  return { successors, predecessors };
}

/**
 * Kahn's algorithm topological sort.
 * Returns ordered node IDs or throws WorkflowCycleError.
 */
export function topologicalSort(
  workflow: WorkflowDefinition,
  adj: AdjacencyList,
): NodeId[] {
  const inDegree = new Map<NodeId, number>();
  for (const node of workflow.nodes) {
    inDegree.set(node.id, adj.predecessors.get(node.id)?.length ?? 0);
  }

  const queue: NodeId[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: NodeId[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const successor of adj.successors.get(current) ?? []) {
      const newDeg = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, newDeg);
      if (newDeg === 0) queue.push(successor);
    }
  }

  if (sorted.length !== workflow.nodes.length) {
    // Find cycle for a helpful error message
    const remaining = workflow.nodes
      .filter((n) => !sorted.includes(n.id))
      .map((n) => n.name);
    throw new WorkflowCycleError(remaining);
  }

  return sorted;
}

/**
 * Find all trigger nodes (nodes with no predecessors).
 */
export function findTriggerNodes(workflow: WorkflowDefinition, adj: AdjacencyList): WorkflowNode[] {
  return workflow.nodes.filter(
    (n) => (adj.predecessors.get(n.id)?.length ?? 0) === 0,
  );
}

// ─── Execution Engine ────────────────────────────────────────────────────────

export interface ExecutionEngineOptions {
  /** Registry of node type → INode implementation */
  nodeRegistry: Map<string, INode>;
  /** Timeout in ms (0 = no timeout) */
  timeoutMs?: number;
  /** Called when a node starts executing */
  onNodeStart?: (nodeId: NodeId, nodeName: string) => void;
  /** Called when a node finishes executing */
  onNodeFinish?: (nodeId: NodeId, nodeName: string, output: NodeOutput_data) => void;
  /** Called when a node errors */
  onNodeError?: (nodeId: NodeId, nodeName: string, error: Error) => void;
  /** Binary data storage helper */
  binaryDataManager?: BinaryDataManager;
}

export interface BinaryDataManager {
  store(buffer: Buffer, fileName?: string, mimeType?: string): Promise<string>;
  retrieve(id: string): Promise<Buffer>;
}

export interface EngineRunResult {
  runData: ExecutionRunData;
  lastNodeExecuted?: string;
  error?: Error;
  status: 'success' | 'error';
}

export class WorkflowExecutionEngine {
  private readonly eventBus: EventBus;

  constructor(
    private readonly opts: ExecutionEngineOptions,
    eventBus?: EventBus,
  ) {
    this.eventBus = eventBus ?? new EventBus();
  }

  async run(
    workflow: WorkflowDefinition,
    executionId: string,
    inputData?: NodeExecutionData[],
    startNodeName?: string,
  ): Promise<EngineRunResult> {
    const adj = buildAdjacencyList(workflow);
    let executionOrder: NodeId[];

    try {
      executionOrder = topologicalSort(workflow, adj);
    } catch (err) {
      return { runData: {}, status: 'error', error: err as Error };
    }

    // Name lookup
    const nodeById = new Map(workflow.nodes.map((n) => [n.id, n]));
    const nodeByName = new Map(workflow.nodes.map((n) => [n.name, n]));

    // Accumulated run data: nodeName → output[][]
    const runData: ExecutionRunData = {};

    // If a specific start node is requested, filter execution order
    let orderToRun = executionOrder;
    if (startNodeName) {
      const startNode = nodeByName.get(startNodeName);
      if (startNode) {
        orderToRun = this.getDownstreamNodes(startNode.id, adj, executionOrder);
      }
    }

    // Timeout setup
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    if (this.opts.timeoutMs && this.opts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
      }, this.opts.timeoutMs);
    }

    let lastNodeExecuted: string | undefined;
    let executionError: Error | undefined;

    for (const nodeId of orderToRun) {
      if (timedOut) {
        executionError = new ExecutionTimeoutError(executionId, this.opts.timeoutMs ?? 0);
        break;
      }

      const node = nodeById.get(nodeId);
      if (!node) continue;
      if (node.disabled) continue;

      const nodeImpl = this.opts.nodeRegistry.get(node.type);
      if (!nodeImpl) {
        // Skip unknown nodes gracefully
        continue;
      }

      this.opts.onNodeStart?.(nodeId, node.name);
      this.eventBus.emit('node:started', { nodeId, nodeName: node.name, executionId });

      try {
        // Gather input data from predecessors
        const inputItems = this.gatherInputData(node, adj, runData, nodeByName, inputData);

        // Build context
        const context = this.buildContext(
          workflow,
          executionId,
          node,
          inputItems,
          runData,
        );

        const output = await nodeImpl.execute!(context);
        runData[node.name] = output;
        lastNodeExecuted = node.name;

        this.opts.onNodeFinish?.(nodeId, node.name, output);
        this.eventBus.emit('node:finished', { nodeId, nodeName: node.name, executionId, output });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const nodeError = new NodeExecutionError(error.message, {
          nodeName: node.name,
          nodeType: node.type,
          cause: error,
          retryable: node.retryOnFail ?? false,
        });

        this.opts.onNodeError?.(nodeId, node.name, nodeError);
        this.eventBus.emit('node:error', { nodeId, nodeName: node.name, executionId, error: nodeError });

        if (node.continueOnFail) {
          // Output the error as data so downstream nodes can handle it
          runData[node.name] = [[{ json: { error: error.message } }]];
          continue;
        }

        executionError = nodeError;
        break;
      }
    }

    if (timeoutHandle) clearTimeout(timeoutHandle);

    return {
      runData,
      lastNodeExecuted,
      error: executionError,
      status: executionError ? 'error' : 'success',
    };
  }

  private getDownstreamNodes(
    startId: NodeId,
    adj: AdjacencyList,
    sortedOrder: NodeId[],
  ): NodeId[] {
    const reachable = new Set<NodeId>();
    const stack = [startId];
    while (stack.length) {
      const curr = stack.pop()!;
      if (reachable.has(curr)) continue;
      reachable.add(curr);
      for (const s of adj.successors.get(curr) ?? []) stack.push(s);
    }
    return sortedOrder.filter((id) => reachable.has(id));
  }

  private gatherInputData(
    node: WorkflowNode,
    adj: AdjacencyList,
    runData: ExecutionRunData,
    nodeByName: Map<string, WorkflowNode>,
    triggerInput?: NodeExecutionData[],
  ): NodeExecutionData[] {
    const predecessorIds = adj.predecessors.get(node.id) ?? [];
    if (predecessorIds.length === 0) {
      // This is a trigger/start node
      return triggerInput ?? [{ json: {} }];
    }

    const allItems: NodeExecutionData[] = [];
    for (const predId of predecessorIds) {
      const predNode = [...nodeByName.values()].find((n) => n.id === predId);
      if (!predNode) continue;
      const predOutput = runData[predNode.name];
      if (predOutput?.[0]) {
        allItems.push(...predOutput[0]);
      }
    }

    return allItems.length > 0 ? allItems : [{ json: {} }];
  }

  private buildContext(
    workflow: WorkflowDefinition,
    executionId: string,
    node: WorkflowNode,
    inputItems: NodeExecutionData[],
    _runData: ExecutionRunData,
  ): NodeExecutionContext {
    const helpers: ExecutionHelpers = {
      returnJsonArray(data: unknown[]): NodeExecutionData[] {
        return data.map((item) => ({
          json: typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : { data: item },
        }));
      },
      async request(_options) {
        // Implemented by backend
        throw new Error('request() not implemented in core engine');
      },
      async requestWithAuthentication() {
        throw new Error('requestWithAuthentication() not implemented in core engine');
      },
      async prepareBinaryData(buffer, fileName, mimeType) {
        return {
          mimeType: mimeType ?? 'application/octet-stream',
          data: buffer.toString('base64'),
          fileName,
          fileSize: buffer.length,
        };
      },
      async getBinaryDataBuffer(binary) {
        return Buffer.from(binary.data, 'base64');
      },
      constructExecutionMetaData(inputData, options) {
        const { itemData } = options;
        const items = Array.isArray(itemData) ? itemData : [itemData];
        return inputData.map((item, i) => ({
          ...item,
          pairedItem: items[i] ?? { item: 0 },
        }));
      },
    };

    return {
      workflowId: workflow.id,
      executionId,
      node,
      workflow,
      runIndex: 0,
      itemIndex: 0,
      getInputData(inputIndex = 0, _inputName = 'main') {
        if (inputIndex === 0) return inputItems;
        return [{ json: {} }];
      },
      getNodeParameter<T = unknown>(paramName: string, _itemIndex: number, fallback?: T): T {
        const val = node.parameters[paramName];
        if (val === undefined || val === null) {
          if (fallback !== undefined) return fallback;
          throw new Error(`Parameter '${paramName}' not found on node '${node.name}'`);
        }
        return val as T;
      },
      async getCredentials<T extends object>(_type: string): Promise<T> {
        throw new Error('getCredentials() must be provided by the backend execution context');
      },
      sendMessageToUI(message: string) {
        console.log(`[UI Message] ${node.name}: ${message}`);
      },
      logNodeOutput(data: unknown) {
        console.log(`[Node Output] ${node.name}:`, data);
      },
      helpers,
    };
  }
}
