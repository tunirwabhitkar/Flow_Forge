import { createReactAgent } from 'langchain/agents';
import { AgentExecutor } from 'langchain/agents';
import { DynamicTool, type Tool } from '@langchain/core/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BufferMemory, ConversationSummaryMemory } from 'langchain/memory';
import { createChatModel, type ModelConfig } from '../chains/model-factory.js';

export interface AgentTool {
  name: string;
  description: string;
  func: (input: string) => Promise<string>;
}

export interface FlowForgeAgentOptions {
  modelConfig: ModelConfig;
  tools: AgentTool[];
  systemPrompt?: string;
  maxIterations?: number;
  memoryType?: 'buffer' | 'summary' | 'none';
  verbose?: boolean;
}

export interface AgentRunResult {
  output: string;
  intermediateSteps: Array<{
    action: { tool: string; toolInput: string };
    observation: string;
  }>;
  tokenUsage?: { input: number; output: number };
}

/**
 * FlowForge ReAct agent — wraps LangChain's createReactAgent with
 * configurable tools, memory, and model provider.
 */
export class FlowForgeAgent {
  private executor: AgentExecutor | null = null;

  constructor(private readonly opts: FlowForgeAgentOptions) {}

  async initialize(): Promise<void> {
    const model = await createChatModel(this.opts.modelConfig);

    const langchainTools: Tool[] = this.opts.tools.map(
      (t) =>
        new DynamicTool({
          name: t.name,
          description: t.description,
          func: t.func,
        }),
    );

    const systemPrompt = this.opts.systemPrompt ??
      'You are a helpful AI assistant with access to tools. Use them when needed to complete the user\'s request. Think step by step.';

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createReactAgent({ llm: model, tools: langchainTools, prompt });

    let memory: BufferMemory | ConversationSummaryMemory | undefined;
    if (this.opts.memoryType === 'buffer') {
      memory = new BufferMemory({ returnMessages: true, memoryKey: 'chat_history', inputKey: 'input', outputKey: 'output' });
    } else if (this.opts.memoryType === 'summary') {
      memory = new ConversationSummaryMemory({
        llm: model as any,
        returnMessages: true,
        memoryKey: 'chat_history',
        inputKey: 'input',
        outputKey: 'output',
      });
    }

    this.executor = AgentExecutor.fromAgentAndTools({
      agent,
      tools: langchainTools,
      memory,
      maxIterations: this.opts.maxIterations ?? 10,
      verbose: this.opts.verbose ?? false,
      returnIntermediateSteps: true,
      handleParsingErrors: true,
    });
  }

  async run(input: string): Promise<AgentRunResult> {
    if (!this.executor) await this.initialize();

    const result = await this.executor!.invoke({ input });
    return {
      output: result['output'] as string,
      intermediateSteps: (result['intermediateSteps'] as any[]) ?? [],
    };
  }
}

// ─── Built-in FlowForge tools ─────────────────────────────────────────────────

export function createHttpTool(): AgentTool {
  return {
    name: 'http_request',
    description: 'Make HTTP requests to external APIs. Input format: JSON with url, method, headers, body fields.',
    async func(input: string): Promise<string> {
      const parsed = JSON.parse(input) as { url: string; method?: string; headers?: Record<string, string>; body?: unknown };
      const { default: fetch } = await import('node-fetch');
      const res = await fetch(parsed.url, {
        method: parsed.method ?? 'GET',
        headers: parsed.headers,
        body: parsed.body ? JSON.stringify(parsed.body) : undefined,
      });
      const data = await res.text();
      return JSON.stringify({ status: res.status, body: data.slice(0, 2000) });
    },
  };
}

export function createDateTimeTool(): AgentTool {
  return {
    name: 'get_current_datetime',
    description: 'Get the current date and time in ISO format. No input needed.',
    async func(): Promise<string> {
      return new Date().toISOString();
    },
  };
}

export function createJsonExtractTool(): AgentTool {
  return {
    name: 'json_extract',
    description: 'Extract a field from a JSON string using dot notation. Input: JSON with "data" (JSON string) and "path" (e.g. "user.name") fields.',
    async func(input: string): Promise<string> {
      const { data, path } = JSON.parse(input) as { data: string; path: string };
      const obj = JSON.parse(data) as Record<string, unknown>;
      const keys = path.split('.');
      let current: unknown = obj;
      for (const k of keys) {
        if (typeof current !== 'object' || current === null) return 'undefined';
        current = (current as Record<string, unknown>)[k];
      }
      return JSON.stringify(current);
    },
  };
}
