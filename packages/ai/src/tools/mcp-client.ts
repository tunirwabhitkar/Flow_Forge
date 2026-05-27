import { EventEmitter } from 'events';

/**
 * MCP message types following the Model Context Protocol specification.
 */
export interface MCPMessage {
  id: string;
  type: 'request' | 'response' | 'notification' | 'error';
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export type MCPTransportType = 'stdio' | 'sse' | 'websocket';

export interface MCPClientOptions {
  transportType: MCPTransportType;
  command?: string;     // For stdio transport
  args?: string[];
  url?: string;         // For SSE/WebSocket transport
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * FlowForge MCP Client — connects to an MCP server and exposes
 * its tools/resources for use in workflows and agents.
 */
export class MCPClient extends EventEmitter {
  private connected = false;
  private serverCapabilities: MCPServerCapabilities = {};
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly opts: MCPClientOptions) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    switch (this.opts.transportType) {
      case 'stdio':
        await this.connectStdio();
        break;
      case 'sse':
        await this.connectSSE();
        break;
      default:
        throw new Error(`Transport ${this.opts.transportType} not yet implemented`);
    }

    // Initialize the connection
    await this.initialize();
    this.connected = true;
  }

  private async connectStdio(): Promise<void> {
    // stdio transport spawns a child process
    const { spawn } = await import('child_process');
    const cmd = this.opts.command!;
    const args = this.opts.args ?? [];

    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdout!.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as MCPMessage;
          this.handleMessage(msg);
        } catch { /* ignore non-JSON */ }
      }
    });

    child.stderr!.on('data', (data: Buffer) => {
      this.emit('log', { level: 'error', message: data.toString() });
    });

    child.on('exit', (code) => {
      this.connected = false;
      this.emit('disconnect', { code });
    });

    // Store write function
    this._write = (msg: MCPMessage) => {
      child.stdin!.write(JSON.stringify(msg) + '\n');
    };
  }

  private async connectSSE(): Promise<void> {
    // SSE transport for remote MCP servers
    const { default: fetch } = await import('node-fetch');
    // Simplified SSE — full implementation would use EventSource
    this._write = async (msg: MCPMessage) => {
      await fetch(this.opts.url!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.opts.headers,
        },
        body: JSON.stringify(msg),
      });
    };
  }

  private _write: (msg: MCPMessage) => void | Promise<void> = () => {
    throw new Error('Not connected');
  };

  private handleMessage(msg: MCPMessage): void {
    if (msg.type === 'response' || msg.type === 'error') {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.type === 'error') {
          pending.reject(new Error(msg.error?.message ?? 'MCP error'));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.type === 'notification') {
      this.emit('notification', msg);
    }
  }

  private async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = String(++this.requestId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, this.opts.timeout ?? 30_000);

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      const msg: MCPMessage = { id, type: 'request', method, params };
      Promise.resolve(this._write(msg)).catch(reject);
    });
  }

  private async initialize(): Promise<void> {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: 'FlowForge', version: '1.0.0' },
    }) as { capabilities: MCPServerCapabilities };

    this.serverCapabilities = result.capabilities;

    // Fetch available tools
    if (this.serverCapabilities.tools) {
      await this.refreshTools();
    }
    if (this.serverCapabilities.resources) {
      await this.refreshResources();
    }
  }

  async refreshTools(): Promise<MCPTool[]> {
    const result = await this.request('tools/list') as { tools: MCPTool[] };
    this.tools = result.tools;
    return this.tools;
  }

  async refreshResources(): Promise<MCPResource[]> {
    const result = await this.request('resources/list') as { resources: MCPResource[] };
    this.resources = result.resources;
    return this.resources;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  async readResource(uri: string): Promise<{ contents: Array<{ text?: string; blob?: string; mimeType?: string }> }> {
    return this.request('resources/read', { uri }) as Promise<any>;
  }

  getTools(): MCPTool[] { return this.tools; }
  getResources(): MCPResource[] { return this.resources; }
  isConnected(): boolean { return this.connected; }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.pendingRequests.forEach((p) => p.reject(new Error('Client disconnected')));
    this.pendingRequests.clear();
    this.emit('disconnect', { code: 0 });
  }
}
