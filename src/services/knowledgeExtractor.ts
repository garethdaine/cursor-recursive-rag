import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import type { RAGConfig } from '../types/index.js';
import type { Conversation, ChatMessage } from './cursorChatReader.js';
import { 
  type ExtractedKnowledge,
  type ExtractedSolution,
  type ExtractedPattern,
  type ExtractedDecision,
  type ExtractedStandard,
  type ExtractedPreference,
  type ExtractedEntity,
  type ExtractionConfig,
  type LLMExtractionResponse,
  DEFAULT_EXTRACTION_CONFIG,
  createEmptyExtractedKnowledge,
  normalizeConfidence,
  filterByConfidence,
} from '../types/extractedKnowledge.js';
import { EntityType } from '../types/memory.js';

/**
 * LLM service interface for knowledge extraction
 */
interface LLMService {
  complete(prompt: string): Promise<string>;
}

/**
 * OpenAI LLM implementation
 */
class OpenAILLMService implements LLMService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are a knowledge extraction specialist. You analyze conversations and extract structured knowledge. Always respond with valid JSON.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    return response.choices[0]?.message?.content || '{}';
  }
}

/**
 * Heuristic-based fallback extractor (no LLM required)
 */
class HeuristicExtractor {
  extract(conversation: Conversation): ExtractedKnowledge {
    const knowledge = createEmptyExtractedKnowledge(conversation.id);
    
    for (let i = 0; i < conversation.messages.length - 1; i++) {
      const userMsg = conversation.messages[i];
      const assistantMsg = conversation.messages[i + 1];
      
      if (userMsg.type !== 1 || assistantMsg.type !== 2) continue;
      
      const userContent = userMsg.content.toLowerCase();
      const assistantContent = assistantMsg.content;
      
      if (this.isErrorQuestion(userContent)) {
        const solution = this.extractSolution(userMsg, assistantMsg, i);
        if (solution) knowledge.solutions.push(solution);
      }
      
      if (this.isDecisionQuestion(userContent)) {
        const decision = this.extractDecision(userMsg, assistantMsg, i);
        if (decision) knowledge.decisions.push(decision);
      }
      
      if (assistantMsg.codeBlocks.length > 0) {
        const pattern = this.extractPattern(userMsg, assistantMsg, i);
        if (pattern) knowledge.patterns.push(pattern);
      }
    }
    
    return knowledge;
  }
  
  private isErrorQuestion(content: string): boolean {
    return /\b(error|exception|fail|crash|bug|issue|problem|fix|not working)\b/i.test(content);
  }
  
  private isDecisionQuestion(content: string): boolean {
    return /\b(should i|which|best way|recommend|approach|decide|choice|option)\b/i.test(content);
  }
  
  private extractSolution(userMsg: ChatMessage, assistantMsg: ChatMessage, index: number): ExtractedSolution | null {
    if (!assistantMsg.content.trim()) return null;
    
    const errorMatch = userMsg.content.match(/(?:error|exception):\s*(.+?)(?:\n|$)/i);
    
    return {
      id: `sol-${randomUUID().substring(0, 8)}`,
      problem: userMsg.content.substring(0, 500),
      errorMessage: errorMatch?.[1],
      solution: assistantMsg.content.substring(0, 1000),
      codeChanges: assistantMsg.codeBlocks.map(cb => ({
        language: cb.language,
        after: cb.code,
        filename: cb.filename,
      })),
      filesAffected: [...assistantMsg.filesReferenced],
      tags: this.extractTags(userMsg.content + ' ' + assistantMsg.content),
      confidence: 0.6,
      sourceMessageIndices: [index, index + 1],
    };
  }
  
  private extractDecision(userMsg: ChatMessage, assistantMsg: ChatMessage, index: number): ExtractedDecision | null {
    if (!assistantMsg.content.trim()) return null;
    
    return {
      id: `dec-${randomUUID().substring(0, 8)}`,
      topic: userMsg.content.substring(0, 200),
      decision: assistantMsg.content.substring(0, 500),
      reasoning: this.extractReasoning(assistantMsg.content),
      context: userMsg.content.substring(0, 300),
      tags: this.extractTags(userMsg.content + ' ' + assistantMsg.content),
      confidence: 0.5,
      sourceMessageIndices: [index, index + 1],
    };
  }
  
