/**
 * Context Environment for RLM-style Recursive Retrieval
 * 
 * Based on the Recursive Language Models paper (Zhang et al., 2024), this service
 * treats retrieved context as environment variables that can be programmatically
 * examined, filtered, and decomposed rather than stuffing all context into the prompt.
 * 
 * Key capabilities:
 * - Load context chunks as named variables
 * - Peek at portions of context without loading full content
 * - Filter chunks by regex patterns
 * - Split context into batches for parallel processing
 * - Execute sub-queries with cost tracking
 * - Enforce budget and iteration limits
 */

import type { EnhancedChunk } from '../types/memory.js';

export interface ContextVariable {
  name: string;
  type: 'chunks' | 'primitive' | 'object' | 'string';
  value: unknown;
  metadata: ContextVariableMetadata;
}

export interface ContextVariableMetadata {
  totalLength?: number;
  chunkCount?: number;
  chunkLengths?: number[];
  [key: string]: unknown;
}

export interface ExecutionStep {
  type: 'load_context' | 'iteration' | 'filter' | 'chunk' | 'sub_call' | 'store' | 'peek';
  timestamp: Date;
  variableName?: string;
  metadata?: ContextVariableMetadata;
  start?: number;
  end?: number;
  pattern?: string;
  originalCount?: number;
  resultCount?: number;
  batchSize?: number;
  batchCount?: number;
  query?: string;
  contextLength?: number;
  responseLength?: number;
  cost?: number;
  durationMs?: number;
  valueType?: string;
  iterationNumber?: number;
  action?: string;
}

export interface EnvironmentConfig {
  maxIterations: number;
  maxSubCalls: number;
  costBudget: number;
  timeoutMs: number;
  enableAsyncSubCalls: boolean;
  concurrencyLimit: number;
}

export const DEFAULT_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  maxIterations: 20,
  maxSubCalls: 50,
  costBudget: 1.0,
  timeoutMs: 120000,
  enableAsyncSubCalls: true,
  concurrencyLimit: 5,
};

export interface SubQueryOptions {
  maxTokens?: number;
  temperature?: number;
  estimatedCost?: number;
}

