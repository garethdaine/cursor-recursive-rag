import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../types/index.js';
import type { 
  EnhancedChunk, 
  ChunkMetadata, 
  ChunkType,
  EnhancedSearchResult,
  EnhancedSearchOptions,
} from '../types/memory.js';
import { MemoryMetadataStore, getMemoryMetadataStore } from './memoryMetadataStore.js';
import { DecayCalculator, getDecayCalculator, type DecayCalculatorConfig } from './decayCalculator.js';

/**
 * Score weights for hybrid ranking
 */
export interface ScoreWeights {
  similarity: number;
  decay: number;
  importance: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  similarity: 0.5,
  decay: 0.3,
  importance: 0.2,
};

/**
 * Enhanced vector store that wraps existing implementation with memory capabilities
 * 
 * This wrapper:
 * 1. Maintains temporal metadata (creation time, access patterns)
 * 2. Calculates decay scores for all chunks
 * 3. Re-ranks search results using hybrid scoring (similarity + decay + importance)
 * 4. Records access patterns for future decay calculations
 */
export class EnhancedVectorStore implements VectorStore {
  private vectorStore: VectorStore;
  private metadataStore: MemoryMetadataStore;
  private decayCalculator: DecayCalculator;
  private scoreWeights: ScoreWeights;

  constructor(
    vectorStore: VectorStore,
    options?: {
      metadataStore?: MemoryMetadataStore;
      decayConfig?: Partial<DecayCalculatorConfig>;
      scoreWeights?: Partial<ScoreWeights>;
    }
  ) {
    this.vectorStore = vectorStore;
    this.metadataStore = options?.metadataStore || getMemoryMetadataStore();
    this.decayCalculator = options?.decayConfig 
      ? new DecayCalculator(options.decayConfig)
      : getDecayCalculator();
    this.scoreWeights = {
      ...DEFAULT_SCORE_WEIGHTS,
      ...options?.scoreWeights,
    };
  }

  /**
   * Add documents to both vector store and metadata store
   */
  async add(docs: VectorDocument[]): Promise<void> {
    // Add to vector store
    await this.vectorStore.add(docs);
    
    // Add metadata for each document
    for (const doc of docs) {
      this.metadataStore.upsertChunkMetadata({
        chunkId: doc.id,
        source: doc.metadata?.source || 'unknown',
        chunkType: (doc.metadata?.chunkType as ChunkType) || 'documentation',
        importance: typeof doc.metadata?.importance === 'number' ? doc.metadata.importance : 0.5,
      });
    }
  }

  /**
   * Search with hybrid scoring (similarity + decay + importance)
   */
  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    // Over-fetch to allow for re-ranking
    const overFetchMultiplier = 2;
    const overFetchOptions = {
      ...options,
      topK: options.topK * overFetchMultiplier,
    };

    // Get candidates from vector store
    const candidates = await this.vectorStore.search(embedding, overFetchOptions);

    // Enrich with metadata and calculate final scores
    const enriched = this.enrichWithMetadata(candidates);
    
    // Re-rank by final score
    const reranked = this.rerank(enriched);
    
    // Record access for top results
    const topResults = reranked.slice(0, options.topK);
    this.recordAccess(topResults);

