import { createClient } from 'redis';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../types/index.js';
import type { RAGConfig } from '../../types/index.js';

type RedisClientType = ReturnType<typeof createClient>;

/**
 * Redis 8.x Native Vector Adapter
 * 
 * Uses Redis 8.x native vector commands (VADD, VSIM, VREM, VCARD).
 * Works with standard Redis 8.x installed via Homebrew or other methods.
 * 
 * Command syntax (Redis 8.x):
 * - VADD key VALUES dim v1 v2 ... vN element [CAS] [NOQUANT|BIN|Q8]
 * - VSIM key VALUES dim v1 v2 ... vN [WITHSCORES] [COUNT count]
 * - VREM key element [element ...]
 * - VCARD key
 * 
 * Features:
 * - Persistent storage
 * - HNSW index for approximate nearest neighbor search
 * - No additional modules required (uses native Redis 8.x vector support)
 */
export class RedisNativeAdapter implements VectorStore {
  private client: RedisClientType;
  private setName = 'cursor-rag-vectors';
  private metadataPrefix = 'cursor-rag:meta:';
  private vectorDim: number;
  private isConnected = false;
  private redisUrl: string;

  constructor(config: RAGConfig) {
    this.redisUrl = config.apiKeys?.redis?.url || config.vectorStoreConfig?.redisUrl || 'redis://localhost:6379';
    this.vectorDim = config.vectorStoreConfig?.vectorDim || 384;
    this.client = createClient({ url: this.redisUrl });
    
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
    });
  }

  private async initialize(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (error) {
        const err = error as Error;
        throw new Error(
          `Failed to connect to Redis at ${this.redisUrl}. ` +
          `Ensure Redis 8.x is running.\n` +
          `Error: ${err.message}`
        );
      }
    }
  }

  async add(docs: VectorDocument[]): Promise<void> {
    await this.initialize();

    for (const doc of docs) {
      // VADD key VALUES dim v1 v2 ... vN element
      // Build command: VADD cursor-rag-vectors VALUES 384 0.1 0.2 ... element_id
      const cmd: string[] = [
        'VADD',
        this.setName,
        'VALUES',
        doc.embedding.length.toString(),
        ...doc.embedding.map(v => v.toString()),
        doc.id
      ];
      
      try {
        await this.client.sendCommand(cmd);
      } catch (error) {
        const err = error as Error;
        if (err.message?.includes('unknown command')) {
          throw new Error(
            'Redis native vector commands not available. ' +
            'Ensure you have Redis 8.x with vector support or use Redis Stack.'
          );
        }
        throw error;
      }

      // Store metadata separately
      const metadataKey = `${this.metadataPrefix}${doc.id}`;
      await this.client.hSet(metadataKey, {
        id: doc.id,
        content: doc.content,
        source: doc.metadata?.source || 'unknown',
        metadata: JSON.stringify(doc.metadata || {})
      });
    }
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    await this.initialize();

    const topK = options.topK || 10;

    try {
      // VSIM key VALUES dim v1 v2 ... vN COUNT count WITHSCORES
      const cmd: string[] = [
        'VSIM',
        this.setName,
        'VALUES',
        embedding.length.toString(),
        ...embedding.map(v => v.toString()),
        'COUNT', topK.toString(),
        'WITHSCORES'
      ];
      
      const results = await this.client.sendCommand(cmd) as string[] | null;

      if (!results || results.length === 0) {
        return [];
      }

      // Results come as [id1, score1, id2, score2, ...]
      const searchResults: SearchResult[] = [];
      
      for (let i = 0; i < results.length; i += 2) {
        const id = results[i] as string;
        const score = parseFloat(results[i + 1] as string);
        
        // Get metadata
        const metadataKey = `${this.metadataPrefix}${id}`;
        const metadataRaw = await this.client.hGetAll(metadataKey);
        
        if (metadataRaw && metadataRaw.content) {
          let metadata: Record<string, any> = { source: metadataRaw.source || 'unknown' };
          try {
            metadata = JSON.parse(metadataRaw.metadata || '{}');
          } catch {
            // Keep default
          }

          // Apply source filter if specified
          if (options.filter?.source) {
            const allowedSources = Array.isArray(options.filter.source.$in)
              ? options.filter.source.$in
              : [options.filter.source];
            if (!allowedSources.includes(metadata.source)) {
              continue;
            }
          }

          searchResults.push({
            id,
            content: metadataRaw.content,
            metadata,
            score // Redis 8 VSIM returns similarity score directly (1 = identical)
          });
        }
      }

      return searchResults;
    } catch (error) {
      const err = error as Error;
      console.error('Redis native search error:', err.message);
      return [];
    }
  }

  async delete(ids: string[]): Promise<void> {
    await this.initialize();
    
    for (const id of ids) {
      try {
        await this.client.sendCommand(['VREM', this.setName, id]);
        await this.client.del(`${this.metadataPrefix}${id}`);
      } catch (error) {
        // Ignore errors for non-existent keys
      }
    }
  }

  async count(): Promise<number> {
    await this.initialize();
    
    try {
      const result = await this.client.sendCommand(['VCARD', this.setName]) as number | null;
      return result || 0;
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
