/**
 * RLM Safeguards - Anti-Pattern Mitigations
 * 
 * Based on the Recursive Language Models paper's Negative Results (Appendix A),
 * this service implements safeguards to prevent common anti-patterns:
 * 
 * 1. Model-specific configurations (not one-size-fits-all)
 * 2. Capability detection for code execution ability
 * 3. Token budget management (reserve for answers)
 * 4. Multi-signal termination detection (not just tags)
 * 5. Sub-call throttling and caching
 * 6. Circuit breaker for runaway trajectories
 * 7. Model prior-based pre-filtering
 */

import type { EnhancedChunk } from '../types/memory.js';
import type { LLMService } from './contextEnvironment.js';
import { createHash } from 'crypto';

export type CodeExecutionCapability = 'excellent' | 'good' | 'limited' | 'none';
export type RetrievalStrategy = 'direct' | 'iterative' | 'recursive';
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface ModelCapabilities {
  codeExecution: CodeExecutionCapability;
  contextWindow: number;
  outputTokens: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
}

export interface ModelConfig {
  maxSubCalls: number;
  maxIterations: number;
  warnOnExcessiveCalls: boolean;
  costMultiplier: number;
  requiresExtraWarnings: boolean;
  preferredChunkSize: number;
}

export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  codeExecution: 'good',
  contextWindow: 128000,
  outputTokens: 4096,
  supportsStreaming: true,
  supportsToolUse: true,
};

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-4': {
    maxSubCalls: 100,
    maxIterations: 20,
    warnOnExcessiveCalls: false,
    costMultiplier: 1.0,
    requiresExtraWarnings: false,
    preferredChunkSize: 10,
  },
  'gpt-4o': {
    maxSubCalls: 100,
    maxIterations: 20,
    warnOnExcessiveCalls: false,
    costMultiplier: 0.5,
    requiresExtraWarnings: false,
    preferredChunkSize: 15,
  },
  'gpt-4o-mini': {
    maxSubCalls: 80,
    maxIterations: 15,
    warnOnExcessiveCalls: false,
    costMultiplier: 0.1,
    requiresExtraWarnings: false,
    preferredChunkSize: 12,
  },
  'claude-3-opus': {
    maxSubCalls: 100,
    maxIterations: 20,
    warnOnExcessiveCalls: false,
    costMultiplier: 1.5,
    requiresExtraWarnings: false,
    preferredChunkSize: 10,
  },
  'claude-3-sonnet': {
    maxSubCalls: 80,
    maxIterations: 15,
    warnOnExcessiveCalls: false,
    costMultiplier: 0.3,
    requiresExtraWarnings: false,
    preferredChunkSize: 12,
  },
  'claude-3-haiku': {
    maxSubCalls: 60,
    maxIterations: 12,
    warnOnExcessiveCalls: true,
    costMultiplier: 0.05,
    requiresExtraWarnings: false,
    preferredChunkSize: 8,
  },
  'qwen': {
    maxSubCalls: 50,
    maxIterations: 10,
    warnOnExcessiveCalls: true,
    costMultiplier: 0.2,
    requiresExtraWarnings: true,
    preferredChunkSize: 8,
  },
  'llama': {
    maxSubCalls: 40,
    maxIterations: 8,
    warnOnExcessiveCalls: true,
    costMultiplier: 0.1,
    requiresExtraWarnings: true,
    preferredChunkSize: 6,
  },
  'local': {
    maxSubCalls: 20,
    maxIterations: 5,
    warnOnExcessiveCalls: true,
    costMultiplier: 0.01,
    requiresExtraWarnings: true,
    preferredChunkSize: 5,
  },
  'default': {
    maxSubCalls: 50,
    maxIterations: 10,
    warnOnExcessiveCalls: true,
    costMultiplier: 0.5,
    requiresExtraWarnings: false,
    preferredChunkSize: 10,
  },
};

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'gpt-4': {
    codeExecution: 'excellent',
    contextWindow: 128000,
    outputTokens: 4096,
    supportsStreaming: true,
    supportsToolUse: true,
  },
  'gpt-4o': {
    codeExecution: 'excellent',
    contextWindow: 128000,
    outputTokens: 4096,
    supportsStreaming: true,
    supportsToolUse: true,
  },
  'gpt-4o-mini': {
    codeExecution: 'good',
    contextWindow: 128000,
    outputTokens: 4096,
    supportsStreaming: true,
    supportsToolUse: true,
  },
  'claude-3-opus': {
    codeExecution: 'excellent',
    contextWindow: 200000,
    outputTokens: 4096,
    supportsStreaming: true,
    supportsToolUse: true,
  },
  'claude-3-sonnet': {
    codeExecution: 'excellent',
    contextWindow: 200000,
    outputTokens: 4096,
    supportsStreaming: true,
    supportsToolUse: true,
  },
  'claude-3-haiku': {
    codeExecution: 'good',
    contextWindow: 200000,
    outputTokens: 4096,
    supportsStreaming: true,
    supportsToolUse: true,
  },
  'qwen': {
    codeExecution: 'good',
    contextWindow: 32000,
    outputTokens: 2048,
    supportsStreaming: true,
    supportsToolUse: false,
  },
  'llama': {
    codeExecution: 'limited',
    contextWindow: 8192,
    outputTokens: 2048,
    supportsStreaming: true,
    supportsToolUse: false,
  },
  'local': {
    codeExecution: 'limited',
    contextWindow: 4096,
    outputTokens: 1024,
    supportsStreaming: false,
    supportsToolUse: false,
  },
};

