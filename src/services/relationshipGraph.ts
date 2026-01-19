import {
  type GraphTraversalOptions,
  type GraphNode,
  type GraphTraversalResult,
  type Contradiction,
  type PotentialContradiction,
  type GraphStats,
  type FindRelatedOptions,
  type RelatedChunk,
  type RelationshipBatch,
  type RelationshipBatchResult,
  DEFAULT_TRAVERSAL_OPTIONS,
  REVERSE_RELATIONSHIP_MAP,
  isBidirectional,
  getReverseType,
} from '../types/relationships.js';
import { ChunkType, RelationshipType } from '../types/memory.js';
import { MemoryMetadataStore, getMemoryMetadataStore } from './memoryMetadataStore.js';

/**
 * Graph operations for relationship-based retrieval
 * 
 * This service provides graph traversal, contradiction detection, and
 * relationship management capabilities for the knowledge base.
 */
export class RelationshipGraph {
  private metadataStore: MemoryMetadataStore;

  constructor(metadataStore?: MemoryMetadataStore) {
    this.metadataStore = metadataStore || getMemoryMetadataStore();
  }

  /**
   * Add a relationship between two chunks
   */
  addRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType,
    options?: {
      strength?: number;
      bidirectional?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const strength = options?.strength ?? 0.5;
    const shouldBeBidirectional = options?.bidirectional ?? isBidirectional(type);
    
    this.metadataStore.addRelationship(
      fromId,
      toId,
      type,
      strength,
      options?.metadata
    );
    
    if (shouldBeBidirectional) {
      const reverseType = getReverseType(type);
      this.metadataStore.addRelationship(
        toId,
        fromId,
        reverseType,
        strength,
        options?.metadata
      );
    }
  }

  /**
   * Add multiple relationships in a batch
   */
  addRelationshipBatch(batch: RelationshipBatch): RelationshipBatchResult {
    const result: RelationshipBatchResult = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < batch.relationships.length; i++) {
      const rel = batch.relationships[i];
      try {
        this.addRelationship(rel.fromChunkId, rel.toChunkId, rel.type, {
          strength: rel.strength,
          bidirectional: rel.bidirectional,
          metadata: rel.metadata,
        });
        result.created++;
      } catch (error) {
        result.failed++;
        result.errors?.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Remove a relationship between two chunks
   */
  removeRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType
  ): void {
    this.metadataStore.deleteRelationship(fromId, toId, type);
    
    if (isBidirectional(type)) {
      const reverseType = getReverseType(type);
      this.metadataStore.deleteRelationship(toId, fromId, reverseType);
    }
  }

  /**
   * Traverse the graph from a starting chunk using BFS
   */
  traverse(
    startChunkId: string,
    options: Partial<GraphTraversalOptions> = {}
  ): GraphTraversalResult {
    const opts: GraphTraversalOptions = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options };
    const visited = new Set<string>();
    const results: GraphNode[] = [];
    let maxDepthReached = 0;

    const queue: Array<{
      chunkId: string;
      depth: number;
      path: string[];
      viaType?: RelationshipType;
      viaStrength?: number;
    }> = [{ chunkId: startChunkId, depth: 0, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.chunkId) || current.depth > opts.maxDepth) {
        continue;
      }

      visited.add(current.chunkId);
      maxDepthReached = Math.max(maxDepthReached, current.depth);

      if (current.depth > 0) {
        results.push({
          chunkId: current.chunkId,
          depth: current.depth,
          path: current.path,
          relationshipType: current.viaType!,
          strength: current.viaStrength!,
        });
      }

      const relationships = this.metadataStore.getRelationships(current.chunkId, opts.direction || 'both');

      for (const rel of relationships) {
        const relType = rel.relationshipType;
        
        if (opts.relationshipTypes && opts.relationshipTypes.length > 0) {
          if (!opts.relationshipTypes.includes(relType)) {
            continue;
          }
        }

        if (opts.minStrength && rel.strength < opts.minStrength) {
          continue;
        }

        const targetId = rel.sourceChunkId === current.chunkId 
          ? rel.targetChunkId 
          : rel.sourceChunkId;

        if (visited.has(targetId)) {
          continue;
        }

        if (opts.excludeArchived) {
          const metadata = this.metadataStore.getChunkMetadata(targetId);
          if (metadata?.isArchived) {
            continue;
          }
        }

        queue.push({
          chunkId: targetId,
          depth: current.depth + 1,
          path: [...current.path, current.chunkId],
          viaType: relType,
          viaStrength: rel.strength,
        });
      }
    }