  private extractPattern(userMsg: ChatMessage, assistantMsg: ChatMessage, index: number): ExtractedPattern | null {
    const codeBlock = assistantMsg.codeBlocks[0];
    if (!codeBlock || codeBlock.code.length < 50) return null;
    
    return {
      id: `pat-${randomUUID().substring(0, 8)}`,
      name: this.generatePatternName(userMsg.content),
      description: userMsg.content.substring(0, 200),
      useCase: userMsg.content.substring(0, 300),
      implementation: codeBlock.code,
      language: codeBlock.language,
      relatedPatterns: [],
      tags: this.extractTags(userMsg.content + ' ' + assistantMsg.content),
      confidence: 0.5,
      sourceMessageIndices: [index, index + 1],
    };
  }
  
  private extractReasoning(content: string): string {
    const reasoningPatterns = [
      /because\s+(.+?)(?:\.|$)/i,
      /the reason is\s+(.+?)(?:\.|$)/i,
      /this is because\s+(.+?)(?:\.|$)/i,
    ];
    
    for (const pattern of reasoningPatterns) {
      const match = content.match(pattern);
      if (match) return match[1].trim();
    }
    
    return content.substring(0, 200);
  }
  
  private generatePatternName(question: string): string {
    const words = question.split(/\s+/)
      .filter(w => w.length > 3 && !/^(how|what|can|the|this|that)$/i.test(w))
      .slice(0, 3);
    
    return words.length > 0 
      ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') + ' Pattern'
      : 'Code Pattern';
  }
  
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const patterns: Record<string, RegExp> = {
      typescript: /\btypescript\b/i,
      javascript: /\bjavascript\b/i,
      react: /\breact\b/i,
      vue: /\bvue\b/i,
      node: /\bnode\.?js\b/i,
      python: /\bpython\b/i,
      api: /\bapi\b/i,
      database: /\b(database|sql|postgres|mysql|mongo)\b/i,
      testing: /\b(test|jest|vitest|testing)\b/i,
      auth: /\b(auth|authentication|login|session)\b/i,
    };
    
    for (const [tag, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) tags.push(tag);
    }
    
    return tags;
  }
}

/**
 * Knowledge extractor that uses LLM to extract structured knowledge from conversations
 */
export class KnowledgeExtractor {
  private llm: LLMService | null = null;
  private config: ExtractionConfig;
  private heuristic: HeuristicExtractor;

  constructor(ragConfig: RAGConfig, extractionConfig?: Partial<ExtractionConfig>) {
    this.config = { ...DEFAULT_EXTRACTION_CONFIG, ...extractionConfig };
    this.heuristic = new HeuristicExtractor();
    
    if (ragConfig.apiKeys?.openai) {
      this.llm = new OpenAILLMService(ragConfig.apiKeys.openai);
    }
  }

  /**
   * Check if LLM extraction is available
   */
  isLLMAvailable(): boolean {
    return this.llm !== null;
  }

  /**
   * Extract knowledge from a conversation
   */
  async extract(conversation: Conversation): Promise<ExtractedKnowledge> {
    if (!this.llm) {
      return this.heuristic.extract(conversation);
    }

    try {
      return await this.extractWithLLM(conversation);
    } catch (error) {
      console.warn('LLM extraction failed, falling back to heuristics:', error);
      return this.heuristic.extract(conversation);
    }
  }

  /**
   * Extract knowledge using LLM
   */
  private async extractWithLLM(conversation: Conversation): Promise<ExtractedKnowledge> {
    const prompt = this.buildExtractionPrompt(conversation);
    const response = await this.llm!.complete(prompt);
    
    let parsed: LLMExtractionResponse;
    try {
      parsed = JSON.parse(response);
    } catch {
      console.warn('Failed to parse LLM response, falling back to heuristics');
      return this.heuristic.extract(conversation);
    }

    return this.parseExtractionResponse(parsed, conversation);
  }

