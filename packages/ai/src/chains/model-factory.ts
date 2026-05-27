import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'azure'
  | 'groq'
  | 'mistral'
  | 'vertex';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
  azureDeployment?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
}

/**
 * Creates a LangChain-compatible ChatModel for the given provider config.
 * Lazy-imports provider packages to avoid bundling all SDKs.
 */
export async function createChatModel(cfg: ModelConfig): Promise<BaseChatModel> {
  const opts = {
    temperature: cfg.temperature ?? 0.7,
    maxTokens: cfg.maxTokens ?? 1024,
  };

  switch (cfg.provider) {
    case 'anthropic': {
      const { ChatAnthropic } = await import('@langchain/anthropic');
      return new ChatAnthropic({
        apiKey: cfg.apiKey ?? process.env['ANTHROPIC_API_KEY'],
        model: cfg.model,
        ...opts,
      });
    }

    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({
        apiKey: cfg.apiKey ?? process.env['OPENAI_API_KEY'],
        model: cfg.model,
        ...opts,
      });
    }

    case 'azure': {
      const { AzureChatOpenAI } = await import('@langchain/openai');
      return new AzureChatOpenAI({
        azureOpenAIApiKey: cfg.apiKey,
        azureOpenAIApiDeploymentName: cfg.azureDeployment ?? cfg.model,
        azureOpenAIEndpoint: cfg.azureEndpoint,
        azureOpenAIApiVersion: cfg.azureApiVersion ?? '2024-02-01',
        ...opts,
      });
    }

    case 'groq': {
      const { ChatGroq } = await import('@langchain/community/chat_models/groq');
      return new ChatGroq({
        apiKey: cfg.apiKey ?? process.env['GROQ_API_KEY'],
        model: cfg.model,
        ...opts,
      });
    }

    case 'mistral': {
      const { ChatMistralAI } = await import('@langchain/community/chat_models/mistral');
      return new ChatMistralAI({
        apiKey: cfg.apiKey ?? process.env['MISTRAL_API_KEY'],
        model: cfg.model,
        ...opts,
      });
    }

    case 'ollama': {
      const { ChatOllama } = await import('@langchain/community/chat_models/ollama');
      return new ChatOllama({
        baseUrl: cfg.baseUrl ?? 'http://localhost:11434',
        model: cfg.model,
        temperature: opts.temperature,
      });
    }

    default:
      throw new Error(`Unsupported model provider: ${cfg.provider}`);
  }
}