export interface TokenBudget {
  totalOutputTokens: number;
  reservedForAnswer: number;
  maxThinkingTokens: number;
  currentUsed: number;
}

export interface TerminationSignals {
  explicitTag: boolean;
  confidenceStatement: boolean;
  noMoreActions: boolean;
  answerValidation: boolean;
  iterationLimitReached: boolean;
  budgetExhausted: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  confidence?: number;
}

/**
 * Get model configuration, with fallback to default
 */
export function getModelConfig(modelName: string): ModelConfig {
  // Normalize model name
  const normalized = modelName.toLowerCase();
  
  // Find matching config
  for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
    if (normalized.includes(key)) {
      return config;
    }
  }
  
  return MODEL_CONFIGS['default'];
}

/**
 * Get model capabilities, with fallback to default
 */
export function getModelCapabilities(modelName: string): ModelCapabilities {
  const normalized = modelName.toLowerCase();
  
  for (const [key, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
    if (normalized.includes(key)) {
      return capabilities;
    }
  }
  
  return DEFAULT_MODEL_CAPABILITIES;
}

/**
 * Choose retrieval strategy based on model capabilities and query complexity
 */
export function chooseRetrievalStrategy(
  capabilities: ModelCapabilities,
  queryComplexity: 'simple' | 'moderate' | 'complex'
): RetrievalStrategy {
  // Models without coding ability can't use recursive REPL approach
  if (capabilities.codeExecution === 'none' || capabilities.codeExecution === 'limited') {
    return queryComplexity === 'simple' ? 'direct' : 'iterative';
  }
  
  // Good code execution - use iterative for moderate, recursive for complex
  if (capabilities.codeExecution === 'good') {
    if (queryComplexity === 'simple') return 'direct';
    if (queryComplexity === 'moderate') return 'iterative';
    return 'recursive';
  }
  
  // Excellent code execution - use recursive for anything complex
  if (queryComplexity === 'simple') return 'direct';
  return 'recursive';
}

/**
 * Token Budget Manager
 * Reserves output tokens for final answers to prevent running out
 */
export class TokenBudgetManager {
  private budget: TokenBudget;

  constructor(modelName: string, reserveRatio: number = 0.25) {
    const capabilities = getModelCapabilities(modelName);
    const reserved = Math.floor(capabilities.outputTokens * reserveRatio);
    
    this.budget = {
      totalOutputTokens: capabilities.outputTokens,
      reservedForAnswer: reserved,
      maxThinkingTokens: capabilities.outputTokens - reserved,
      currentUsed: 0,
    };
  }

  canUseTokens(count: number): boolean {
    return this.budget.currentUsed + count <= this.budget.maxThinkingTokens;
  }

  useTokens(count: number): void {
    this.budget.currentUsed += count;
  }

  getRemainingThinkingTokens(): number {
    return this.budget.maxThinkingTokens - this.budget.currentUsed;
  }

  getReservedForAnswer(): number {
    return this.budget.reservedForAnswer;
  }

  getBudget(): TokenBudget {
    return { ...this.budget };
  }

  reset(): void {
    this.budget.currentUsed = 0;
  }
}

/**
 * Multi-Signal Termination Detector
 * Uses multiple signals to determine when to terminate, not just tags
 */
export class TerminationDetector {
  private signals: TerminationSignals;
  private requiredSignals: number;

  constructor(requiredSignals: number = 2) {
    this.requiredSignals = requiredSignals;
    this.signals = {
      explicitTag: false,
      confidenceStatement: false,
      noMoreActions: false,
      answerValidation: false,
      iterationLimitReached: false,
      budgetExhausted: false,
    };
  }

  /**
   * Check if response contains explicit termination tags
   */
  checkExplicitTag(response: string): boolean {
    const patterns = [
      /\bFINAL\s*\(/i,
      /\bFINAL_VAR\s*\(/i,
      /\bANSWER\s*:/i,
      /"type"\s*:\s*"answer"/i,
    ];
    
    this.signals.explicitTag = patterns.some(p => p.test(response));
    return this.signals.explicitTag;
  }

  /**
   * Check if response expresses confidence in the answer
   */
  checkConfidenceStatement(response: string): boolean {
    const patterns = [
      /\b(I am confident|I believe|The answer is|Based on the context)/i,
      /\b(sufficient information|enough information|can conclude)/i,
      /\b(definitively|conclusively|clearly shows)/i,
    ];
    
    this.signals.confidenceStatement = patterns.some(p => p.test(response));
    return this.signals.confidenceStatement;
  }

  /**
   * Check if response doesn't request more operations
   */
  checkNoMoreActions(response: string): boolean {
    const actionPatterns = [
      /"type"\s*:\s*"(peek|filter|chunk|subQuery|search)"/i,
      /\b(let me|I will|I need to|next I should)\b/i,
      /\b(examine|investigate|look at|check)\b.*\b(more|further|additional)\b/i,
    ];
    
    this.signals.noMoreActions = !actionPatterns.some(p => p.test(response));
    return this.signals.noMoreActions;
  }

  /**
   * Validate that answer is actually an answer, not a plan
   */
  validateAnswer(answer: string, query: string): ValidationResult {
    // Check answer isn't just a plan/thought
    const planPatterns = [
      /^(I will|Let me|I should|I need to|First,|Next,|Then,)/i,
      /^(To answer this|To find out|To determine)/i,
      /^(Looking at|Examining|Checking)/i,
    ];
    
    if (planPatterns.some(p => p.test(answer.trim()))) {
      this.signals.answerValidation = false;
      return { valid: false, reason: 'Answer appears to be a plan, not a result' };
    }

    // Check answer isn't too short
    if (answer.trim().length < 20) {
      this.signals.answerValidation = false;
      return { valid: false, reason: 'Answer is too short to be meaningful' };
    }

    // Check answer contains some substance
    const hasSubstance = answer.match(/\b(is|are|was|were|can|could|should|would|found|discovered|determined)\b/i);
    if (!hasSubstance) {
      this.signals.answerValidation = false;
      return { valid: false, reason: 'Answer lacks conclusive statements' };
    }

    this.signals.answerValidation = true;
    return { valid: true, confidence: 0.8 };
  }

  /**
   * Set iteration limit reached
   */
  setIterationLimitReached(): void {
    this.signals.iterationLimitReached = true;
  }

  /**
   * Set budget exhausted
   */
  setBudgetExhausted(): void {
    this.signals.budgetExhausted = true;
  }

  /**
   * Check if we should terminate based on multiple signals
   */
  shouldTerminate(): { terminate: boolean; reason: string; confidence: number } {
    // Forced termination conditions
    if (this.signals.iterationLimitReached) {
      return { terminate: true, reason: 'Iteration limit reached', confidence: 1.0 };
    }
    
    if (this.signals.budgetExhausted) {
      return { terminate: true, reason: 'Budget exhausted', confidence: 1.0 };
    }

    // Count positive signals
    const positiveSignals = [
      this.signals.explicitTag,
      this.signals.confidenceStatement,
      this.signals.noMoreActions,
      this.signals.answerValidation,
    ].filter(Boolean).length;

    if (positiveSignals >= this.requiredSignals) {
      return {
        terminate: true,
        reason: `${positiveSignals} termination signals detected`,
        confidence: positiveSignals / 4,
      };
    }

    return { terminate: false, reason: 'Insufficient termination signals', confidence: positiveSignals / 4 };
  }

  /**
   * Get current signals
   */
  getSignals(): TerminationSignals {
    return { ...this.signals };
  }

  /**
   * Reset signals
   */
  reset(): void {
    this.signals = {
      explicitTag: false,
      confidenceStatement: false,
      noMoreActions: false,
      answerValidation: false,
      iterationLimitReached: false,
      budgetExhausted: false,
    };
  }
}

/**
 * Circuit Breaker for runaway trajectories
 * Prevents excessive failures from consuming resources
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailure: Date | null = null;
  private state: CircuitBreakerState = 'closed';
  private threshold: number;
  private resetTimeMs: number;

  constructor(threshold: number = 3, resetTimeMs: number = 60000) {
    this.threshold = threshold;
    this.resetTimeMs = resetTimeMs;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (this.lastFailure && Date.now() - this.lastFailure.getTime() > this.resetTimeMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open - too many recent failures');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = new Date();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.failures = 0;
    this.lastFailure = null;
    this.state = 'closed';
  }
}

/**
 * Sub-Call Throttler with Caching
 * Prevents excessive sub-calls and caches results
 */
export class SubCallThrottler {
  private callCounts: Map<string, number> = new Map();
  private cache: Map<string, { result: string; timestamp: number }> = new Map();
  private maxCallsPerKey: number;
  private cacheTtlMs: number;

  constructor(maxCallsPerKey: number = 3, cacheTtlMs: number = 300000) {
    this.maxCallsPerKey = maxCallsPerKey;
    this.cacheTtlMs = cacheTtlMs;
  }

  async throttledCall(
    key: string,
    llm: LLMService,
    prompt: string,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    // Check cache first
    const cacheKey = this.hashPrompt(prompt);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.result;
    }

    // Check call count for this key
    const count = this.callCounts.get(key) ?? 0;
    if (count >= this.maxCallsPerKey) {
      throw new Error(`Maximum sub-calls (${this.maxCallsPerKey}) exceeded for key: ${key}`);
    }

    // Make the call
    this.callCounts.set(key, count + 1);
    
    const result = await llm.invoke(prompt, options);
    
    // Cache the result
    this.cache.set(cacheKey, { result, timestamp: Date.now() });
    
    return result;
  }

  private hashPrompt(prompt: string): string {
    return createHash('md5').update(prompt).digest('hex').substring(0, 16);
  }

  getCallCount(key: string): number {
    return this.callCounts.get(key) ?? 0;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  clearCache(): void {
    this.cache.clear();
  }

  reset(): void {
    this.callCounts.clear();
    this.cache.clear();
  }
}

/**
 * Model Prior-Based Pre-Filter
 * Filters context using patterns before semantic analysis
 */
export class PriorBasedFilter {
  /**
   * Pre-filter chunks using keyword patterns
   */
  filterByKeywords(
    chunks: EnhancedChunk[],
    keywords: string[],
    options?: { matchAll?: boolean; caseSensitive?: boolean }
  ): EnhancedChunk[] {
    if (keywords.length === 0) return chunks;

    const flags = options?.caseSensitive ? '' : 'i';
    const patterns = keywords.map(k => new RegExp(k, flags));

    return chunks.filter(chunk => {
      if (options?.matchAll) {
        return patterns.every(p => p.test(chunk.content));
      }
      return patterns.some(p => p.test(chunk.content));
    });
  }

  /**
   * Extract keywords from query using heuristics
   */
  extractQueryKeywords(query: string): string[] {
    const keywords: string[] = [];
    const queryLower = query.toLowerCase();

    // Common technical terms
    const technicalPatterns = [
      /\b(error|exception|bug|issue|problem)\b/gi,
      /\b(function|method|class|component|module)\b/gi,
      /\b(api|endpoint|route|handler)\b/gi,
      /\b(database|query|sql|mongodb)\b/gi,
      /\b(auth|authentication|authorization|login)\b/gi,
      /\b(test|testing|unit|integration)\b/gi,
    ];

    for (const pattern of technicalPatterns) {
      const matches = query.match(pattern);
      if (matches) {
        keywords.push(...matches.map(m => m.toLowerCase()));
      }
    }

    // Extract quoted strings
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      keywords.push(...quotedMatches.map(m => m.replace(/"/g, '')));
    }

    // Extract capitalized words (likely class/function names)
    const capitalizedMatches = query.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g);
    if (capitalizedMatches) {
      keywords.push(...capitalizedMatches);
    }

    return [...new Set(keywords)];
  }

  /**
   * Smart pre-filter that combines multiple strategies
   */
  smartPreFilter(
    chunks: EnhancedChunk[],
    query: string,
    maxChunks: number = 50
  ): EnhancedChunk[] {
    // Extract keywords from query
    const keywords = this.extractQueryKeywords(query);

    if (keywords.length === 0) {
      // No keywords - return top chunks by importance
      return [...chunks]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, maxChunks);
    }

    // Filter by keywords
    let filtered = this.filterByKeywords(chunks, keywords);

    // If too few results, relax to any match
    if (filtered.length < 5 && keywords.length > 1) {
      filtered = this.filterByKeywords(chunks, keywords, { matchAll: false });
    }

    // If still no results, fall back to importance-based selection
    if (filtered.length === 0) {
      return [...chunks]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, maxChunks);
    }

    // Sort by importance and limit
    return [...filtered]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxChunks);
  }
}

/**
 * RLM Safeguards Coordinator
 * Combines all safeguards into a single interface
 */
export class RLMSafeguards {
  private tokenBudget: TokenBudgetManager;
  private terminationDetector: TerminationDetector;
  private circuitBreaker: CircuitBreaker;
  private throttler: SubCallThrottler;
  private priorFilter: PriorBasedFilter;
  private modelConfig: ModelConfig;
  private modelCapabilities: ModelCapabilities;

  constructor(
    modelName: string,
    options?: {
      requiredTerminationSignals?: number;
      circuitBreakerThreshold?: number;
      circuitBreakerResetMs?: number;
      maxSubCallsPerKey?: number;
      cacheTtlMs?: number;
    }
  ) {
    this.modelConfig = getModelConfig(modelName);
    this.modelCapabilities = getModelCapabilities(modelName);
    
    this.tokenBudget = new TokenBudgetManager(modelName);
    this.terminationDetector = new TerminationDetector(options?.requiredTerminationSignals ?? 2);
    this.circuitBreaker = new CircuitBreaker(
      options?.circuitBreakerThreshold ?? 3,
      options?.circuitBreakerResetMs ?? 60000
    );
    this.throttler = new SubCallThrottler(
      options?.maxSubCallsPerKey ?? this.modelConfig.maxSubCalls,
      options?.cacheTtlMs ?? 300000
    );
    this.priorFilter = new PriorBasedFilter();
  }

  /**
   * Choose appropriate retrieval strategy
   */
  chooseStrategy(queryComplexity: 'simple' | 'moderate' | 'complex'): RetrievalStrategy {
    return chooseRetrievalStrategy(this.modelCapabilities, queryComplexity);
  }

  /**
   * Pre-filter chunks before processing
   */
  preFilter(chunks: EnhancedChunk[], query: string, maxChunks?: number): EnhancedChunk[] {
    return this.priorFilter.smartPreFilter(
      chunks,
      query,
      maxChunks ?? this.modelConfig.preferredChunkSize * 5
    );
  }

  /**
   * Execute a sub-call with all safeguards
   */
  async safeSubCall(
    key: string,
    llm: LLMService,
    prompt: string,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    // Check circuit breaker
    return this.circuitBreaker.execute(async () => {
      // Check token budget
      const estimatedTokens = Math.ceil(prompt.length / 4);
      if (!this.tokenBudget.canUseTokens(estimatedTokens)) {
        throw new Error('Token budget exceeded');
      }
      
      // Throttled and cached call
      const result = await this.throttler.throttledCall(key, llm, prompt, options);
      
      // Record token usage
      this.tokenBudget.useTokens(estimatedTokens + Math.ceil(result.length / 4));
      
      return result;
    });
  }

  /**
   * Check response and update termination signals
   */
  checkResponse(response: string, query: string): {
    terminate: boolean;
    reason: string;
    confidence: number;
  } {
    this.terminationDetector.checkExplicitTag(response);
    this.terminationDetector.checkConfidenceStatement(response);
    this.terminationDetector.checkNoMoreActions(response);
    
    // If it looks like an answer, validate it
    if (this.terminationDetector.getSignals().noMoreActions) {
      this.terminationDetector.validateAnswer(response, query);
    }
    
    return this.terminationDetector.shouldTerminate();
  }

  /**
   * Mark iteration limit reached
   */
  markIterationLimitReached(): void {
    this.terminationDetector.setIterationLimitReached();
  }

  /**
   * Mark budget exhausted
   */
  markBudgetExhausted(): void {
    this.terminationDetector.setBudgetExhausted();
  }

  /**
   * Get model configuration
   */
  getModelConfig(): ModelConfig {
    return { ...this.modelConfig };
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities(): ModelCapabilities {
    return { ...this.modelCapabilities };
  }

  /**
   * Get current state
   */
  getState(): {
    tokenBudget: TokenBudget;
    terminationSignals: TerminationSignals;
    circuitBreakerState: CircuitBreakerState;
    cacheSize: number;
  } {
    return {
      tokenBudget: this.tokenBudget.getBudget(),
      terminationSignals: this.terminationDetector.getSignals(),
      circuitBreakerState: this.circuitBreaker.getState(),
      cacheSize: this.throttler.getCacheSize(),
    };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.tokenBudget.reset();
    this.terminationDetector.reset();
    this.circuitBreaker.reset();
    this.throttler.reset();
  }
}

export interface RLMSafeguardsOptions {
  requiredTerminationSignals?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  maxSubCallsPerKey?: number;
  cacheTtlMs?: number;
}

let instance: RLMSafeguards | null = null;

export function createRLMSafeguards(
  modelName: string,
  options?: RLMSafeguardsOptions
): RLMSafeguards {
  return new RLMSafeguards(modelName, options);
}

export function getRLMSafeguards(
  modelName: string = 'default',
  options?: RLMSafeguardsOptions
): RLMSafeguards {
  if (!instance) {
    instance = new RLMSafeguards(modelName, options);
  }
  return instance;
}

export function resetRLMSafeguards(): void {
  instance = null;
}
