import type { ChunkMetadata, DecayConfig, DEFAULT_DECAY_CONFIG } from '../types/memory.js';
import type { MemoryMetadataStore } from './memoryMetadataStore.js';

/**
 * Configuration for decay calculation
 */
export interface DecayCalculatorConfig {
  halfLifeDays: number;
  expectedAccessesPerMonth: number;
  recencyBoostDays: number;
  recencyBoostMultiplier: number;
  weights: {
    age: number;
    access: number;
    importance: number;
  };
  archivalThreshold: number;
}

export const DEFAULT_DECAY_CALCULATOR_CONFIG: DecayCalculatorConfig = {
  halfLifeDays: 60,
  expectedAccessesPerMonth: 5,
  recencyBoostDays: 7,
  recencyBoostMultiplier: 1.5,
  weights: {
    age: 0.3,
    access: 0.3,
    importance: 0.4,
  },
  archivalThreshold: 0.2,
};

export interface UpdateResult {
  updated: number;
  archived: number;
  duration: number;
}

/**
 * Calculates decay scores for chunks based on multiple factors
 * 
 * Formula: decayScore = (ageFactor * weightAge) + (accessFactor * weightAccess) + (importanceFactor * weightImportance)
 * 
 * Where:
 * - ageFactor = 1.0 / (1.0 + (ageDays / halfLifeDays))
 * - accessFactor = min(1.0, accessCount / expectedAccesses) * recencyBoost
 * - importanceFactor = chunk.importance
 */
export class DecayCalculator {
  private config: DecayCalculatorConfig;

  constructor(config?: Partial<DecayCalculatorConfig>) {
    this.config = {
      ...DEFAULT_DECAY_CALCULATOR_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_DECAY_CALCULATOR_CONFIG.weights,
        ...config?.weights,
      },
    };
  }

  /**
   * Calculate decay score for a single chunk
   */
  calculateDecayScore(chunk: ChunkMetadata, now: Date = new Date()): number {
    const ageFactor = this.calculateAgeFactor(chunk.createdAt, now);
    const accessFactor = this.calculateAccessFactor(chunk, now);
    const importanceFactor = chunk.importance;

    const score =
      ageFactor * this.config.weights.age +
      accessFactor * this.config.weights.access +
      importanceFactor * this.config.weights.importance;

    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate age factor using exponential decay
   * Returns 1.0 for new chunks, approaches 0 for very old chunks
   */
  private calculateAgeFactor(createdAt: string, now: Date): number {
    const createdDate = new Date(createdAt);
    const ageDays = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: 1 / (1 + (age / halfLife))
    // At halfLife days, factor = 0.5
    return 1.0 / (1.0 + ageDays / this.config.halfLifeDays);
  }

  /**
   * Calculate access factor based on access count and recency
   */
  private calculateAccessFactor(chunk: ChunkMetadata, now: Date): number {
    // Base score from access count
    const baseAccessScore = Math.min(1.0, chunk.accessCount / this.config.expectedAccessesPerMonth);

    // Apply recency boost if accessed recently
    if (chunk.lastAccessedAt) {
      const lastAccessDate = new Date(chunk.lastAccessedAt);
      const daysSinceAccess = (now.getTime() - lastAccessDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceAccess <= this.config.recencyBoostDays) {
        // Linear decay of boost based on days since access
        const boostFactor = 1 - daysSinceAccess / this.config.recencyBoostDays;
        const boost = 1 + (this.config.recencyBoostMultiplier - 1) * boostFactor;
        return Math.min(1.0, baseAccessScore * boost);
      }
    }

    return baseAccessScore;
  }

  /**
   * Calculate decay scores for multiple chunks
   */
  calculateBatchDecayScores(chunks: ChunkMetadata[], now: Date = new Date()): Array<{ chunkId: string; decayScore: number }> {
    return chunks.map(chunk => ({
      chunkId: chunk.chunkId,
      decayScore: this.calculateDecayScore(chunk, now),
    }));
  }

  /**
   * Update all decay scores in the metadata store
   */
  updateAllDecayScores(store: MemoryMetadataStore, autoArchive: boolean = false): UpdateResult {
    const startTime = Date.now();
    const now = new Date();
    
    // Get all non-archived chunks
    const chunks = store.getAllChunkMetadata({ includeArchived: false });
    
    // Calculate new decay scores
    const updates = this.calculateBatchDecayScores(chunks, now);
    
    // Batch update scores
    store.bulkUpdateDecayScores(updates);
    
    // Optionally archive chunks below threshold
    let archived = 0;
    if (autoArchive) {
      const archivedIds = store.archiveStaleChunks(this.config.archivalThreshold);
      archived = archivedIds.length;
    }
    
    return {
      updated: updates.length,
      archived,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get chunks that are candidates for archival
   */
  getArchivalCandidates(chunks: ChunkMetadata[], threshold?: number): ChunkMetadata[] {
    const archiveThreshold = threshold ?? this.config.archivalThreshold;
    return chunks.filter(chunk => chunk.decayScore < archiveThreshold && !chunk.isArchived);
  }

  /**
   * Simulate decay over time for testing/visualization
   */
  simulateDecay(
    initialImportance: number,
    accessPattern: Array<{ dayOffset: number }>,
    daysToSimulate: number
  ): Array<{ day: number; decayScore: number }> {
    const results: Array<{ day: number; decayScore: number }> = [];
    const baseDate = new Date();
    
    // Create a mock chunk
    const mockChunk: ChunkMetadata = {
      chunkId: 'simulation',
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
      lastAccessedAt: null,
      accessCount: 0,
      importance: initialImportance,
      decayScore: 1.0,
      isArchived: false,
      chunkType: 'documentation' as any,
      sourceConversationId: null,
      sourceMessageIndex: null,
    };
    
    for (let day = 0; day <= daysToSimulate; day++) {
      const simulationDate = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000);
      
      // Apply any accesses for this day
      const todayAccesses = accessPattern.filter(a => a.dayOffset === day);
      for (const _ of todayAccesses) {
        mockChunk.accessCount++;
        mockChunk.lastAccessedAt = simulationDate.toISOString();
      }
      
      const score = this.calculateDecayScore(mockChunk, simulationDate);
      results.push({ day, decayScore: score });
    }
    
    return results;
  }

  /**
   * Get the current configuration
   */
  getConfig(): DecayCalculatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DecayCalculatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      weights: {
        ...this.config.weights,
        ...config?.weights,
      },
    };
  }
}

// Default instance
let instance: DecayCalculator | null = null;

export function getDecayCalculator(config?: Partial<DecayCalculatorConfig>): DecayCalculator {
  if (!instance) {
    instance = new DecayCalculator(config);
  }
  return instance;
}

export function resetDecayCalculator(): void {
  instance = null;
}
