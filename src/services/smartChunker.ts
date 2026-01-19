/**
 * Smart Chunking Strategies
 * 
 * Based on RLM paper observations about how models chunk context:
 * - Uniform chunking by size/count
 * - Semantic chunking by topic similarity
 * - Keyword-based chunking with pattern matching
 * - Structural chunking by source file/section
 * - Adaptive chunking that chooses strategy based on content/query
 */

import type { EnhancedChunk } from '../types/memory.js';
import { ChunkType } from '../types/memory.js';

export type ChunkingStrategy = 'uniform' | 'semantic' | 'keyword' | 'structural' | 'adaptive';

export interface ChunkingResult {
  strategy: ChunkingStrategy;
  groups: Map<string, EnhancedChunk[]>;
  metadata?: {
    totalChunks: number;
    groupCount: number;
    avgGroupSize: number;
    processingTimeMs?: number;
  };
}

export interface ChunkingOptions {
  batchSize?: number;
  targetGroups?: number;
  keywords?: string[];
  overlap?: number;
  minGroupSize?: number;
  maxGroupSize?: number;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  batchSize: 10,
  targetGroups: 5,
  overlap: 100,
  minGroupSize: 1,
  maxGroupSize: 50,
};

/**
 * Smart Chunker for RLM-style context processing
 */
export class SmartChunker {
  private options: ChunkingOptions;

  constructor(options?: Partial<ChunkingOptions>) {
    this.options = {
      ...DEFAULT_CHUNKING_OPTIONS,
      ...options,
    };
  }

  /**
   * Uniform chunking - split by count
   * Simple strategy that divides items into equal-sized batches
   */
  uniformChunk<T>(items: T[], batchSize?: number): T[][] {
    const size = batchSize ?? this.options.batchSize ?? 10;
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }

