import { createClient, SchemaFieldTypes, VectorAlgorithms } from 'redis';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../types/index.js';
import type { RAGConfig } from '../../types/index.js';

type RedisClientType = ReturnType<typeof createClient>;

/**
 * Redis Vector Search Adapter
 * 
 * Requires Redis Stack (includes RediSearch module) running locally or remotely.
 * Start locally with: docker run -p 6379:6379 redis/redis-stack-server
 * 
 * Features:
 * - Persistent storage
 * - HNSW index for fast approximate nearest neighbor search
 * - Hybrid filtering (metadata + vector)
 */
export class RedisAdapter implements VectorStore {
  private client: RedisClientType;
  private indexName = 'cursor-rag-idx';
  private keyPrefix = 'cursor-rag:doc:';
  private vectorDim: number;
  private isConnected = false;
  private redisUrl: string;

  constructor(config: RAGConfig) {
    this.redisUrl = config.apiKeys?.redis?.url || config.vectorStoreConfig?.redisUrl || 'redis://localhost:6379';
    this.vectorDim = config.vectorStoreConfig?.vectorDim || 384; // Default for all-MiniLM-L6-v2
    this.client = createClient({ url: this.redisUrl });
    
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
    });
  }

  async initialize(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (error) {
        const err = error as Error;
        throw new Error(
          `Failed to connect to Redis at ${this.redisUrl}. ` +
          `Ensure Redis Stack is running: docker run -p 6379:6379 redis/redis-stack-server\n` +
          `Error: ${err.message}`
        );
      }
    }

    // Create index if it doesn't exist
    try {
      await this.client.ft.info(this.indexName);
    } catch {
      // Index doesn't exist, create it
      await this.createIndex();
    }
  }

  private async createIndex(): Promise<void> {
    try {
      await this.client.ft.create(
        this.indexName,
        {
          content: {
            type: SchemaFieldTypes.TEXT,
            SORTABLE: true
          },
          source: {
            type: SchemaFieldTypes.TAG
          },
          embedding: {
            type: SchemaFieldTypes.VECTOR,
            TYPE: 'FLOAT32',
            ALGORITHM: VectorAlgorithms.HNSW,
            DISTANCE_METRIC: 'COSINE',
            DIM: this.vectorDim
          }
        },
        {
          ON: 'HASH',
          PREFIX: this.keyPrefix
        }
      );
    } catch (error) {
      const err = error as Error;
      if (!err.message?.includes('Index already exists')) {
        throw error;
      }
    }
  }

  private float32ToBuffer(arr: number[]): Buffer {
    return Buffer.from(new Float32Array(arr).buffer);
  }

  async add(docs: VectorDocument[]): Promise<void> {
    await this.initialize();

    for (const doc of docs) {
      const key = `${this.keyPrefix}${doc.id}`;
      const embeddingBuffer = this.float32ToBuffer(doc.embedding);
      
      await this.client.hSet(key, {
        id: doc.id,
        content: doc.content,
        source: doc.metadata?.source || 'unknown',
        metadata: JSON.stringify(doc.metadata || {}),
        embedding: embeddingBuffer
      });
    }
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    await this.initialize();

    const topK = options.topK || 10;
    const embeddingBuffer = this.float32ToBuffer(embedding);

    // Build query with optional filters
    let filterQuery = '*';
    if (options.filter?.source) {
      const sources = Array.isArray(options.filter.source.$in) 
        ? options.filter.source.$in 
        : [options.filter.source];
      filterQuery = `@source:{${sources.map((s: string) => s.replace(/[^a-zA-Z0-9]/g, '_')).join('|')}}`;
    }

    try {
      const results = await this.client.ft.search(
        this.indexName,
        `(${filterQuery})=>[KNN ${topK} @embedding $query_vec AS score]`,
        {
          PARAMS: {
            query_vec: embeddingBuffer
          },
          SORTBY: 'score',
          DIALECT: 2,
          RETURN: ['content', 'source', 'metadata', 'score']
        }
      );

      return results.documents.map((doc) => {
        const value = doc.value as Record<string, string>;
        let metadata: Record<string, any> = { source: value.source };
        try {
          metadata = JSON.parse(value.metadata || '{}');
        } catch {
          // Keep default metadata
        }

        return {
          id: doc.id.replace(this.keyPrefix, ''),
          content: value.content || '',
          metadata,
          score: 1 - parseFloat(value.score || '0') // Convert distance to similarity
        };
      });
    } catch (error) {
      const err = error as Error;
      console.error('Redis search error:', err.message);
      return [];
    }
  }

  async delete(ids: string[]): Promise<void> {
    await this.initialize();
    
    for (const id of ids) {
      await this.client.del(`${this.keyPrefix}${id}`);
    }
  }

  async count(): Promise<number> {
    await this.initialize();
    
    try {
      const info = await this.client.ft.info(this.indexName);
      const numDocs = info.numDocs;
      return typeof numDocs === 'number' ? numDocs : parseInt(String(numDocs), 10) || 0;
    } catch {
      return 0;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}