  /**
   * Build the extraction prompt for the LLM
   */
  private buildExtractionPrompt(conversation: Conversation): string {
    const formattedConversation = this.formatConversation(conversation);
    
    const enabledTypes: string[] = [];
    if (this.config.extractSolutions) enabledTypes.push('solutions');
    if (this.config.extractPatterns) enabledTypes.push('patterns');
    if (this.config.extractDecisions) enabledTypes.push('decisions');
    if (this.config.extractStandards) enabledTypes.push('standards');
    if (this.config.extractPreferences) enabledTypes.push('preferences');

    return `Analyze this Cursor IDE conversation and extract structured knowledge.

## Conversation
${formattedConversation}

## Instructions
Extract the following types of knowledge: ${enabledTypes.join(', ')}

For each item, provide a confidence score between 0 and 1.
Only include items with confidence >= ${this.config.minConfidence}.
Maximum ${this.config.maxItemsPerType} items per type.

## Response Format (JSON)
{
  "solutions": [{
    "problem": "description of the problem",
    "errorMessage": "specific error if any",
    "solution": "how it was solved",
    "codeChanges": [{"language": "ts", "before": "old code", "after": "new code", "explanation": "why"}],
    "filesAffected": ["path/to/file.ts"],
    "tags": ["typescript", "api"],
    "confidence": 0.9
  }],
  "patterns": [{
    "name": "Pattern Name",
    "description": "what it does",
    "useCase": "when to use it",
    "implementation": "code example",
    "language": "typescript",
    "relatedPatterns": [],
    "tags": ["react", "hooks"],
    "confidence": 0.85
  }],
  "decisions": [{
    "topic": "what was decided",
    "decision": "the actual decision",
    "reasoning": "why this was chosen",
    "alternatives": ["other options"],
    "tradeoffs": ["known tradeoffs"],
    "context": "surrounding context",
    "tags": ["architecture"],
    "confidence": 0.8
  }],
  "standards": [{
    "category": "naming",
    "rule": "the standard",
    "examples": ["good examples"],
    "counterExamples": ["bad examples"],
    "rationale": "why this standard",
    "tags": ["code-style"],
    "confidence": 0.75
  }],
  "preferences": [{
    "aspect": "what aspect",
    "preference": "preferred way",
    "correction": "what was corrected",
    "context": "when this applies",
    "confidence": 0.7
  }],
  "entities": [{
    "type": "framework",
    "name": "React",
    "description": "UI library",
    "relationships": [{"targetEntity": "TypeScript", "relationshipType": "used_with", "strength": 0.9}]
  }]
}

Return only valid JSON. Omit empty arrays.`;
  }

  /**
   * Format conversation for LLM prompt
   */
  private formatConversation(conversation: Conversation): string {
    const parts: string[] = [];
    
    for (let i = 0; i < Math.min(conversation.messages.length, 20); i++) {
      const msg = conversation.messages[i];
      const role = msg.type === 1 ? 'User' : 'Assistant';
      const content = msg.content.substring(0, 2000);
      
      parts.push(`[${role}]:\n${content}`);
      
      if (msg.codeBlocks.length > 0) {
        const codeBlocks = msg.codeBlocks.slice(0, 3)
          .map(cb => `\`\`\`${cb.language}\n${cb.code.substring(0, 1000)}\n\`\`\``)
          .join('\n');
        parts.push(`[Code]:\n${codeBlocks}`);
      }
    }
    
    return parts.join('\n\n');
  }