    return batches;
  }

  /**
   * Uniform chunk with result as ChunkingResult
   */
  uniformChunkEnhanced(chunks: EnhancedChunk[], batchSize?: number): ChunkingResult {
    const startTime = Date.now();
    const batches = this.uniformChunk(chunks, batchSize);
    
    const groups = new Map<string, EnhancedChunk[]>();
    batches.forEach((batch, i) => {
      groups.set(`batch_${i}`, batch);
    });

    return {
      strategy: 'uniform',
      groups,
      metadata: {
        totalChunks: chunks.length,
        groupCount: groups.size,
        avgGroupSize: chunks.length / groups.size,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Character-based chunking with overlap
   * Useful for splitting large text content
   */
  charChunk(text: string, chunkSize: number, overlap?: number): string[] {
    const overlapSize = overlap ?? this.options.overlap ?? 100;
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      
      if (end >= text.length) break;
      
      start = end - overlapSize;
      if (start < 0) start = 0;
      if (start >= end) break; // Prevent infinite loop
    }

    return chunks;
  }

  /**
   * Semantic chunking - group by topic similarity using embeddings
   * RLM pattern: models benefit from semantically coherent chunks
   */
  semanticChunk(
    chunks: EnhancedChunk[],
    targetGroups?: number
  ): ChunkingResult {
    const startTime = Date.now();
    const k = targetGroups ?? this.options.targetGroups ?? 5;

    if (chunks.length === 0) {
      return {
        strategy: 'semantic',
        groups: new Map(),
        metadata: {
          totalChunks: 0,
          groupCount: 0,
          avgGroupSize: 0,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    // Check if chunks have embeddings
    const hasEmbeddings = chunks.some(c => c.embedding && c.embedding.length > 0);

    if (!hasEmbeddings) {
      // Fall back to uniform chunking if no embeddings
      return this.uniformChunkEnhanced(chunks, Math.ceil(chunks.length / k));
    }

    // Use k-means clustering on embeddings
    const embeddings = chunks.map(c => c.embedding);
    const clusterAssignments = this.kMeansClustering(embeddings, Math.min(k, chunks.length));

    // Group chunks by cluster
    const groups = new Map<string, EnhancedChunk[]>();
    clusterAssignments.forEach((clusterIdx, chunkIdx) => {
      const key = `topic_${clusterIdx}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(chunks[chunkIdx]);
    });

    return {
      strategy: 'semantic',
      groups,
      metadata: {
        totalChunks: chunks.length,
        groupCount: groups.size,
        avgGroupSize: chunks.length / groups.size,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Keyword-based chunking - group by shared keywords/patterns
   * RLM pattern: filter by regex, then process matching chunks together
   */
  keywordChunk(
    chunks: EnhancedChunk[],
    keywords?: string[]
  ): ChunkingResult {
    const startTime = Date.now();
    const patterns = keywords ?? this.options.keywords ?? [];

    if (patterns.length === 0) {
      // No keywords provided, return all as single group
      return {
        strategy: 'keyword',
        groups: new Map([['all', chunks]]),
        metadata: {
          totalChunks: chunks.length,
          groupCount: 1,
          avgGroupSize: chunks.length,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    const groups = new Map<string, EnhancedChunk[]>();
    const matched = new Set<string>();

    for (const keyword of patterns) {
      try {
        const pattern = new RegExp(keyword, 'i');
        const matching = chunks.filter(c => pattern.test(c.content));
        
        if (matching.length > 0) {
          groups.set(keyword, matching);
          matching.forEach(c => matched.add(c.id));
        }
      } catch {
        // Invalid regex, skip
        continue;
      }
    }

    // Add unmatched chunks to 'other' group
    const unmatched = chunks.filter(c => !matched.has(c.id));
    if (unmatched.length > 0) {
      groups.set('_other', unmatched);
    }

    return {
      strategy: 'keyword',
      groups,
      metadata: {
        totalChunks: chunks.length,
        groupCount: groups.size,
        avgGroupSize: chunks.length / Math.max(1, groups.size),
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Structural chunking - group by source file or section
   * Useful when context comes from multiple files/documents
   */
  structuralChunk(chunks: EnhancedChunk[]): ChunkingResult {
    const startTime = Date.now();
    const groups = new Map<string, EnhancedChunk[]>();

    for (const chunk of chunks) {
      const source = this.normalizeSource(chunk.source || '_unknown');
      
      if (!groups.has(source)) {
        groups.set(source, []);
      }
      groups.get(source)!.push(chunk);
    }

    return {
      strategy: 'structural',
      groups,
      metadata: {
        totalChunks: chunks.length,
        groupCount: groups.size,
        avgGroupSize: chunks.length / Math.max(1, groups.size),
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Type-based chunking - group by chunk type
   * Useful for separating solutions, patterns, documentation, etc.
   */
  typeChunk(chunks: EnhancedChunk[]): ChunkingResult {
    const startTime = Date.now();
    const groups = new Map<string, EnhancedChunk[]>();

    for (const chunk of chunks) {
      const type = chunk.chunkType || 'unknown';
      
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(chunk);
    }

    return {
      strategy: 'structural',
      groups,
      metadata: {
        totalChunks: chunks.length,
        groupCount: groups.size,
        avgGroupSize: chunks.length / Math.max(1, groups.size),
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Importance-based chunking - group by importance levels
   * High importance chunks processed first
   */
  importanceChunk(
    chunks: EnhancedChunk[],
    thresholds: number[] = [0.7, 0.4]
  ): ChunkingResult {
    const startTime = Date.now();
    const groups = new Map<string, EnhancedChunk[]>();

    // Sort thresholds descending
    const sortedThresholds = [...thresholds].sort((a, b) => b - a);

    for (const chunk of chunks) {
      let assigned = false;
      
      for (let i = 0; i < sortedThresholds.length; i++) {
        if (chunk.importance >= sortedThresholds[i]) {
          const key = i === 0 ? 'high' : i === 1 ? 'medium' : `level_${i}`;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(chunk);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        if (!groups.has('low')) {
          groups.set('low', []);
        }
        groups.get('low')!.push(chunk);
      }
    }

    return {
      strategy: 'structural',
      groups,
      metadata: {
        totalChunks: chunks.length,
        groupCount: groups.size,
        avgGroupSize: chunks.length / Math.max(1, groups.size),
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Adaptive chunking - choose strategy based on content and query
   * Analyzes the chunks and query to select the best chunking approach
   */
  adaptiveChunk(
    chunks: EnhancedChunk[],
    query: string
  ): ChunkingResult {
    const startTime = Date.now();

    if (chunks.length === 0) {
      return {
        strategy: 'adaptive',
        groups: new Map(),
        metadata: {
          totalChunks: 0,
          groupCount: 0,
          avgGroupSize: 0,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    // Analyze content characteristics
    const hasCodeContent = chunks.some(c =>
      c.chunkType === ChunkType.CODE || /```[\s\S]*```/.test(c.content)
    );

    const uniqueSources = new Set(chunks.map(c => this.normalizeSource(c.source)));
    const hasMultipleSources = uniqueSources.size > 1;

    const uniqueTypes = new Set(chunks.map(c => c.chunkType));
    const hasMultipleTypes = uniqueTypes.size > 1;

    const hasEmbeddings = chunks.some(c => c.embedding && c.embedding.length > 0);

    // Analyze query patterns
    const queryLower = query.toLowerCase();
    const needsAggregation = /how many|count|list|all|every|total|compare/i.test(queryLower);
    const needsSpecific = /error|fix|bug|issue|problem/i.test(queryLower);
    const needsPattern = /pattern|example|how to|best practice/i.test(queryLower);
    const needsCode = /code|implement|function|class|method/i.test(queryLower);

    // Choose strategy based on analysis
    let result: ChunkingResult;

    if (hasCodeContent && hasMultipleSources && needsCode) {
      // Code from multiple files - use structural chunking
      result = this.structuralChunk(chunks);
      result.strategy = 'adaptive';
    } else if (needsAggregation) {
      // Aggregation query - uniform chunks for parallel processing
      const batchSize = Math.max(5, Math.ceil(chunks.length / 10));
      result = this.uniformChunkEnhanced(chunks, batchSize);
      result.strategy = 'adaptive';
    } else if (needsSpecific && hasMultipleTypes) {
      // Looking for specific solutions/patterns - group by type
      result = this.typeChunk(chunks);
      result.strategy = 'adaptive';
    } else if (needsPattern) {
      // Looking for patterns - use keyword-based with pattern keywords
      result = this.keywordChunk(chunks, ['pattern', 'example', 'best practice', 'recommended']);
      result.strategy = 'adaptive';
    } else if (hasEmbeddings && chunks.length > 10) {
      // Default to semantic chunking for large sets with embeddings
      result = this.semanticChunk(chunks, this.options.targetGroups);
      result.strategy = 'adaptive';
    } else if (hasMultipleSources) {
      // Multiple sources without specific need - structural
      result = this.structuralChunk(chunks);
      result.strategy = 'adaptive';
    } else {
      // Default to uniform chunking
      result = this.uniformChunkEnhanced(chunks);
      result.strategy = 'adaptive';
    }

    // Update processing time
    if (result.metadata) {
      result.metadata.processingTimeMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Get recommended strategy based on content analysis
   */
  recommendStrategy(chunks: EnhancedChunk[], query?: string): ChunkingStrategy {
    if (chunks.length === 0) return 'uniform';

    const hasEmbeddings = chunks.some(c => c.embedding && c.embedding.length > 0);
    const uniqueSources = new Set(chunks.map(c => this.normalizeSource(c.source)));
    const hasMultipleSources = uniqueSources.size > 1;

    if (query) {
      const queryLower = query.toLowerCase();
      if (/how many|count|list|all|every/.test(queryLower)) return 'uniform';
      if (/error|fix|bug|specific/.test(queryLower)) return 'keyword';
    }

    if (hasMultipleSources) return 'structural';
    if (hasEmbeddings && chunks.length > 5) return 'semantic';
    
    return 'uniform';
  }

  /**
   * K-means clustering implementation for semantic chunking
   */
  private kMeansClustering(
    embeddings: number[][],
    k: number,
    maxIterations: number = 50
  ): number[] {
    if (embeddings.length === 0) return [];
    if (embeddings.length <= k) {
      return embeddings.map((_, i) => i % k);
    }

    // Filter out empty embeddings
    const validIndices: number[] = [];
    const validEmbeddings: number[][] = [];
    
    embeddings.forEach((emb, i) => {
      if (emb && emb.length > 0) {
        validIndices.push(i);
        validEmbeddings.push(emb);
      }
    });

    if (validEmbeddings.length === 0) {
      return embeddings.map((_, i) => i % k);
    }

    const dim = validEmbeddings[0].length;
    const actualK = Math.min(k, validEmbeddings.length);

    // Initialize centroids using k-means++ style selection
    const centroids: number[][] = [];
    const usedIndices = new Set<number>();

    // First centroid is random
    const firstIdx = Math.floor(Math.random() * validEmbeddings.length);
    centroids.push([...validEmbeddings[firstIdx]]);
    usedIndices.add(firstIdx);

    // Select remaining centroids based on distance
    while (centroids.length < actualK) {
      let maxDist = -1;
      let bestIdx = 0;

      for (let i = 0; i < validEmbeddings.length; i++) {
        if (usedIndices.has(i)) continue;

        const minDistToCentroid = Math.min(
          ...centroids.map(c => this.euclideanDistance(validEmbeddings[i], c))
        );

        if (minDistToCentroid > maxDist) {
          maxDist = minDistToCentroid;
          bestIdx = i;
        }
      }

      centroids.push([...validEmbeddings[bestIdx]]);
      usedIndices.add(bestIdx);
    }

    // Run k-means iterations
    let assignments = new Array(validEmbeddings.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign points to nearest centroid
      const newAssignments = validEmbeddings.map(emb => {
        let minDist = Infinity;
        let closest = 0;

        for (let c = 0; c < centroids.length; c++) {
          const dist = this.euclideanDistance(emb, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            closest = c;
          }
        }

        return closest;
      });

      // Check for convergence
      const changed = newAssignments.some((a, i) => a !== assignments[i]);
      assignments = newAssignments;

      if (!changed) break;

      // Update centroids
      for (let c = 0; c < centroids.length; c++) {
        const members = validEmbeddings.filter((_, i) => assignments[i] === c);
        
        if (members.length > 0) {
          centroids[c] = new Array(dim).fill(0);
          for (const member of members) {
            for (let d = 0; d < dim; d++) {
              centroids[c][d] += member[d] / members.length;
            }
          }
        }
      }
    }

    // Map back to original indices
    const result = new Array(embeddings.length).fill(0);
    validIndices.forEach((origIdx, validIdx) => {
      result[origIdx] = assignments[validIdx];
    });

    // Assign invalid embeddings to cluster 0
    embeddings.forEach((emb, i) => {
      if (!emb || emb.length === 0) {
        result[i] = 0;
      }
    });

    return result;
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum);
  }

  /**
   * Normalize source path for grouping
   */
  private normalizeSource(source: string): string {
    if (!source) return '_unknown';
    
    // Extract filename or last path component
    const parts = source.split(/[\/\\]/);
    const filename = parts[parts.length - 1] || source;
    
    // Remove common prefixes
    return filename
      .replace(/^(cursor-chat:|extracted:|url:)/, '')
      .replace(/\?.*$/, ''); // Remove query strings
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<ChunkingOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  /**
   * Get current options
   */
  getOptions(): ChunkingOptions {
    return { ...this.options };
  }
}

let instance: SmartChunker | null = null;

export function createSmartChunker(options?: Partial<ChunkingOptions>): SmartChunker {
  return new SmartChunker(options);
}

export function getSmartChunker(options?: Partial<ChunkingOptions>): SmartChunker {
  if (!instance) {
    instance = new SmartChunker(options);
  }
  return instance;
}

export function resetSmartChunker(): void {
  instance = null;
}
