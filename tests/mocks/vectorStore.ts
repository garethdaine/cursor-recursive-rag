import { vi } from 'vitest';

export interface VectorChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface MockVectorStoreOptions {
  initialChunks?: VectorChunk[];
}

export function createMockVectorStore(options: MockVectorStoreOptions = {}) {
  const chunks: Map<string, VectorChunk> = new Map();

  if (options.initialChunks) {
    for (const chunk of options.initialChunks) {
      chunks.set(chunk.id, chunk);
    }
  }

  const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  return {
    upsert: vi.fn(async (chunk: VectorChunk): Promise<void> => {
      chunks.set(chunk.id, chunk);
    }),

    upsertBatch: vi.fn(async (items: VectorChunk[]): Promise<void> => {
      for (const chunk of items) {
        chunks.set(chunk.id, chunk);
      }
    }),

    search: vi.fn(async (
      embedding: number[],
      topK: number = 5,
      filter?: Record<string, unknown>
    ): Promise<SearchResult[]> => {
      const results: SearchResult[] = [];

      for (const chunk of chunks.values()) {
        if (filter) {
          const matches = Object.entries(filter).every(([key, value]) => {
            return chunk.metadata?.[key] === value;
          });
          if (!matches) continue;
        }

        const score = cosineSimilarity(embedding, chunk.embedding);
        results.push({
          id: chunk.id,
          content: chunk.content,
          score,
          metadata: chunk.metadata,
        });
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }),

    delete: vi.fn(async (id: string): Promise<boolean> => {
      return chunks.delete(id);
    }),

    deleteBatch: vi.fn(async (ids: string[]): Promise<number> => {
      let deleted = 0;
      for (const id of ids) {
        if (chunks.delete(id)) deleted++;
      }
      return deleted;
    }),

    get: vi.fn(async (id: string): Promise<VectorChunk | null> => {
      return chunks.get(id) || null;
    }),

    count: vi.fn(async (): Promise<number> => {
      return chunks.size;
    }),

    clear: vi.fn(async (): Promise<void> => {
      chunks.clear();
    }),

    _getChunks: () => chunks,
    _setChunks: (newChunks: Map<string, VectorChunk>) => {
      chunks.clear();
      for (const [id, chunk] of newChunks) {
        chunks.set(id, chunk);
      }
    },
  };
}

export const mockVectorStore = createMockVectorStore();
