/**
 * Typed relationships between knowledge chunks
 * 
 * These relationship types enable multi-hop reasoning and graph traversal
 * for more intelligent knowledge retrieval.
 */

import { RelationshipType } from './memory.js';

// Re-export for convenience
export { RelationshipType };

/**
 * Categories of relationship types for filtering
 */
export const RELATIONSHIP_CATEGORIES = {
  semantic: [
    RelationshipType.RELATES_TO,
    RelationshipType.SIMILAR_TO,
  ],
  causal: [
    RelationshipType.LEADS_TO,
    RelationshipType.DERIVES_FROM,
    RelationshipType.SOLVES,
  ],
  temporal: [
    RelationshipType.SUPERSEDES,
    RelationshipType.OCCURRED_BEFORE,
    RelationshipType.EVOLVED_INTO,
  ],
  conflict: [
    RelationshipType.CONTRADICTS,
    RelationshipType.INVALIDATED_BY,
  ],
  preference: [
    RelationshipType.PREFERS_OVER,
  ],
  structural: [
    RelationshipType.PART_OF,
    RelationshipType.DEPENDS_ON,
    RelationshipType.IMPLEMENTS,
    RelationshipType.EXEMPLIFIES,
    RelationshipType.EXTENDS,
    RelationshipType.REFERENCES,
    RelationshipType.EXAMPLE_OF,
    RelationshipType.ALTERNATIVE_TO,
  ],
} as const;

/**
 * Bidirectional relationship pairs - relationships that naturally work both ways
 */
export const BIDIRECTIONAL_RELATIONSHIPS = new Set([
  RelationshipType.RELATES_TO,
  RelationshipType.SIMILAR_TO,
  RelationshipType.CONTRADICTS,
]);

/**
 * Maps relationship types to their logical reverse
 */
export const REVERSE_RELATIONSHIP_MAP: Record<RelationshipType, RelationshipType> = {
  [RelationshipType.RELATES_TO]: RelationshipType.RELATES_TO,
  [RelationshipType.SIMILAR_TO]: RelationshipType.SIMILAR_TO,
  [RelationshipType.LEADS_TO]: RelationshipType.DERIVES_FROM,
  [RelationshipType.DERIVES_FROM]: RelationshipType.LEADS_TO,
  [RelationshipType.SOLVES]: RelationshipType.SOLVES,
  [RelationshipType.SUPERSEDES]: RelationshipType.SUPERSEDES,
  [RelationshipType.OCCURRED_BEFORE]: RelationshipType.OCCURRED_BEFORE,
  [RelationshipType.EVOLVED_INTO]: RelationshipType.DERIVES_FROM,
  [RelationshipType.CONTRADICTS]: RelationshipType.CONTRADICTS,
  [RelationshipType.INVALIDATED_BY]: RelationshipType.INVALIDATED_BY,
  [RelationshipType.PREFERS_OVER]: RelationshipType.PREFERS_OVER,
  [RelationshipType.PART_OF]: RelationshipType.PART_OF,
  [RelationshipType.DEPENDS_ON]: RelationshipType.DEPENDS_ON,
  [RelationshipType.IMPLEMENTS]: RelationshipType.EXEMPLIFIES,
  [RelationshipType.EXEMPLIFIES]: RelationshipType.IMPLEMENTS,
  [RelationshipType.EXTENDS]: RelationshipType.EXTENDS,
  [RelationshipType.REFERENCES]: RelationshipType.REFERENCES,
  [RelationshipType.EXAMPLE_OF]: RelationshipType.EXAMPLE_OF,
  [RelationshipType.ALTERNATIVE_TO]: RelationshipType.ALTERNATIVE_TO,
};

/**
 * A relationship between two chunks with metadata
 */
export interface Relationship {
  id: string;
  fromChunkId: string;
  toChunkId: string;
  type: RelationshipType;
  strength: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
  bidirectional: boolean;
}

/**
 * Options for graph traversal operations
 */
export interface GraphTraversalOptions {
  maxDepth: number;
  relationshipTypes?: RelationshipType[];
  minStrength?: number;
  excludeArchived?: boolean;
  includeMetadata?: boolean;
  direction?: 'from' | 'to' | 'both';
}

/**
 * Default traversal options
 */
export const DEFAULT_TRAVERSAL_OPTIONS: GraphTraversalOptions = {
  maxDepth: 2,
  minStrength: 0.3,
  excludeArchived: true,
  includeMetadata: false,
  direction: 'both',
};

/**
 * A node in the traversal result graph
 */
export interface GraphNode {
  chunkId: string;
  depth: number;
  path: string[];
  relationshipType: RelationshipType;
  strength: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a graph traversal operation
 */
export interface GraphTraversalResult {
  startChunkId: string;
  nodes: GraphNode[];
  totalNodes: number;
  maxDepthReached: number;
  truncated: boolean;
}

/**
 * A detected contradiction between chunks
 */
export interface Contradiction {
  chunkId: string;
  type: 'contradiction' | 'invalidation' | 'superseded';
  strength: number;
  metadata?: Record<string, unknown>;
}

/**
 * A potential contradiction detected automatically
 */
export interface PotentialContradiction {
  existingChunkId: string;
  newChunkId: string;
  similarity: number;
  reason: string;
  suggestedAction: 'review' | 'supersede' | 'merge' | 'ignore';
}

/**
 * Statistics about the relationship graph
 */
export interface GraphStats {
  totalRelationships: number;
  relationshipsByType: Record<RelationshipType, number>;
  avgRelationshipsPerChunk: number;
  maxDepth: number;
  isolatedChunks: number;
  mostConnectedChunks: Array<{ chunkId: string; connections: number }>;
}

/**
 * Options for finding related chunks
 */
export interface FindRelatedOptions {
  types?: RelationshipType[];
  minStrength?: number;
  maxResults?: number;
  includeTransitive?: boolean;
  transitiveDepth?: number;
}

/**
 * A related chunk with relationship context
 */
export interface RelatedChunk {
  chunkId: string;
  relationshipType: RelationshipType;
  strength: number;
  isTransitive: boolean;
  path?: string[];
}

/**
 * Batch operation for creating multiple relationships
 */
export interface RelationshipBatch {
  relationships: Array<{
    fromChunkId: string;
    toChunkId: string;
    type: RelationshipType;
    strength?: number;
    bidirectional?: boolean;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Result of a batch relationship operation
 */
export interface RelationshipBatchResult {
  created: number;
  updated: number;
  failed: number;
  errors?: Array<{ index: number; error: string }>;
}

/**
 * Helper function to check if a relationship type is bidirectional
 */
export function isBidirectional(type: RelationshipType): boolean {
  return BIDIRECTIONAL_RELATIONSHIPS.has(type);
}

/**
 * Get the reverse relationship type for a given type
 */
export function getReverseType(type: RelationshipType): RelationshipType {
  return REVERSE_RELATIONSHIP_MAP[type];
}

/**
 * Get all relationship types in a category
 */
export function getRelationshipsByCategory(
  category: keyof typeof RELATIONSHIP_CATEGORIES
): RelationshipType[] {
  return [...RELATIONSHIP_CATEGORIES[category]];
}
