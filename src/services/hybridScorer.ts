import type {
  EnhancedChunk,
  ChunkType,
  EnhancedSearchResult,
} from '../types/memory.js';
import { ChunkType as ChunkTypeEnum } from '../types/memory.js';
import { RelationshipGraph, getRelationshipGraph } from './relationshipGraph.js';
import { CategoryManager, getCategoryManager } from './categoryManager.js';
import { MemoryMetadataStore, getMemoryMetadataStore } from './memoryMetadataStore.js';

export interface ScoreWeights {
  similarity: number;
  decay: number;
  importance: number;
  recency: number;
  graphBoost: number;
  typeBoost: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  similarity: 0.35,
  decay: 0.20,
  importance: 0.15,
  recency: 0.10,
  graphBoost: 0.10,
  typeBoost: 0.10,
};

export interface TypeBoosts {
  [key: string]: number;
}

export const DEFAULT_TYPE_BOOSTS: TypeBoosts = {
  [ChunkTypeEnum.SOLUTION]: 1.2,
  [ChunkTypeEnum.PATTERN]: 1.15,
  [ChunkTypeEnum.DECISION]: 1.1,
  [ChunkTypeEnum.STANDARD]: 1.05,
  [ChunkTypeEnum.DOCUMENTATION]: 1.0,
  [ChunkTypeEnum.CODE]: 1.0,
  [ChunkTypeEnum.PREFERENCE]: 0.9,
  [ChunkTypeEnum.CATEGORY_SUMMARY]: 1.3,
};

export interface ScoringConfig {
  weights: ScoreWeights;
  typeBoosts: TypeBoosts;
  recencyHalfLifeDays: number;
  graphTraversalDepth: number;
  graphMinStrength: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: DEFAULT_SCORE_WEIGHTS,
  typeBoosts: DEFAULT_TYPE_BOOSTS,
  recencyHalfLifeDays: 7,
  graphTraversalDepth: 2,
  graphMinStrength: 0.3,
};

export interface ScoringContext {
  seedChunkIds?: string[];
  preferredTypes?: ChunkType[];
  project?: string;
  boostCategories?: string[];
}

export interface ScoreComponents {
  similarity: number;
  decay: number;
  importance: number;
  recency: number;
  graphBoost: number;
  typeBoost: number;
}

export interface ScoredResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  scores: ScoreComponents;
  finalScore: number;
  chunk?: EnhancedChunk;
}

export interface CategorySummary {
  category: string;
  summary: string;
  itemCount: number;
}

export interface TieredResult {
  tier: 'summary' | 'item' | 'both';
  results: ScoredResult[];
  categorySummaries?: CategorySummary[];
  message: string;
  totalFound: number;
}

export interface SearchResultInput {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Hybrid scoring system that combines multiple signals for final ranking
 * 
 * Signals combined:
 * - Vector similarity (base retrieval score)
 * - Temporal decay (age-based relevance)
 * - Importance (user-defined or inferred)
 * - Recency (recently accessed items)
 * - Graph boost (related to known-relevant items)
 * - Type boost (favor solutions/patterns over raw docs)
 */
export class HybridScorer {
  private config: ScoringConfig;
  private graph: RelationshipGraph;
  private metadataStore: MemoryMetadataStore;
  private categoryManager: CategoryManager;

  constructor(
    graph?: RelationshipGraph,
    metadataStore?: MemoryMetadataStore,
    categoryManager?: CategoryManager,
    config?: Partial<ScoringConfig>
  ) {
    this.graph = graph || getRelationshipGraph();
    this.metadataStore = metadataStore || getMemoryMetadataStore();
    this.categoryManager = categoryManager || getCategoryManager(this.metadataStore);
    this.config = {
      ...DEFAULT_SCORING_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_SCORING_CONFIG.weights,
        ...config?.weights,
      },
      typeBoosts: {
        ...DEFAULT_SCORING_CONFIG.typeBoosts,
        ...config?.typeBoosts,
      },
    };
  }

  /**
   * Score and rank search results using hybrid scoring
   */
  async scoreResults(
    results: SearchResultInput[],
    query: string,
    context?: ScoringContext
  ): Promise<ScoredResult[]> {
    const graphContext = context?.seedChunkIds
      ? await this.getGraphContext(context.seedChunkIds)
      : new Map<string, number>();

    const scored: ScoredResult[] = [];

    for (const result of results) {
      const metadata = this.metadataStore.getChunkMetadata(result.id);
      
      const scores: ScoreComponents = {
        similarity: result.score,
        decay: metadata?.decayScore ?? 1.0,
        importance: metadata?.importance ?? 0.5,
        recency: this.calculateRecencyScore(metadata?.lastAccessedAt),
        graphBoost: graphContext.get(result.id) ?? 0,
        typeBoost: this.getTypeBoost(metadata?.chunkType, context?.preferredTypes),
      };

      const finalScore = this.calculateFinalScore(scores);

      scored.push({
        id: result.id,
        content: result.content,
        metadata: {
          ...result.metadata,
          chunkType: metadata?.chunkType,
          importance: metadata?.importance,
          decayScore: metadata?.decayScore,
          accessCount: metadata?.accessCount,
        },
        scores,
        finalScore,
      });
    }

    scored.sort((a, b) => b.finalScore - a.finalScore);
    return scored;
  }

