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
  driver: 'packetstream' | 'decodo' | 'smartproxy' | 'none'; // 'smartproxy' is legacy alias for 'decodo'
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

export interface MCPGatewayConfig {
  enabled: boolean;
  url: string;
  apiKey?: string;
}

export interface OpenSkillsConfig {
  enabled: boolean;
  autoIngestSkills: boolean;
  skillPaths?: string[];
}

export interface RAGConfig {
  vectorStore: 'memory' | 'chroma' | 'qdrant' | 'redis' | 'redis-stack' | 'vectorize';
  embeddings: 'xenova' | 'openai' | 'ollama';
  apiKeys?: {
    openai?: string;
    firecrawl?: string;
    qdrant?: {
      url?: string;
      apiKey?: string;
    };
    redis?: {
      url?: string;
    };
    ollama?: {
      baseUrl?: string;
      model?: string;
    };
  };
  vectorStoreConfig?: {
    chromaUrl?: string;
    redisUrl?: string;
    vectorDim?: number;
    useRediSearch?: boolean;
    [key: string]: any;
  };
  proxy?: ProxyConfig;
  dashboard?: {
    enabled: boolean;
    port: number;
    auth?: {
      username: string;
      password: string;
    };
  };
  mcpGateway?: MCPGatewayConfig;
  openSkills?: OpenSkillsConfig;
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

// Re-export memory types
export * from './memory.js';

// Re-export knowledge extraction types
export * from './extractedKnowledge.js';

// Re-export relationship types
export * from './relationships.js';
