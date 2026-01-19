/**
 * Enhanced Memory Types for cursor-recursive-rag
 * 
 * These types support temporal tracking, importance scoring, decay calculations,
 * and relationship mapping for an advanced memory system.
 */

/**
 * Chunk type classification for different knowledge categories
 */
export enum ChunkType {
  DOCUMENTATION = 'documentation',
  CODE = 'code',
  SOLUTION = 'solution',
  PATTERN = 'pattern',
  DECISION = 'decision',
  STANDARD = 'standard',
  PREFERENCE = 'preference',
  CATEGORY_SUMMARY = 'category_summary',
}

/**
 * Entity types for tagging extracted entities
 */
export enum EntityType {
  TOOL = 'tool',
  LANGUAGE = 'language',
  FRAMEWORK = 'framework',
  CONCEPT = 'concept',
  PROJECT = 'project',
  PERSON = 'person',
  FILE = 'file',
  COMPONENT = 'component',
}

/**
 * Entity tag with confidence score
 */
export interface EntityTag {
  type: EntityType;
  value: string;
  confidence: number;
}

/**
 * Enhanced chunk interface with temporal and importance tracking
 */
export interface EnhancedChunk {
  // Core fields (compatible with existing VectorDocument)
  id: string;
  content: string;
  embedding: number[];
  source: string;
  metadata: Record<string, unknown>;
  
  // Temporal tracking
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
  accessCount: number;
  
  // Importance & decay
  importance: number;
  decayScore: number;
  isArchived: boolean;
  
  // Type classification
  chunkType: ChunkType;
  
  // Relationships (IDs of related chunks)
  relatedChunkIds: string[];
  
  // Entity tags
  entities: EntityTag[];
  
  // Source tracking for chat-derived knowledge
  sourceConversationId?: string;
  sourceMessageIndex?: number;
}

/**
 * Metadata stored in SQLite for temporal tracking
 * (Separate from vector store to work with any backend)
 */
export interface ChunkMetadata {
  chunkId: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
  importance: number;
  decayScore: number;
  isArchived: boolean;
  chunkType: ChunkType;
  sourceConversationId: string | null;
  sourceMessageIndex: number | null;
}

/**
 * Relationship between chunks
 */
export interface ChunkRelationship {
  id: string;
  sourceChunkId: string;
  targetChunkId: string;
  relationshipType: RelationshipType;
  strength: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Relationship types between chunks
 */
export enum RelationshipType {
  // Semantic relationships
  RELATES_TO = 'relates_to',
  SIMILAR_TO = 'similar_to',
  
  // Causal relationships
  LEADS_TO = 'leads_to',
  DERIVES_FROM = 'derives_from',
  SOLVES = 'solves',
  
  // Temporal relationships
  SUPERSEDES = 'supersedes',
  OCCURRED_BEFORE = 'occurred_before',
  EVOLVED_INTO = 'evolved_into',
  
  // Conflict relationships
  CONTRADICTS = 'contradicts',
  INVALIDATED_BY = 'invalidated_by',
  
  // Preference relationships
  PREFERS_OVER = 'prefers_over',
  
  // Structural relationships
  PART_OF = 'part_of',
  DEPENDS_ON = 'depends_on',
  IMPLEMENTS = 'implements',
  EXEMPLIFIES = 'exemplifies',
  EXTENDS = 'extends',
  REFERENCES = 'references',
  EXAMPLE_OF = 'example_of',
  ALTERNATIVE_TO = 'alternative_to',
}

/**
 * Access log entry for tracking chunk usage
 */
export interface AccessLogEntry {
  id: string;
  chunkId: string;
  accessedAt: string;
  queryText: string | null;
  resultRank: number | null;
  wasClicked: boolean;
}

/**
 * Category for hierarchical memory organization
 */
export interface Category {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  summary: string;
  chunkCount: number;
  lastUpdated: string;
  createdAt: string;
}

/**
 * Category assignment for a chunk
 */
export interface CategoryItem {
  id: string;
  chunkId: string;
  categoryId: string;
  relevanceScore: number;
  assignedAt: string;
}

/**
 * Configuration for decay calculation
 */
export interface DecayConfig {
  halfLifeDays: number;
  accessBoostFactor: number;
  importanceWeight: number;
  minDecayScore: number;
  maxDecayScore: number;
}

/**
 * Default decay configuration
 */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  halfLifeDays: 30,
  accessBoostFactor: 0.1,
  importanceWeight: 0.3,
  minDecayScore: 0.0,
  maxDecayScore: 1.0,
};

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalChunks: number;
  activeChunks: number;
  archivedChunks: number;
  avgDecayScore: number;
  avgImportance: number;
  totalAccesses: number;
  chunksByType: Record<ChunkType, number>;
  relationshipCount: number;
  categoryCount: number;
}

/**
 * Processed conversation record (for chat history ingestion)
 */
export interface ProcessedConversation {
  id: string;
  conversationId: string;
  processedAt: string;
  messageCount: number;
  chunksCreated: number;
  knowledgeExtracted: number;
}


/**
 * Hybrid search result with decay-adjusted scoring
 */
export interface EnhancedSearchResult {
  // Core result fields (compatible with SearchResult)
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  
  // Enhanced fields
  chunk: EnhancedChunk;
  similarityScore: number;
  decayAdjustedScore: number;
  finalScore: number;
  relatedChunks?: EnhancedChunk[];
  categoryPath?: string[];
}

/**
 * Search options with memory-aware filtering
 */
export interface EnhancedSearchOptions {
  topK: number;
  filter?: Record<string, unknown>;
  minDecayScore?: number;
  chunkTypes?: ChunkType[];
  includeArchived?: boolean;
  categoryIds?: string[];
  entityFilters?: Partial<Record<EntityType, string[]>>;
  timeRange?: {
    from?: Date;
    to?: Date;
  };
  includeRelated?: boolean;
  maxRelatedDepth?: number;
  scoreWeights?: {
    similarity: number;
    decay: number;
    importance: number;
  };
}
