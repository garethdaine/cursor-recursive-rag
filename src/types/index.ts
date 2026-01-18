export interface VectorStore {
  add(docs: VectorDocument[]): Promise<void>;
  search(embedding: number[], options: SearchOptions): Promise<SearchResult[]>;
  delete(ids: string[]): Promise<void>;
  count(): Promise<number>;
}

export interface VectorDocument {
  id: string;
  embedding: number[];
  content: string;
  metadata: Record<string, any>;
}

export interface ProxyConfig {
  enabled: boolean;
  driver: 'packetstream' | 'smartproxy' | 'none';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
}

export interface SearchOptions {
  topK: number;
  filter?: Record<string, any>;
}

export interface RAGConfig {
  vectorStore: 'chroma' | 'qdrant' | 'vectorize';
  embeddings: 'xenova' | 'openai' | 'ollama';
  apiKeys?: {
    openai?: string;
    firecrawl?: string;
    qdrant?: {
      url?: string;
      apiKey?: string;
    };
    ollama?: {
      baseUrl?: string;
      model?: string;
    };
  };
  vectorStoreConfig?: Record<string, any>;
  proxy?: ProxyConfig;
  dashboard?: {
    enabled: boolean;
    port: number;
    auth?: {
      username: string;
      password: string;
    };
  };
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  respectBoundaries?: boolean;
}

export interface Chunk {
  text: string;
  index: number;
  metadata?: Record<string, any>;
}

export interface RecursiveQueryResult {
  answer: string;
  sources: SearchResult[];
  iterations: number;
  subQuestions: string[];
}