export interface LLMService {
  invoke(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitExceededError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class CostTracker {
  total = 0;
  private budget: number;

  constructor(budget: number) {
    this.budget = budget;
  }

  get remaining(): number {
    return this.budget - this.total;
  }

  get exceeded(): boolean {
    return this.total >= this.budget;
  }

  canAfford(amount: number): boolean {
    return this.total + amount <= this.budget;
  }

  record(amount: number): void {
    this.total += amount;
  }
}

/**
 * Context Environment for RLM-style retrieval
 * 
 * Treats retrieved context as environment variables that can be
 * programmatically examined, filtered, and decomposed.
 */
export class ContextEnvironment {
  private variables: Map<string, ContextVariable> = new Map();
  private executionLog: ExecutionStep[] = [];
  private costTracker: CostTracker;
  private config: EnvironmentConfig;
  private startTime: number;

  constructor(config?: Partial<EnvironmentConfig>) {
    this.config = {
      ...DEFAULT_ENVIRONMENT_CONFIG,
      ...config,
    };
    this.costTracker = new CostTracker(this.config.costBudget);
    this.startTime = Date.now();
  }

  /**
   * Load context chunks as environment variables
   */
  loadContext(chunks: EnhancedChunk[], variableName: string = 'context'): void {
    const contextVar: ContextVariable = {
      name: variableName,
      type: 'chunks',
      value: chunks,
      metadata: {
        totalLength: chunks.reduce((sum, c) => sum + c.content.length, 0),
        chunkCount: chunks.length,
        chunkLengths: chunks.map(c => c.content.length),
      },
    };

    this.variables.set(variableName, contextVar);

    this.log({
      type: 'load_context',
      variableName,
      metadata: contextVar.metadata,
    });
  }

  /**
   * Get environment state description for LLM
   * Tells the model what's available without showing all content
   */
  getStateDescription(): string {
    const vars = Array.from(this.variables.entries()).map(([name, v]) => {
      if (v.type === 'chunks') {
        const meta = v.metadata;
        return `- \`${name}\`: ${meta.chunkCount} chunks, ${meta.totalLength} total chars`;
      }
      if (v.type === 'string') {
        const strValue = v.value as string;
        return `- \`${name}\`: string (${strValue.length} chars)`;
      }
      if (v.type === 'object') {
        return `- \`${name}\`: object`;
      }
      return `- \`${name}\`: ${typeof v.value}`;
    });

    const iterations = this.executionLog.filter(s => s.type === 'iteration').length;
    const subCalls = this.executionLog.filter(s => s.type === 'sub_call').length;

    return `## Environment State
Variables:
${vars.join('\n')}

Available operations:
- \`peek(varName, start?, end?)\` - View portion of a variable
- \`filter(varName, pattern)\` - Filter chunks by regex pattern
- \`chunk(varName, size)\` - Split into smaller batches
- \`subQuery(query, context)\` - Invoke sub-LLM on context
- \`store(varName, value)\` - Store intermediate result
- \`answer(value)\` - Return final answer from environment

Remaining budget: $${this.costTracker.remaining.toFixed(4)}
Iterations: ${iterations}/${this.config.maxIterations}
Sub-calls: ${subCalls}/${this.config.maxSubCalls}
`;
  }

  /**
   * Get a summary of chunk contents without full content
   */
  getChunkSummary(variableName: string = 'context'): string {
    const variable = this.variables.get(variableName);
    if (!variable || variable.type !== 'chunks') {
      return `Error: Variable '${variableName}' not found or not chunks`;
    }

    const chunks = variable.value as EnhancedChunk[];
    const summaries = chunks.map((c, i) => {
      const preview = c.content.substring(0, 100).replace(/\n/g, ' ');
      const type = c.chunkType || 'unknown';
      return `[${i}] (${type}, ${c.content.length} chars): ${preview}...`;
    });

    return summaries.join('\n');
  }

  /**
   * Peek at portion of context (without loading full content into LLM)
   */
  peek(variableName: string, start?: number, end?: number): string {
    const variable = this.variables.get(variableName);
    if (!variable) {
      return `Error: Variable '${variableName}' not found`;
    }

    this.log({
      type: 'peek',
      variableName,
      start,
      end,
    });

    if (variable.type === 'chunks') {
      const chunks = variable.value as EnhancedChunk[];
      const selected = chunks.slice(start ?? 0, end ?? 3);
      return selected.map((c, i) => {
        const chunkIndex = (start ?? 0) + i;
        const preview = c.content.substring(0, 500);
        const truncated = c.content.length > 500 ? '...' : '';
        return `[Chunk ${chunkIndex}] (${c.chunkType || 'unknown'}, ${c.content.length} chars):\n${preview}${truncated}`;
      }).join('\n\n');
    }

    if (variable.type === 'string') {
      const str = variable.value as string;
      return str.substring(start ?? 0, end ?? 1000);
    }

    return JSON.stringify(variable.value, null, 2).substring(start ?? 0, end ?? 1000);
  }

  /**
   * Filter chunks by regex pattern
   */
  filter(variableName: string, pattern: string): EnhancedChunk[] {
    const variable = this.variables.get(variableName);
    if (!variable || variable.type !== 'chunks') {
      return [];
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      return [];
    }

    const chunks = variable.value as EnhancedChunk[];
    const filtered = chunks.filter(c => regex.test(c.content));

    this.log({
      type: 'filter',
      variableName,
      pattern,
      originalCount: chunks.length,
      resultCount: filtered.length,
    });

    return filtered;
  }

  /**
   * Filter and store results in a new variable
   */
  filterAndStore(
    sourceVariable: string,
    pattern: string,
    outputVariable: string
  ): number {
    const filtered = this.filter(sourceVariable, pattern);
    
    if (filtered.length > 0) {
      this.loadContext(filtered, outputVariable);
    }

    return filtered.length;
  }

  /**
   * Split variable into smaller batches for processing
   */
  chunk(variableName: string, batchSize: number): EnhancedChunk[][] {
    const variable = this.variables.get(variableName);
    if (!variable || variable.type !== 'chunks') {
      return [];
    }

    const chunks = variable.value as EnhancedChunk[];
    const batches: EnhancedChunk[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize));
    }

    this.log({
      type: 'chunk',
      variableName,
      batchSize,
      batchCount: batches.length,
    });

    return batches;
  }