  /**
   * Tiered retrieval: try category summaries first, then drill down
   */
  async tieredRetrieval(
    query: string,
    searchResults: SearchResultInput[],
    options?: {
      maxSummaries?: number;
      maxItems?: number;
      requireSpecificItems?: boolean;
    }
  ): Promise<TieredResult> {
    const maxSummaries = options?.maxSummaries ?? 3;
    const maxItems = options?.maxItems ?? 10;

    await this.categoryManager.initialize();

    // Stage 1: Select relevant categories
    const relevantCategories = await this.categoryManager.selectRelevantCategories(query, {
      maxCategories: maxSummaries,
      includeSummaries: true,
      minItemCount: 1,
    });

    // Stage 2: Get category summaries
    const summaries: CategorySummary[] = [];
    for (const cat of relevantCategories) {
      if (cat.summary) {
        summaries.push({
          category: cat.name,
          summary: cat.summary,
          itemCount: cat.itemCount,
        });
      }
    }

    // Stage 3: Check if summaries are sufficient
    const sufficiencyCheck = this.checkSufficiency(query, summaries);

    if (sufficiencyCheck.sufficient && !options?.requireSpecificItems) {
      return {
        tier: 'summary',
        results: [],
        categorySummaries: summaries,
        message: `Answered from ${summaries.length} category summaries: ${sufficiencyCheck.reason}`,
        totalFound: summaries.reduce((sum, s) => sum + s.itemCount, 0),
      };
    }

    // Stage 4: Score and rank specific items
    const scored = await this.scoreResults(searchResults, query, {
      boostCategories: relevantCategories.map(c => c.name),
    });

    const topItems = scored.slice(0, maxItems);

    if (summaries.length > 0) {
      return {
        tier: 'both',
        results: topItems,
        categorySummaries: summaries,
        message: `Retrieved ${topItems.length} items with ${summaries.length} category summaries`,
        totalFound: searchResults.length,
      };
    }

    return {
      tier: 'item',
      results: topItems,
      message: `Retrieved ${topItems.length} specific items`,
      totalFound: searchResults.length,
    };
  }

  /**
   * Score a single result (useful for on-the-fly scoring)
   */
  scoreOne(
    result: SearchResultInput,
    context?: ScoringContext
  ): ScoredResult {
    const metadata = this.metadataStore.getChunkMetadata(result.id);
    
    const scores: ScoreComponents = {
      similarity: result.score,
      decay: metadata?.decayScore ?? 1.0,
      importance: metadata?.importance ?? 0.5,
      recency: this.calculateRecencyScore(metadata?.lastAccessedAt),
      graphBoost: 0,
      typeBoost: this.getTypeBoost(metadata?.chunkType, context?.preferredTypes),
    };

    return {
      id: result.id,
      content: result.content,
      metadata: result.metadata || {},
      scores,
      finalScore: this.calculateFinalScore(scores),
    };
  }

