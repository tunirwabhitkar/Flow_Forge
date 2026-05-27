import { Document } from '@langchain/core/documents';
import type { VectorStore } from '@langchain/core/vectorstores';
import type { Embeddings } from '@langchain/core/embeddings';

export type VectorStoreProvider = 'pinecone' | 'qdrant' | 'memory';

export interface VectorStoreConfig {
  provider: VectorStoreProvider;
  apiKey?: string;
  environment?: string;
  indexName?: string;
  url?: string;
  collectionName?: string;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Creates an Embeddings instance for the given provider.
 */
export async function createEmbeddings(cfg: EmbeddingConfig): Promise<Embeddings> {
  switch (cfg.provider) {
    case 'openai': {
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      return new OpenAIEmbeddings({
        apiKey: cfg.apiKey ?? process.env['OPENAI_API_KEY'],
        model: cfg.model ?? 'text-embedding-3-small',
      });
    }
    case 'ollama': {
      const { OllamaEmbeddings } = await import('@langchain/community/embeddings/ollama');
      return new OllamaEmbeddings({
        baseUrl: cfg.baseUrl ?? 'http://localhost:11434',
        model: cfg.model ?? 'nomic-embed-text',
      });
    }
    default:
      throw new Error(`Unsupported embedding provider: ${cfg.provider}`);
  }
}

/**
 * Creates and returns a VectorStore instance.
 */
export async function createVectorStore(
  vsConfig: VectorStoreConfig,
  embeddings: Embeddings,
  docs?: Document[],
): Promise<VectorStore> {
  switch (vsConfig.provider) {
    case 'pinecone': {
      const { Pinecone } = await import('@pinecone-database/pinecone');
      const { PineconeStore } = await import('@langchain/pinecone');
      const client = new Pinecone({ apiKey: vsConfig.apiKey! });
      const index = client.Index(vsConfig.indexName ?? 'flowforge');
      if (docs?.length) {
        return PineconeStore.fromDocuments(docs, embeddings, { pineconeIndex: index });
      }
      return PineconeStore.fromExistingIndex(embeddings, { pineconeIndex: index });
    }

    case 'qdrant': {
      const { QdrantVectorStore } = await import('@langchain/community/vectorstores/qdrant');
      return new QdrantVectorStore(embeddings, {
        url: vsConfig.url ?? 'http://localhost:6333',
        collectionName: vsConfig.collectionName ?? 'flowforge',
      });
    }

    case 'memory': {
      const { MemoryVectorStore } = await import('langchain/vectorstores/memory');
      if (docs?.length) {
        return MemoryVectorStore.fromDocuments(docs, embeddings);
      }
      return new MemoryVectorStore(embeddings);
    }

    default:
      throw new Error(`Unsupported vector store: ${vsConfig.provider}`);
  }
}

/**
 * High-level RAG (Retrieval-Augmented Generation) helper.
 * Loads documents into a vector store and creates a retrieval chain.
 */
export interface RAGOptions {
  embeddingConfig: EmbeddingConfig;
  vectorStoreConfig: VectorStoreConfig;
  documents: Array<{ content: string; metadata?: Record<string, unknown> }>;
  chunkSize?: number;
  chunkOverlap?: number;
}

export async function createRAGVectorStore(opts: RAGOptions): Promise<VectorStore> {
  const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter');
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: opts.chunkSize ?? 1000,
    chunkOverlap: opts.chunkOverlap ?? 200,
  });

  const docs: Document[] = [];
  for (const d of opts.documents) {
    const splits = await splitter.createDocuments([d.content], [d.metadata ?? {}]);
    docs.push(...splits);
  }

  const embeddings = await createEmbeddings(opts.embeddingConfig);
  return createVectorStore(opts.vectorStoreConfig, embeddings, docs);
}