  /**
   * Execute a sub-LLM call on context
   * Implements async sub-calls as recommended by RLM paper
   */
  async subQuery(
    llm: LLMService,
    query: string,
    context: string | EnhancedChunk[],
    options?: SubQueryOptions
  ): Promise<string> {
    // Check timeout
    if (Date.now() - this.startTime > this.config.timeoutMs) {
      throw new TimeoutError('Environment timeout exceeded');
    }

    // Check budget before calling
    const estimatedCost = options?.estimatedCost ?? 0.01;
    if (!this.costTracker.canAfford(estimatedCost)) {
      throw new BudgetExceededError('Cost budget exceeded');
    }

    const subCallCount = this.executionLog.filter(s => s.type === 'sub_call').length;
    if (subCallCount >= this.config.maxSubCalls) {
      throw new LimitExceededError('Maximum sub-calls exceeded');
    }

    const contextStr = Array.isArray(context)
      ? context.map(c => c.content).join('\n\n---\n\n')
      : context;

    const startTime = Date.now();

    const response = await llm.invoke(
      `${query}\n\nContext:\n${contextStr}`,
      {
        maxTokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.3,
      }
    );

    const cost = this.estimateCost(contextStr.length, response.length);
    this.costTracker.record(cost);

    this.log({
      type: 'sub_call',
      query: query.substring(0, 100),
      contextLength: contextStr.length,
      responseLength: response.length,
      cost,
      durationMs: Date.now() - startTime,
    });

    return response;
  }

  /**
   * Batch sub-queries with async execution (RLM paper recommendation)
   */
  async batchSubQuery(
    llm: LLMService,
    queries: Array<{ query: string; context: string | EnhancedChunk[] }>
  ): Promise<string[]> {
    if (!this.config.enableAsyncSubCalls) {
      const results: string[] = [];
      for (const q of queries) {
        results.push(await this.subQuery(llm, q.query, q.context));
      }
      return results;
    }

    const concurrency = this.config.concurrencyLimit;
    const results: string[] = new Array(queries.length);

    for (let i = 0; i < queries.length; i += concurrency) {
      const batch = queries.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((q, j) =>
          this.subQuery(llm, q.query, q.context)
            .then(r => ({ index: i + j, result: r }))
            .catch(err => ({ index: i + j, result: `Error: ${err.message}` }))
        )
      );

      for (const { index, result } of batchResults) {
        results[index] = result;
      }
    }