    // Return SearchResult format (compatible with existing interface)
    return topResults.map(r => ({
      id: r.id,
      content: r.content,
      metadata: {
        ...r.metadata,
        decayScore: r.decayAdjustedScore,
        finalScore: r.finalScore,
      },
      score: r.finalScore,
    }));
  }

  /**
   * Enhanced search with full options
   */
  async enhancedSearch(
    embedding: number[], 
    options: EnhancedSearchOptions
  ): Promise<EnhancedSearchResult[]> {
    // Over-fetch to allow for re-ranking and filtering
    const overFetchMultiplier = 3;
    const baseOptions: SearchOptions = {
      topK: options.topK * overFetchMultiplier,
      filter: options.filter,
    };

    // Get candidates from vector store
    const candidates = await this.vectorStore.search(embedding, baseOptions);

    // Enrich with metadata
    let enriched = this.enrichWithMetadata(candidates);

    // Apply filters
    if (options.minDecayScore !== undefined) {
      enriched = enriched.filter(r => r.decayAdjustedScore >= options.minDecayScore!);
    }

    if (options.chunkTypes && options.chunkTypes.length > 0) {
      enriched = enriched.filter(r => {
        const metadata = this.metadataStore.getChunkMetadata(r.id);
        return metadata && options.chunkTypes!.includes(metadata.chunkType);
      });
    }

    if (!options.includeArchived) {
      enriched = enriched.filter(r => {
        const metadata = this.metadataStore.getChunkMetadata(r.id);
        return metadata && !metadata.isArchived;
      });
    }

    // Re-rank
    const reranked = this.rerank(enriched);
    
    // Record access for top results
    const topResults = reranked.slice(0, options.topK);
    this.recordAccess(topResults);

    return topResults;
  }

  /**
   * Delete documents from both stores
   */
  async delete(ids: string[]): Promise<void> {
    await this.vectorStore.delete(ids);
    
    for (const id of ids) {
      this.metadataStore.deleteChunkMetadata(id);
    }
  }

  /**
   * Count documents in vector store
   */
  async count(): Promise<number> {
    return this.vectorStore.count();
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    return this.metadataStore.getMemoryStats();
  }

  /**
   * Update decay scores for all chunks
   */
  updateDecayScores(autoArchive: boolean = false) {
    return this.decayCalculator.updateAllDecayScores(this.metadataStore, autoArchive);
  }

  /**
   * Get chunk metadata
   */
  getChunkMetadata(chunkId: string): ChunkMetadata | null {
    return this.metadataStore.getChunkMetadata(chunkId);
  }

  /**
   * Update chunk importance
   */
  updateImportance(chunkId: string, importance: number): void {
    this.metadataStore.upsertChunkMetadata({ chunkId, importance });
  }

  /**
   * Get the underlying vector store (for direct access if needed)
   */
  getUnderlyingStore(): VectorStore {
    return this.vectorStore;
  }

  /**
   * Get the metadata store (for advanced operations)
   */
  getMetadataStore(): MemoryMetadataStore {
    return this.metadataStore;
  }

  /**
   * Enrich search results with metadata
   */
  private enrichWithMetadata(results: SearchResult[]): EnhancedSearchResult[] {
    return results.map(result => {
      const metadata = this.metadataStore.getChunkMetadata(result.id);
      
      const decayScore = metadata?.decayScore ?? 1.0;
      const importance = metadata?.importance ?? 0.5;
      
      return {
        chunk: {
          id: result.id,
          content: result.content,
          embedding: [],
          source: result.metadata?.source || 'unknown',
          metadata: result.metadata,
          createdAt: metadata ? new Date(metadata.createdAt) : new Date(),
          updatedAt: metadata ? new Date(metadata.updatedAt) : new Date(),
          lastAccessedAt: metadata?.lastAccessedAt ? new Date(metadata.lastAccessedAt) : null,
          accessCount: metadata?.accessCount ?? 0,
          importance,
          decayScore,
          isArchived: metadata?.isArchived ?? false,
          chunkType: (metadata?.chunkType as ChunkType) || 'documentation',
          relatedChunkIds: [],
          entities: [],
        } as EnhancedChunk,
        similarityScore: result.score,
        decayAdjustedScore: decayScore,
        finalScore: 0, // Will be calculated in rerank
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        score: result.score,
      };
    });
  }

  /**
   * Re-rank results using hybrid scoring
   */
  private rerank(results: EnhancedSearchResult[]): EnhancedSearchResult[] {
    return results
      .map(r => ({
        ...r,
        finalScore: this.calculateFinalScore(r),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Calculate final score using weighted combination
   */
  private calculateFinalScore(result: EnhancedSearchResult): number {
    return (
      result.similarityScore * this.scoreWeights.similarity +
      result.decayAdjustedScore * this.scoreWeights.decay +
      result.chunk.importance * this.scoreWeights.importance
    );
  }

  /**
   * Record access for results
   */
  private recordAccess(results: EnhancedSearchResult[]): void {
    for (let i = 0; i < results.length; i++) {
      this.metadataStore.recordAccess(results[i].id, undefined, i + 1);
    }
  }
}

/**
 * Create an enhanced vector store from an existing vector store
 */
export function createEnhancedVectorStore(
  vectorStore: VectorStore,
  options?: {
    metadataDbPath?: string;
    decayConfig?: Partial<DecayCalculatorConfig>;
    scoreWeights?: Partial<ScoreWeights>;
  }
): EnhancedVectorStore {
  const metadataStore = options?.metadataDbPath 
    ? new MemoryMetadataStore(options.metadataDbPath)
    : getMemoryMetadataStore();
    
  return new EnhancedVectorStore(vectorStore, {
    metadataStore,
    decayConfig: options?.decayConfig,
    scoreWeights: options?.scoreWeights,
  });
}