  /**
   * Parse LLM response into ExtractedKnowledge
   */
  private parseExtractionResponse(
    response: LLMExtractionResponse, 
    conversation: Conversation
  ): ExtractedKnowledge {
    const knowledge = createEmptyExtractedKnowledge(conversation.id);

    if (response.solutions && this.config.extractSolutions) {
      knowledge.solutions = response.solutions
        .slice(0, this.config.maxItemsPerType)
        .map(s => ({
          id: `sol-${randomUUID().substring(0, 8)}`,
          problem: s.problem,
          errorMessage: s.errorMessage,
          solution: s.solution,
          codeChanges: s.codeChanges || [],
          filesAffected: s.filesAffected || [],
          tags: s.tags || [],
          confidence: normalizeConfidence(s.confidence),
          sourceMessageIndices: [],
        }));
      knowledge.solutions = filterByConfidence(knowledge.solutions, this.config.minConfidence);
    }

    if (response.patterns && this.config.extractPatterns) {
      knowledge.patterns = response.patterns
        .slice(0, this.config.maxItemsPerType)
        .map(p => ({
          id: `pat-${randomUUID().substring(0, 8)}`,
          name: p.name,
          description: p.description,
          useCase: p.useCase,
          implementation: p.implementation,
          language: p.language,
          relatedPatterns: p.relatedPatterns || [],
          tags: p.tags || [],
          confidence: normalizeConfidence(p.confidence),
          sourceMessageIndices: [],
        }));
      knowledge.patterns = filterByConfidence(knowledge.patterns, this.config.minConfidence);
    }

    if (response.decisions && this.config.extractDecisions) {
      knowledge.decisions = response.decisions
        .slice(0, this.config.maxItemsPerType)
        .map(d => ({
          id: `dec-${randomUUID().substring(0, 8)}`,
          topic: d.topic,
          decision: d.decision,
          reasoning: d.reasoning,
          alternatives: d.alternatives,
          tradeoffs: d.tradeoffs,
          context: d.context,
          tags: d.tags || [],
          confidence: normalizeConfidence(d.confidence),
          sourceMessageIndices: [],
        }));
      knowledge.decisions = filterByConfidence(knowledge.decisions, this.config.minConfidence);
    }

    if (response.standards && this.config.extractStandards) {
      knowledge.standards = response.standards
        .slice(0, this.config.maxItemsPerType)
        .map(s => ({
          id: `std-${randomUUID().substring(0, 8)}`,
          category: s.category,
          rule: s.rule,
          examples: s.examples || [],
          counterExamples: s.counterExamples,
          rationale: s.rationale,
          tags: s.tags || [],
          confidence: normalizeConfidence(s.confidence),
          sourceMessageIndices: [],
        }));
      knowledge.standards = filterByConfidence(knowledge.standards, this.config.minConfidence);
    }

    if (response.preferences && this.config.extractPreferences) {
      knowledge.preferences = response.preferences
        .slice(0, this.config.maxItemsPerType)
        .map(p => ({
          id: `pref-${randomUUID().substring(0, 8)}`,
          aspect: p.aspect,
          preference: p.preference,
          correction: p.correction,
          context: p.context,
          confidence: normalizeConfidence(p.confidence),
          sourceMessageIndices: [],
        }));
      knowledge.preferences = filterByConfidence(knowledge.preferences, this.config.minConfidence);
    }

    if (response.entities) {
      knowledge.entities = response.entities
        .slice(0, 20)
        .map(e => ({
          type: this.parseEntityType(e.type),
          name: e.name,
          description: e.description,
          relationships: e.relationships || [],
        }));
    }

    return knowledge;
  }

  /**
   * Parse entity type string to EntityType enum
   */
  private parseEntityType(type: string): EntityType {
    const typeMap: Record<string, EntityType> = {
      tool: EntityType.TOOL,
      language: EntityType.LANGUAGE,
      framework: EntityType.FRAMEWORK,
      concept: EntityType.CONCEPT,
      project: EntityType.PROJECT,
      person: EntityType.PERSON,
      file: EntityType.FILE,
      component: EntityType.COMPONENT,
    };
    return typeMap[type.toLowerCase()] || EntityType.CONCEPT;
  }
}

/**
 * Create a knowledge extractor instance
 */
export function createKnowledgeExtractor(
  config: RAGConfig,
  extractionConfig?: Partial<ExtractionConfig>
): KnowledgeExtractor {
  return new KnowledgeExtractor(config, extractionConfig);
}