    return results;
  }

  /**
   * Store intermediate result
   */
  store(variableName: string, value: unknown): void {
    let type: ContextVariable['type'] = 'primitive';
    if (typeof value === 'string') {
      type = 'string';
    } else if (Array.isArray(value) && value.length > 0 && 'content' in value[0]) {
      type = 'chunks';
    } else if (typeof value === 'object' && value !== null) {
      type = 'object';
    }

    this.variables.set(variableName, {
      name: variableName,
      type,
      value,
      metadata: {},
    });

    this.log({
      type: 'store',
      variableName,
      valueType: type,
    });
  }

  /**
   * Get a stored variable
   */
  get(variableName: string): unknown {
    const variable = this.variables.get(variableName);
    return variable?.value;
  }

  /**
   * Get chunks from a variable
   */
  getChunks(variableName: string = 'context'): EnhancedChunk[] {
    const variable = this.variables.get(variableName);
    if (!variable || variable.type !== 'chunks') {
      return [];
    }
    return variable.value as EnhancedChunk[];
  }

  /**
   * Check if a variable exists
   */
  has(variableName: string): boolean {
    return this.variables.has(variableName);
  }

  /**
   * List all variable names
   */
  listVariables(): string[] {
    return Array.from(this.variables.keys());
  }

  /**
   * Mark an iteration
   */
  markIteration(iterationNumber: number, action?: string): void {
    this.log({
      type: 'iteration',
      iterationNumber,
      action,
    });
  }

  /**
   * Check if we should terminate
   */
  shouldTerminate(): { terminate: boolean; reason?: string } {
    // Check timeout
    if (Date.now() - this.startTime > this.config.timeoutMs) {
      return { terminate: true, reason: 'Timeout exceeded' };
    }

    // Check cost budget
    if (this.costTracker.exceeded) {
      return { terminate: true, reason: 'Cost budget exceeded' };
    }

    // Check iteration limit
    const iterations = this.executionLog.filter(s => s.type === 'iteration').length;
    if (iterations >= this.config.maxIterations) {
      return { terminate: true, reason: 'Maximum iterations reached' };
    }

    // Check sub-call limit
    const subCalls = this.executionLog.filter(s => s.type === 'sub_call').length;
    if (subCalls >= this.config.maxSubCalls) {
      return { terminate: true, reason: 'Maximum sub-calls reached' };
    }

    return { terminate: false };
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    return this.costTracker.remaining;
  }

  /**
   * Get iteration count
   */
  getIterationCount(): number {
    return this.executionLog.filter(s => s.type === 'iteration').length;
  }

  /**
   * Get sub-call count
   */
  getSubCallCount(): number {
    return this.executionLog.filter(s => s.type === 'sub_call').length;
  }

  /**
   * Get execution log
   */
  getExecutionLog(): ExecutionStep[] {
    return [...this.executionLog];
  }

  /**
   * Get total cost
   */
  getTotalCost(): number {
    return this.costTracker.total;
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get environment statistics
   */
  getStats(): {
    variableCount: number;
    totalChunks: number;
    totalContentLength: number;
    iterations: number;
    subCalls: number;
    totalCost: number;
    elapsedMs: number;
  } {
    let totalChunks = 0;
    let totalContentLength = 0;

    for (const variable of this.variables.values()) {
      if (variable.type === 'chunks') {
        const chunks = variable.value as EnhancedChunk[];
        totalChunks += chunks.length;
        totalContentLength += chunks.reduce((sum, c) => sum + c.content.length, 0);
      }
    }

    return {
      variableCount: this.variables.size,
      totalChunks,
      totalContentLength,
      iterations: this.getIterationCount(),
      subCalls: this.getSubCallCount(),
      totalCost: this.getTotalCost(),
      elapsedMs: this.getElapsedTime(),
    };
  }

  private log(step: Omit<ExecutionStep, 'timestamp'>): void {
    this.executionLog.push({
      ...step,
      timestamp: new Date(),
    } as ExecutionStep);
  }

  private estimateCost(inputChars: number, outputChars: number): number {
    // Rough estimate based on typical token ratios
    // ~4 chars per token, pricing similar to GPT-4o-mini
    const inputTokens = inputChars / 4;
    const outputTokens = outputChars / 4;
    // $0.15 per 1M input tokens, $0.60 per 1M output tokens (GPT-4o-mini pricing)
    return (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.60;
  }
}

let instance: ContextEnvironment | null = null;

export function createContextEnvironment(config?: Partial<EnvironmentConfig>): ContextEnvironment {
  return new ContextEnvironment(config);
}

export function getContextEnvironment(config?: Partial<EnvironmentConfig>): ContextEnvironment {
  if (!instance) {
    instance = new ContextEnvironment(config);
  }
  return instance;
}

export function resetContextEnvironment(): void {
  instance = null;
}
