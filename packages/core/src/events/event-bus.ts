import EventEmitter from 'eventemitter3';

export type FlowForgeEventMap = {
  // Execution lifecycle
  'execution:started': { executionId: string; workflowId: string; mode: string };
  'execution:finished': { executionId: string; workflowId: string; status: string };
  'execution:error': { executionId: string; workflowId: string; error: Error };
  'execution:canceled': { executionId: string };

  // Node lifecycle
  'node:started': { nodeId: string; nodeName: string; executionId: string };
  'node:finished': { nodeId: string; nodeName: string; executionId: string; output: unknown };
  'node:error': { nodeId: string; nodeName: string; executionId: string; error: Error };

  // Workflow lifecycle
  'workflow:activated': { workflowId: string };
  'workflow:deactivated': { workflowId: string };
  'workflow:deleted': { workflowId: string };

  // Webhook events
  'webhook:registered': { path: string; workflowId: string; method: string };
  'webhook:unregistered': { path: string };

  // System events
  'system:startup': Record<string, never>;
  'system:shutdown': Record<string, never>;
};

type EventKey = keyof FlowForgeEventMap;

export class EventBus {
  private readonly emitter = new EventEmitter();

  emit<K extends EventKey>(event: K, data: FlowForgeEventMap[K]): void {
    this.emitter.emit(event, data);
  }

  on<K extends EventKey>(event: K, handler: (data: FlowForgeEventMap[K]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  once<K extends EventKey>(event: K, handler: (data: FlowForgeEventMap[K]) => void): this {
    this.emitter.once(event, handler);
    return this;
  }

  off<K extends EventKey>(event: K, handler: (data: FlowForgeEventMap[K]) => void): this {
    this.emitter.off(event, handler);
    return this;
  }

  removeAllListeners(event?: EventKey): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}

// Singleton for the main process
export const globalEventBus = new EventBus();
