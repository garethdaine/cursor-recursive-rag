import { randomUUID } from 'crypto';
import type { VectorDocument } from '../types/index.js';
import type { Embedder } from '../adapters/embeddings/index.js';
import type { 
  ExtractedKnowledge,
  ExtractedSolution,
  ExtractedPattern,
  ExtractedDecision,
  ExtractedStandard,
  ExtractedPreference,
} from '../types/extractedKnowledge.js';
import { ChunkType, RelationshipType, type EntityTag } from '../types/memory.js';
import { EnhancedVectorStore } from './enhancedVectorStore.js';
import { getMemoryMetadataStore, type MemoryMetadataStore } from './memoryMetadataStore.js';

/**
 * Result of storing extracted knowledge
 */
export interface KnowledgeStorageResult {
  conversationId: string;
  chunksCreated: number;
  relationshipsCreated: number;
  solutionChunks: string[];
  patternChunks: string[];
  decisionChunks: string[];
  standardChunks: string[];
  preferenceChunks: string[];
}

/**
 * Options for knowledge storage
 */
export interface KnowledgeStorageOptions {
  createRelationships?: boolean;
  minImportance?: number;
}

const DEFAULT_OPTIONS: KnowledgeStorageOptions = {
  createRelationships: true,
  minImportance: 0.5,
};

/**
 * Stores extracted knowledge as searchable chunks with relationships
 */
export class KnowledgeStorageService {
  private vectorStore: EnhancedVectorStore;
  private embedder: Embedder;
  private metadataStore: MemoryMetadataStore;
  private options: KnowledgeStorageOptions;