  /**
   * Re-rank existing scored results with updated context
   */
  async rerankWithContext(
    results: ScoredResult[],
    context: ScoringContext
  ): Promise<ScoredResult[]> {
    const graphContext = context.seedChunkIds
      ? await this.getGraphContext(context.seedChunkIds)
      : new Map<string, number>();

    return results
      .map(result => {
        const graphBoost = graphContext.get(result.id) ?? result.scores.graphBoost;
        const typeBoost = this.getTypeBoost(
          result.metadata?.chunkType as ChunkType,
          context.preferredTypes
        );

        const updatedScores: ScoreComponents = {
          ...result.scores,
          graphBoost,
          typeBoost,
        };

        return {
          ...result,
          scores: updatedScores,
          finalScore: this.calculateFinalScore(updatedScores),
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Get score breakdown for debugging/transparency
   */
  explainScore(result: ScoredResult): string {
    const { scores, finalScore } = result;
    const w = this.config.weights;

    const lines = [
      `Score Breakdown for ${result.id}:`,
      `  Similarity: ${scores.similarity.toFixed(3)} × ${w.similarity} = ${(scores.similarity * w.similarity).toFixed(3)}`,
      `  Decay: ${scores.decay.toFixed(3)} × ${w.decay} = ${(scores.decay * w.decay).toFixed(3)}`,
      `  Importance: ${scores.importance.toFixed(3)} × ${w.importance} = ${(scores.importance * w.importance).toFixed(3)}`,
      `  Recency: ${scores.recency.toFixed(3)} × ${w.recency} = ${(scores.recency * w.recency).toFixed(3)}`,
      `  Graph Boost: ${scores.graphBoost.toFixed(3)} × ${w.graphBoost} = ${(scores.graphBoost * w.graphBoost).toFixed(3)}`,
      `  Type Boost: ${(scores.typeBoost - 1).toFixed(3)} × ${w.typeBoost} = ${((scores.typeBoost - 1) * w.typeBoost).toFixed(3)}`,
      `  ─────────────────────────`,
      `  Final Score: ${finalScore.toFixed(3)}`,
    ];

    return lines.join('\n');
  }

  /**
   * Update scoring configuration
   */
  updateConfig(config: Partial<ScoringConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      weights: {
        ...this.config.weights,
        ...config?.weights,
      },
      typeBoosts: {
        ...this.config.typeBoosts,
        ...config?.typeBoosts,
      },
    };
  }

  getConfig(): ScoringConfig {
    return { ...this.config };
  }

  private calculateFinalScore(scores: ScoreComponents): number {
    const w = this.config.weights;

    return (
      scores.similarity * w.similarity +
      scores.decay * w.decay +
      scores.importance * w.importance +
      scores.recency * w.recency +
      scores.graphBoost * w.graphBoost +
      (scores.typeBoost - 1.0) * w.typeBoost
    );
  }

  private calculateRecencyScore(lastAccessed: string | null | undefined): number {
    if (!lastAccessed) return 0;

    const lastAccessDate = new Date(lastAccessed);
    const daysSinceAccess = (Date.now() - lastAccessDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return 1.0 / (1.0 + daysSinceAccess / this.config.recencyHalfLifeDays);
  }

  private getTypeBoost(
    chunkType: ChunkType | undefined,
    preferredTypes?: ChunkType[]
  ): number {
    if (!chunkType) return 1.0;

    let boost = this.config.typeBoosts[chunkType] ?? 1.0;

    if (preferredTypes?.includes(chunkType)) {
      boost *= 1.1;
    }

    return boost;
  }

  private async getGraphContext(seedChunkIds: string[]): Promise<Map<string, number>> {
    const boost = new Map<string, number>();

    for (const seedId of seedChunkIds) {
      const traversalResult = this.graph.traverse(seedId, {
        maxDepth: this.config.graphTraversalDepth,
        minStrength: this.config.graphMinStrength,
      });

      for (const node of traversalResult.nodes) {
        const existingBoost = boost.get(node.chunkId) ?? 0;
        const depthFactor = 1.0 / (1.0 + node.depth);
        const newBoost = node.strength * depthFactor;
        boost.set(node.chunkId, Math.max(existingBoost, newBoost));
      }
    }

    return boost;
  }

  private checkSufficiency(
    query: string,
    summaries: CategorySummary[]
  ): { sufficient: boolean; reason: string } {
    if (summaries.length === 0) {
      return { sufficient: false, reason: 'No relevant category summaries found' };
    }

    const queryLower = query.toLowerCase();

    // Queries requiring specific details
    const specificPatterns = [
      /\bhow\s+(do|to|can|should)\b/i,
      /\bwhat\s+(is|are|was|were)\s+the\s+(exact|specific)\b/i,
      /\berror\b/i,
      /\bfix\b/i,
      /\bbug\b/i,
      /\bcode\s+(for|to|that)\b/i,
      /\bexample\b/i,
      /\bspecific\b/i,
      /\bexact\b/i,
      /\bwhere\s+(is|are|do)\b/i,
    ];

    const isSpecific = specificPatterns.some(pattern => pattern.test(queryLower));

    if (isSpecific) {
      return { sufficient: false, reason: 'Query requires specific details' };
    }

    // General/overview queries
    const overviewPatterns = [
      /\bwhat\s+(is|are)\s+/i,
      /\boverview\b/i,
      /\bsummary\b/i,
      /\bexplain\b/i,
      /\bdescribe\b/i,
      /\bgeneral\b/i,
      /\babout\b/i,
    ];

    const isOverview = overviewPatterns.some(pattern => pattern.test(queryLower));

    if (isOverview && summaries.some(s => s.summary && s.summary.length > 100)) {
      return { sufficient: true, reason: 'Overview query matches category summaries' };
    }

    // If we have substantial summaries, they might be sufficient
    const totalContent = summaries.reduce((sum, s) => sum + (s.summary?.length || 0), 0);
    if (totalContent > 500) {
      return { sufficient: true, reason: 'Substantial category summaries available' };
    }

    return { sufficient: false, reason: 'More detail may be needed' };
  }
}

let instance: HybridScorer | null = null;

export function getHybridScorer(
  config?: Partial<ScoringConfig>
): HybridScorer {
  if (!instance) {
    instance = new HybridScorer(undefined, undefined, undefined, config);
  }
  return instance;
}

export function resetHybridScorer(): void {
  instance = null;
}
