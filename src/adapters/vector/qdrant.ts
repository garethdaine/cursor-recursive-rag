import { QdrantClient } from '@qdrant/js-client-rest';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../types/index.js';
import type { RAGConfig } from '../../types/index.js';

export class QdrantAdapter implements VectorStore {
  private client: QdrantClient;
  private collectionName = 'cursor-rag-knowledge-base';
  private config: RAGConfig;

  constructor(config: RAGConfig) {
    const url = config.apiKeys?.qdrant?.url || 'http://localhost:6333';
    const apiKey = config.apiKeys?.qdrant?.apiKey;
    this.config = config;

    this.client = new QdrantClient({
      url,
      apiKey
    });
  }

  async initialize(vectorSize?: number): Promise<void> {
    // Check if collection exists, create if not
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(c => c.name === this.collectionName);

    if (!exists) {
      // Use provided vector size, or infer from embeddings config
      // Default dimensions per embedding type
      let dimensions = vectorSize;
      if (!dimensions) {
        const embeddingType = this.config.embeddings;
        switch (embeddingType) {
          case 'xenova':
            dimensions = 384; // all-MiniLM-L6-v2
            break;
          case 'openai':
            dimensions = 1536; // text-embedding-3-small
            break;
          case 'ollama':
            dimensions = 768; // nomic-embed-text default
            break;
          default:
            dimensions = 384; // fallback
        }
      }

      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: dimensions,
          distance: 'Cosine'
        }
      });
    }
  }

  async add(docs: VectorDocument[]): Promise<void> {
    // Infer vector size from first document if collection doesn't exist
    const vectorSize = docs.length > 0 ? docs[0].embedding.length : undefined;
    await this.initialize(vectorSize);

    const points = docs.map(doc => ({
      id: doc.id,
      vector: doc.embedding,
      payload: {
        content: doc.content,
        ...doc.metadata
      }
    }));

    await this.client.upsert(this.collectionName, {
      wait: true,
      points
    });
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    // Infer vector size from query embedding if collection doesn't exist
    await this.initialize(embedding.length);

    // Convert filter format from generic { source: { $in: [...] } } to Qdrant format
    let qdrantFilter: any = undefined;
    if (options.filter) {
      const filterEntries = Object.entries(options.filter);
      if (filterEntries.length > 0) {
        qdrantFilter = {
          must: filterEntries.map(([key, value]: [string, any]) => {
            // Handle $in operator for arrays
            if (value && typeof value === 'object' && '$in' in value && Array.isArray(value.$in)) {
              return {
                key: key,
                match: {
                  any: value.$in
                }
              };
            }
            // Handle direct value match
            return {
              key: key,
              match: { value: value }
            };
          })
        };
      }
    }

    const response = await this.client.search(this.collectionName, {
      vector: embedding,
      limit: options.topK,
      filter: qdrantFilter
    });

    return response.map(result => ({
      id: result.id.toString(),
      content: result.payload?.content as string || '',
      metadata: {
        ...(result.payload || {}),
        content: undefined // Remove content from metadata since it's in the main field
      },
      score: result.score || 0
    }));
  }

  async delete(ids: string[]): Promise<void> {
    await this.initialize();
    await this.client.delete(this.collectionName, {
      wait: true,
      points: ids
    });
  }

  async count(): Promise<number> {
    await this.initialize();
    const info = await this.client.getCollection(this.collectionName);
    return info.points_count || 0;
  }
}