  constructor(
    vectorStore: EnhancedVectorStore,
    embedder: Embedder,
    options?: KnowledgeStorageOptions
  ) {
    this.vectorStore = vectorStore;
    this.embedder = embedder;
    this.metadataStore = vectorStore.getMetadataStore();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Store all extracted knowledge from a conversation
   */
  async store(knowledge: ExtractedKnowledge): Promise<KnowledgeStorageResult> {
    const result: KnowledgeStorageResult = {
      conversationId: knowledge.conversationId,
      chunksCreated: 0,
      relationshipsCreated: 0,
      solutionChunks: [],
      patternChunks: [],
      decisionChunks: [],
      standardChunks: [],
      preferenceChunks: [],
    };

    const allDocuments: VectorDocument[] = [];

    for (const solution of knowledge.solutions) {
      const doc = await this.createSolutionDocument(solution, knowledge.conversationId);
      allDocuments.push(doc);
      result.solutionChunks.push(doc.id);
    }

    for (const pattern of knowledge.patterns) {
      const doc = await this.createPatternDocument(pattern, knowledge.conversationId);
      allDocuments.push(doc);
      result.patternChunks.push(doc.id);
    }

    for (const decision of knowledge.decisions) {
      const doc = await this.createDecisionDocument(decision, knowledge.conversationId);
      allDocuments.push(doc);
      result.decisionChunks.push(doc.id);
    }

    for (const standard of knowledge.standards) {
      const doc = await this.createStandardDocument(standard, knowledge.conversationId);
      allDocuments.push(doc);
      result.standardChunks.push(doc.id);
    }

    for (const preference of knowledge.preferences) {
      const doc = await this.createPreferenceDocument(preference, knowledge.conversationId);
      allDocuments.push(doc);
      result.preferenceChunks.push(doc.id);
    }

    if (allDocuments.length > 0) {
      await this.vectorStore.add(allDocuments);
      result.chunksCreated = allDocuments.length;
    }

    if (this.options.createRelationships) {
      result.relationshipsCreated = this.createRelationships(result, knowledge);
    }

    return result;
  }

  /**
   * Create a document from a solution
   */
  private async createSolutionDocument(
    solution: ExtractedSolution, 
    conversationId: string
  ): Promise<VectorDocument> {
    const content = this.formatSolutionContent(solution);
    const embedding = await this.embedder.embed(content);
    
    return {
      id: `know-${solution.id}`,
      content,
      embedding,
      metadata: {
        source: `cursor-chat:${conversationId}`,
        chunkType: ChunkType.SOLUTION,
        importance: this.calculateSolutionImportance(solution),
        knowledgeType: 'solution',
        problem: solution.problem,
        errorMessage: solution.errorMessage,
        tags: solution.tags,
        filesAffected: solution.filesAffected,
        confidence: solution.confidence,
        sourceConversationId: conversationId,
        sourceMessageIndices: solution.sourceMessageIndices,
      },
    };
  }

  /**
   * Create a document from a pattern
   */
  private async createPatternDocument(
    pattern: ExtractedPattern, 
    conversationId: string
  ): Promise<VectorDocument> {
    const content = this.formatPatternContent(pattern);
    const embedding = await this.embedder.embed(content);
    
    return {
      id: `know-${pattern.id}`,
      content,
      embedding,
      metadata: {
        source: `cursor-chat:${conversationId}`,
        chunkType: ChunkType.PATTERN,
        importance: this.calculatePatternImportance(pattern),
        knowledgeType: 'pattern',
        name: pattern.name,
        language: pattern.language,
        tags: pattern.tags,
        relatedPatterns: pattern.relatedPatterns,
        confidence: pattern.confidence,
        sourceConversationId: conversationId,
        sourceMessageIndices: pattern.sourceMessageIndices,
      },
    };
  }

  /**
   * Create a document from a decision
   */
  private async createDecisionDocument(
    decision: ExtractedDecision, 
    conversationId: string
  ): Promise<VectorDocument> {
    const content = this.formatDecisionContent(decision);
    const embedding = await this.embedder.embed(content);
    
    return {
      id: `know-${decision.id}`,
      content,
      embedding,
      metadata: {
        source: `cursor-chat:${conversationId}`,
        chunkType: ChunkType.DECISION,
        importance: this.calculateDecisionImportance(decision),
        knowledgeType: 'decision',
        topic: decision.topic,
        tags: decision.tags,
        hasAlternatives: !!decision.alternatives?.length,
        hasTradeoffs: !!decision.tradeoffs?.length,
        confidence: decision.confidence,
        sourceConversationId: conversationId,
        sourceMessageIndices: decision.sourceMessageIndices,
      },
    };
  }

  /**
   * Create a document from a standard
   */
  private async createStandardDocument(
    standard: ExtractedStandard, 
    conversationId: string
  ): Promise<VectorDocument> {
    const content = this.formatStandardContent(standard);
    const embedding = await this.embedder.embed(content);
    
    return {
      id: `know-${standard.id}`,
      content,
      embedding,
      metadata: {
        source: `cursor-chat:${conversationId}`,
        chunkType: ChunkType.STANDARD,
        importance: this.calculateStandardImportance(standard),
        knowledgeType: 'standard',
        category: standard.category,
        tags: standard.tags,
        hasExamples: standard.examples.length > 0,
        hasCounterExamples: !!standard.counterExamples?.length,
        confidence: standard.confidence,
        sourceConversationId: conversationId,
        sourceMessageIndices: standard.sourceMessageIndices,
      },
    };
  }

  /**
   * Create a document from a preference
   */
  private async createPreferenceDocument(
    preference: ExtractedPreference, 
    conversationId: string
  ): Promise<VectorDocument> {
    const content = this.formatPreferenceContent(preference);
    const embedding = await this.embedder.embed(content);
    
    return {
      id: `know-${preference.id}`,
      content,
      embedding,
      metadata: {
        source: `cursor-chat:${conversationId}`,
        chunkType: ChunkType.PREFERENCE,
        importance: 0.7,
        knowledgeType: 'preference',
        aspect: preference.aspect,
        hasCorrection: !!preference.correction,
        confidence: preference.confidence,
        sourceConversationId: conversationId,
        sourceMessageIndices: preference.sourceMessageIndices,
      },
    };
  }

  /**
   * Format solution as readable content
   */
  private formatSolutionContent(solution: ExtractedSolution): string {
    const parts: string[] = [];
    
    parts.push(`# Problem\n${solution.problem}`);
    
    if (solution.errorMessage) {
      parts.push(`## Error\n\`\`\`\n${solution.errorMessage}\n\`\`\``);
    }
    
    parts.push(`## Solution\n${solution.solution}`);
    
    if (solution.codeChanges.length > 0) {
      const codeSection = solution.codeChanges.map(cc => {
        let code = '';
        if (cc.before) {
          code += `Before:\n\`\`\`${cc.language}\n${cc.before}\n\`\`\`\n\n`;
        }
        code += `After:\n\`\`\`${cc.language}\n${cc.after}\n\`\`\``;
        if (cc.explanation) {
          code += `\n\n${cc.explanation}`;
        }
        return code;
      }).join('\n\n');
      parts.push(`## Code Changes\n${codeSection}`);
    }
    
    if (solution.filesAffected.length > 0) {
      parts.push(`## Files\n${solution.filesAffected.join(', ')}`);
    }
    
    if (solution.tags.length > 0) {
      parts.push(`## Tags\n${solution.tags.join(', ')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Format pattern as readable content
   */
  private formatPatternContent(pattern: ExtractedPattern): string {
    const parts: string[] = [];
    
    parts.push(`# ${pattern.name}`);
    parts.push(`## Description\n${pattern.description}`);
    parts.push(`## Use Case\n${pattern.useCase}`);
    parts.push(`## Implementation\n\`\`\`${pattern.language}\n${pattern.implementation}\n\`\`\``);
    
    if (pattern.relatedPatterns.length > 0) {
      parts.push(`## Related Patterns\n${pattern.relatedPatterns.join(', ')}`);
    }
    
    if (pattern.tags.length > 0) {
      parts.push(`## Tags\n${pattern.tags.join(', ')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Format decision as readable content
   */
  private formatDecisionContent(decision: ExtractedDecision): string {
    const parts: string[] = [];
    
    parts.push(`# Decision: ${decision.topic}`);
    parts.push(`## Decision\n${decision.decision}`);
    parts.push(`## Reasoning\n${decision.reasoning}`);
    
    if (decision.alternatives?.length) {
      parts.push(`## Alternatives Considered\n${decision.alternatives.map(a => `- ${a}`).join('\n')}`);
    }
    
    if (decision.tradeoffs?.length) {
      parts.push(`## Tradeoffs\n${decision.tradeoffs.map(t => `- ${t}`).join('\n')}`);
    }
    
    parts.push(`## Context\n${decision.context}`);
    
    if (decision.tags.length > 0) {
      parts.push(`## Tags\n${decision.tags.join(', ')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Format standard as readable content
   */
  private formatStandardContent(standard: ExtractedStandard): string {
    const parts: string[] = [];
    
    parts.push(`# Standard: ${standard.category}`);
    parts.push(`## Rule\n${standard.rule}`);
    
    if (standard.examples.length > 0) {
      parts.push(`## Examples\n${standard.examples.map(e => `- ${e}`).join('\n')}`);
    }
    
    if (standard.counterExamples?.length) {
      parts.push(`## Counter-Examples (Don't Do)\n${standard.counterExamples.map(e => `- ${e}`).join('\n')}`);
    }
    
    if (standard.rationale) {
      parts.push(`## Rationale\n${standard.rationale}`);
    }
    
    if (standard.tags.length > 0) {
      parts.push(`## Tags\n${standard.tags.join(', ')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Format preference as readable content
   */
  private formatPreferenceContent(preference: ExtractedPreference): string {
    const parts: string[] = [];
    
    parts.push(`# Preference: ${preference.aspect}`);
    parts.push(`## Preferred Approach\n${preference.preference}`);
    
    if (preference.correction) {
      parts.push(`## Correction\n${preference.correction}`);
    }
    
    parts.push(`## Context\n${preference.context}`);
    
    return parts.join('\n\n');
  }

  /**
   * Calculate importance score for a solution
   */
  private calculateSolutionImportance(solution: ExtractedSolution): number {
    let importance = 0.6;
    
    if (solution.errorMessage) importance += 0.1;
    if (solution.codeChanges.length > 0) importance += 0.1;
    if (solution.filesAffected.length > 0) importance += 0.05;
    if (solution.confidence > 0.8) importance += 0.1;
    
    return Math.min(1.0, importance);
  }

  /**
   * Calculate importance score for a pattern
   */
  private calculatePatternImportance(pattern: ExtractedPattern): number {
    let importance = 0.65;
    
    if (pattern.implementation.length > 200) importance += 0.1;
    if (pattern.relatedPatterns.length > 0) importance += 0.05;
    if (pattern.confidence > 0.8) importance += 0.1;
    
    return Math.min(1.0, importance);
  }

  /**
   * Calculate importance score for a decision
   */
  private calculateDecisionImportance(decision: ExtractedDecision): number {
    let importance = 0.7;
    
    if (decision.alternatives?.length) importance += 0.1;
    if (decision.tradeoffs?.length) importance += 0.05;
    if (decision.confidence > 0.8) importance += 0.1;
    
    return Math.min(1.0, importance);
  }

  /**
   * Calculate importance score for a standard
   */
  private calculateStandardImportance(standard: ExtractedStandard): number {
    let importance = 0.75;
    
    if (standard.examples.length > 1) importance += 0.1;
    if (standard.counterExamples?.length) importance += 0.05;
    if (standard.confidence > 0.8) importance += 0.05;
    
    return Math.min(1.0, importance);
  }

  /**
   * Create relationships between knowledge chunks
   */
  private createRelationships(
    result: KnowledgeStorageResult, 
    knowledge: ExtractedKnowledge
  ): number {
    let count = 0;

    for (let i = 0; i < result.patternChunks.length; i++) {
      const pattern = knowledge.patterns[i];
      
      for (const relatedName of pattern.relatedPatterns) {
        const relatedIdx = knowledge.patterns.findIndex(p => p.name === relatedName);
        if (relatedIdx >= 0 && relatedIdx !== i) {
          this.metadataStore.addRelationship(
            result.patternChunks[i],
            result.patternChunks[relatedIdx],
            RelationshipType.RELATES_TO,
            0.7
          );
          count++;
        }
      }
    }

    for (const solutionId of result.solutionChunks) {
      for (const patternId of result.patternChunks) {
        const solutionMeta = this.metadataStore.getChunkMetadata(solutionId);
        const patternMeta = this.metadataStore.getChunkMetadata(patternId);
        
        if (solutionMeta && patternMeta) {
          this.metadataStore.addRelationship(
            solutionId,
            patternId,
            RelationshipType.IMPLEMENTS,
            0.5
          );
          count++;
        }
      }
    }

    return count;
  }
}

/**
 * Create a knowledge storage service
 */
export function createKnowledgeStorageService(
  vectorStore: EnhancedVectorStore,
  embedder: Embedder,
  options?: KnowledgeStorageOptions
): KnowledgeStorageService {
  return new KnowledgeStorageService(vectorStore, embedder, options);
}