    return {
      startChunkId,
      nodes: results,
      totalNodes: results.length,
      maxDepthReached,
      truncated: false,
    };
  }

  /**
   * Find all chunks related to a given chunk
   */
  findRelated(
    chunkId: string,
    options: FindRelatedOptions = {}
  ): RelatedChunk[] {
    const results: RelatedChunk[] = [];
    const seen = new Set<string>();

    const directRelationships = this.metadataStore.getRelationships(chunkId, 'both');

    for (const rel of directRelationships) {
      const relType = rel.relationshipType;
      
      if (options.types && options.types.length > 0) {
        if (!options.types.includes(relType)) {
          continue;
        }
      }

      if (options.minStrength && rel.strength < options.minStrength) {
        continue;
      }

      const targetId = rel.sourceChunkId === chunkId 
        ? rel.targetChunkId 
        : rel.sourceChunkId;

      if (!seen.has(targetId)) {
        seen.add(targetId);
        results.push({
          chunkId: targetId,
          relationshipType: relType,
          strength: rel.strength,
          isTransitive: false,
        });
      }
    }

    if (options.includeTransitive && options.transitiveDepth && options.transitiveDepth > 1) {
      const traversalResult = this.traverse(chunkId, {
        maxDepth: options.transitiveDepth,
        relationshipTypes: options.types,
        minStrength: options.minStrength,
      });

      for (const node of traversalResult.nodes) {
        if (!seen.has(node.chunkId)) {
          seen.add(node.chunkId);
          results.push({
            chunkId: node.chunkId,
            relationshipType: node.relationshipType,
            strength: node.strength,
            isTransitive: node.depth > 1,
            path: node.path,
          });
        }
      }
    }

    if (options.maxResults) {
      results.sort((a, b) => b.strength - a.strength);
      return results.slice(0, options.maxResults);
    }

    return results;
  }

  /**
   * Find known contradictions for a chunk
   */
  findContradictions(chunkId: string): Contradiction[] {
    const contradictions: Contradiction[] = [];

    const rels = this.metadataStore.getRelationships(chunkId, 'both');

    for (const rel of rels) {
      const relType = rel.relationshipType;
      let contradictionType: 'contradiction' | 'invalidation' | 'superseded' | null = null;

      if (relType === RelationshipType.CONTRADICTS) {
        contradictionType = 'contradiction';
      } else if (relType === RelationshipType.INVALIDATED_BY) {
        contradictionType = 'invalidation';
      } else if (relType === RelationshipType.SUPERSEDES) {
        if (rel.targetChunkId === chunkId) {
          contradictionType = 'superseded';
        }
      }

      if (contradictionType) {
        const targetId = rel.sourceChunkId === chunkId 
          ? rel.targetChunkId 
          : rel.sourceChunkId;

        contradictions.push({
          chunkId: targetId,
          type: contradictionType,
          strength: rel.strength,
          metadata: rel.metadata,
        });
      }
    }

    return contradictions;
  }

  /**
   * Detect potential contradictions for a new chunk based on similarity and temporal factors
   */
  detectPotentialContradictions(
    newChunkId: string,
    newChunkType: ChunkType,
    newChunkCreatedAt: Date,
    similarChunks: Array<{ id: string; similarity: number; chunkType: ChunkType; createdAt: string }>
  ): PotentialContradiction[] {
    const potentialContradictions: PotentialContradiction[] = [];

    const CONTRADICTION_TYPES = [
      ChunkType.SOLUTION,
      ChunkType.DECISION,
      ChunkType.PATTERN,
      ChunkType.STANDARD,
    ];

    if (!CONTRADICTION_TYPES.includes(newChunkType)) {
      return potentialContradictions;
    }

    for (const candidate of similarChunks) {
      if (candidate.similarity < 0.85) continue;

      if (!CONTRADICTION_TYPES.includes(candidate.chunkType)) continue;

      const candidateDate = new Date(candidate.createdAt);
      const timeDiff = Math.abs(newChunkCreatedAt.getTime() - candidateDate.getTime());
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      let suggestedAction: PotentialContradiction['suggestedAction'] = 'review';
      let reason = 'High semantic similarity detected';

      if (daysDiff > 30) {
        suggestedAction = 'supersede';
        reason = `High similarity but ${Math.round(daysDiff)} days apart - likely an update`;
      } else if (daysDiff < 1 && candidate.similarity > 0.95) {
        suggestedAction = 'merge';
        reason = 'Very high similarity within same day - likely duplicate';
      } else if (candidate.similarity < 0.9) {
        suggestedAction = 'ignore';
        reason = 'Moderate similarity - may be related but not contradictory';
      }

      potentialContradictions.push({
        existingChunkId: candidate.id,
        newChunkId,
        similarity: candidate.similarity,
        reason,
        suggestedAction,
      });
    }

    return potentialContradictions;
  }

  /**
   * Mark a chunk as superseding another
   */
  markSupersedes(newChunkId: string, oldChunkId: string, strength: number = 0.8): void {
    this.addRelationship(newChunkId, oldChunkId, RelationshipType.SUPERSEDES, {
      strength,
      metadata: {
        supersededAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Mark two chunks as contradicting each other
   */
  markContradiction(
    chunkId1: string,
    chunkId2: string,
    strength: number = 0.7,
    metadata?: Record<string, unknown>
  ): void {
    this.addRelationship(chunkId1, chunkId2, RelationshipType.CONTRADICTS, {
      strength,
      bidirectional: true,
      metadata: {
        detectedAt: new Date().toISOString(),
        ...metadata,
      },
    });
  }

  /**
   * Find all chunks that supersede a given chunk (chain of updates)
   */
  findSupersessionChain(chunkId: string): string[] {
    const chain: string[] = [];
    let currentId = chunkId;
    const visited = new Set<string>();

    while (true) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const rels = this.metadataStore.getRelationships(currentId, 'to');
      const supersedingRel = rels.find(r => r.relationshipType === RelationshipType.SUPERSEDES);

      if (!supersedingRel) break;

      currentId = supersedingRel.sourceChunkId;
      chain.push(currentId);
    }

    return chain;
  }

  /**
   * Get the latest version in a supersession chain
   */
  getLatestVersion(chunkId: string): string {
    const chain = this.findSupersessionChain(chunkId);
    return chain.length > 0 ? chain[chain.length - 1] : chunkId;
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    const allChunks = this.metadataStore.getAllChunkMetadata({ includeArchived: true });
    const relationshipsByType: Record<RelationshipType, number> = {} as any;
    
    for (const type of Object.values(RelationshipType)) {
      relationshipsByType[type as RelationshipType] = 0;
    }

    let totalRelationships = 0;
    const connectionCounts = new Map<string, number>();
    const chunksWithRelationships = new Set<string>();

    for (const chunk of allChunks) {
      const rels = this.metadataStore.getRelationships(chunk.chunkId, 'both');
      const count = rels.length;
      
      if (count > 0) {
        chunksWithRelationships.add(chunk.chunkId);
        connectionCounts.set(chunk.chunkId, count);
        
        for (const rel of rels) {
          const type = rel.relationshipType;
          if (relationshipsByType[type] !== undefined) {
            relationshipsByType[type]++;
          }
          totalRelationships++;
        }
      }
    }

    totalRelationships = Math.floor(totalRelationships / 2);

    const sortedConnections = Array.from(connectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([chunkId, connections]) => ({ chunkId, connections }));

    const isolatedChunks = allChunks.length - chunksWithRelationships.size;
    const avgRelationships = chunksWithRelationships.size > 0
      ? totalRelationships / chunksWithRelationships.size
      : 0;

    let maxDepth = 0;
    const sampleChunks = Array.from(chunksWithRelationships).slice(0, 5);
    for (const chunkId of sampleChunks) {
      const result = this.traverse(chunkId, { maxDepth: 10 });
      maxDepth = Math.max(maxDepth, result.maxDepthReached);
    }

    return {
      totalRelationships,
      relationshipsByType,
      avgRelationshipsPerChunk: avgRelationships,
      maxDepth,
      isolatedChunks,
      mostConnectedChunks: sortedConnections,
    };
  }

  /**
   * Find strongly connected components (clusters of related knowledge)
   */
  findClusters(minClusterSize: number = 3): string[][] {
    const allChunks = this.metadataStore.getAllChunkMetadata({ includeArchived: false });
    const visited = new Set<string>();
    const clusters: string[][] = [];

    for (const chunk of allChunks) {
      if (visited.has(chunk.chunkId)) continue;

      const cluster: string[] = [];
      const queue = [chunk.chunkId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;

        visited.add(currentId);
        cluster.push(currentId);

        const related = this.metadataStore.getRelatedChunkIds(currentId);
        for (const relatedId of related) {
          if (!visited.has(relatedId)) {
            queue.push(relatedId);
          }
        }
      }

      if (cluster.length >= minClusterSize) {
        clusters.push(cluster);
      }
    }

    return clusters.sort((a, b) => b.length - a.length);
  }
}

let instance: RelationshipGraph | null = null;

export function getRelationshipGraph(metadataStore?: MemoryMetadataStore): RelationshipGraph {
  if (!instance) {
    instance = new RelationshipGraph(metadataStore);
  }
  return instance;
}

export function resetRelationshipGraph(): void {
  instance = null;
}
