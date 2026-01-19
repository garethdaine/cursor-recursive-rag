/**
 * Knowledge Extraction Types for cursor-recursive-rag
 * 
 * These types define structured knowledge extracted from conversations using LLM.
 * Includes solutions, patterns, decisions, standards, and preferences.
 */

import type { EntityType, EntityTag } from './memory.js';

/**
 * Complete extracted knowledge from a conversation
 */
export interface ExtractedKnowledge {
  conversationId: string;
  extractedAt: Date;
  solutions: ExtractedSolution[];
  patterns: ExtractedPattern[];
  decisions: ExtractedDecision[];
  standards: ExtractedStandard[];
  preferences: ExtractedPreference[];
  entities: ExtractedEntity[];
}

/**
 * A problem/solution pair extracted from a conversation
 */
export interface ExtractedSolution {
  id: string;
  problem: string;
  errorMessage?: string;
  solution: string;
  codeChanges: CodeChange[];
  filesAffected: string[];
  tags: string[];
  confidence: number;
  sourceMessageIndices: number[];
}

/**
 * A reusable code pattern extracted from a conversation
 */
export interface ExtractedPattern {
  id: string;
  name: string;
  description: string;
  useCase: string;
  implementation: string;
  language: string;
  relatedPatterns: string[];
  tags: string[];
  confidence: number;
  sourceMessageIndices: number[];
}

/**
 * An architectural or technical decision extracted from a conversation
 */
export interface ExtractedDecision {
  id: string;
  topic: string;
  decision: string;
  reasoning: string;
  alternatives?: string[];
  tradeoffs?: string[];
  context: string;
  tags: string[];
  confidence: number;
  sourceMessageIndices: number[];
}

/**
 * A coding standard or guideline extracted from a conversation
 */
export interface ExtractedStandard {
  id: string;
  category: string;
  rule: string;
  examples: string[];
  counterExamples?: string[];
  rationale?: string;
  tags: string[];
  confidence: number;
  sourceMessageIndices: number[];
}

/**
 * A user preference or correction extracted from a conversation
 */
export interface ExtractedPreference {
  id: string;
  aspect: string;
  preference: string;
  correction?: string;
  context: string;
  confidence: number;
  sourceMessageIndices: number[];
}

/**
 * An entity with relationships extracted from content
 */
export interface ExtractedEntity {
  type: EntityType;
  name: string;
  description?: string;
  relationships: EntityRelationship[];
}

/**
 * A relationship between entities
 */
export interface EntityRelationship {
  targetEntity: string;
  relationshipType: string;
  strength: number;
}

/**
 * Code change with before/after states
 */
export interface CodeChange {
  filename?: string;
  language: string;
  before?: string;
  after: string;
  explanation?: string;
}

/**
 * Configuration for knowledge extraction
 */
export interface ExtractionConfig {
  extractSolutions: boolean;
  extractPatterns: boolean;
  extractDecisions: boolean;
  extractStandards: boolean;
  extractPreferences: boolean;
  minConfidence: number;
  maxItemsPerType: number;
}

/**
 * Default extraction configuration
 */
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  extractSolutions: true,
  extractPatterns: true,
  extractDecisions: true,
  extractStandards: true,
  extractPreferences: true,
  minConfidence: 0.6,
  maxItemsPerType: 10,
};

/**
 * Result of a batch extraction operation
 */
export interface ExtractionBatchResult {
  conversationsProcessed: number;
  totalSolutions: number;
  totalPatterns: number;
  totalDecisions: number;
  totalStandards: number;
  totalPreferences: number;
  errors: Array<{
    conversationId: string;
    error: string;
  }>;
}

/**
 * LLM response schema for extraction (used in prompts)
 */
export interface LLMExtractionResponse {
  solutions?: Array<{
    problem: string;
    errorMessage?: string;
    solution: string;
    codeChanges?: Array<{
      filename?: string;
      language: string;
      before?: string;
      after: string;
      explanation?: string;
    }>;
    filesAffected?: string[];
    tags?: string[];
    confidence: number;
  }>;
  
  patterns?: Array<{
    name: string;
    description: string;
    useCase: string;
    implementation: string;
    language: string;
    relatedPatterns?: string[];
    tags?: string[];
    confidence: number;
  }>;
  
  decisions?: Array<{
    topic: string;
    decision: string;
    reasoning: string;
    alternatives?: string[];
    tradeoffs?: string[];
    context: string;
    tags?: string[];
    confidence: number;
  }>;
  
  standards?: Array<{
    category: string;
    rule: string;
    examples?: string[];
    counterExamples?: string[];
    rationale?: string;
    tags?: string[];
    confidence: number;
  }>;
  
  preferences?: Array<{
    aspect: string;
    preference: string;
    correction?: string;
    context: string;
    confidence: number;
  }>;
  
  entities?: Array<{
    type: string;
    name: string;
    description?: string;
    relationships?: Array<{
      targetEntity: string;
      relationshipType: string;
      strength: number;
    }>;
  }>;
}

/**
 * Helper function to create empty extracted knowledge
 */
export function createEmptyExtractedKnowledge(conversationId: string): ExtractedKnowledge {
  return {
    conversationId,
    extractedAt: new Date(),
    solutions: [],
    patterns: [],
    decisions: [],
    standards: [],
    preferences: [],
    entities: [],
  };
}

/**
 * Helper to validate confidence score is within bounds
 */
export function normalizeConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Helper to filter items by minimum confidence
 */
export function filterByConfidence<T extends { confidence: number }>(
  items: T[],
  minConfidence: number
): T[] {
  return items.filter(item => item.confidence >= minConfidence);
}

/**
 * Count total extracted items
 */
export function countExtractedItems(knowledge: ExtractedKnowledge): number {
  return (
    knowledge.solutions.length +
    knowledge.patterns.length +
    knowledge.decisions.length +
    knowledge.standards.length +
    knowledge.preferences.length
  );
}
