// Model factory
export { createChatModel, type ModelConfig, type ModelProvider } from './chains/model-factory.js';

// ReAct Agent
export {
  FlowForgeAgent,
  createHttpTool,
  createDateTimeTool,
  createJsonExtractTool,
  type AgentTool,
  type FlowForgeAgentOptions,
  type AgentRunResult,
} from './agents/react-agent.js';

// Vector stores & embeddings
export {
  createEmbeddings,
  createVectorStore,
  createRAGVectorStore,
  type EmbeddingConfig,
  type VectorStoreConfig,
  type VectorStoreProvider,
  type RAGOptions,
} from './vectorstores/vector-store.js';

// MCP Client
export {
  MCPClient,
  type MCPClientOptions,
  type MCPTool,
  type MCPResource,
  type MCPMessage,
  type MCPServerCapabilities,
} from './tools/mcp-client.js';
