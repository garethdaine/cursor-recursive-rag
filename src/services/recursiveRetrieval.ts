/**
 * Recursive Retrieval Controller
 * 
 * Based on the Recursive Language Models paper (Zhang et al., 2024), this controller
 * implements RLM-style iterative retrieval where the model can examine, filter, and
 * recursively process context.
 * 
 * Key features:
 * - Complexity assessment to decide retrieval strategy
 * - Iterative processing with action parsing
 * - Cost tracking across iterations
 * - Early termination on budget/iteration limits
 * - Support for both simple and complex queries
 */

import type { EnhancedChunk } from '../types/memory.js';
import type { EnhancedSearchOptions } from '../types/memory.js';
import type { SearchResult } from '../types/index.js';
import {
  ContextEnvironment,
  createContextEnvironment,
  type LLMService,
  type ExecutionStep,
  type EnvironmentConfig,
  BudgetExceededError,
  LimitExceededError,
  TimeoutError,
} from './contextEnvironment.js';
import { HybridScorer, getHybridScorer } from './hybridScorer.js';

export interface RetrievalConfig {
  initialRetrievalK: number;
  maxIterations: number;
  enableRecursiveSubCalls: boolean;
  costBudget: number;
  timeoutMs: number;
  complexityThresholds: {
    simpleMaxContext: number;
    moderateMaxContext: number;
  };
  enableHybridScoring: boolean;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  initialRetrievalK: 20,
  maxIterations: 10,
  enableRecursiveSubCalls: true,
  costBudget: 0.50,
  timeoutMs: 120000,
  complexityThresholds: {
    simpleMaxContext: 50000,
    moderateMaxContext: 200000,
  },
  enableHybridScoring: true,
};

export interface RetrieveOptions {
  searchOptions?: Partial<EnhancedSearchOptions>;
  forceStrategy?: 'direct' | 'recursive';
  seedChunkIds?: string[];
}

export interface RetrievalResult {
  chunks: EnhancedChunk[];
  strategy: 'direct' | 'recursive';
  iterations: number;
  cost: number;
  answer?: string;
  executionLog?: ExecutionStep[];
  complexity?: 'simple' | 'moderate' | 'complex';
  terminationReason?: string;
}

export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

export interface RetrievalAction {
  type: 'peek' | 'filter' | 'chunk' | 'subQuery' | 'store' | 'answer' | 'search';
  params: Record<string, unknown>;
  reasoning?: string;
}

interface VectorStoreInterface {
  search(embedding: number[], options: { topK: number; filter?: Record<string, unknown> }): Promise<SearchResult[]>;
  enhancedSearch?(embedding: number[], options: EnhancedSearchOptions): Promise<EnhancedChunk[]>;
}

interface EmbeddingsInterface {
  embed(text: string): Promise<number[]>;
}

/**
 * Recursive Retrieval Controller
 * 
 * Orchestrates iterative retrieval with complexity assessment and action parsing.
 */
export class RecursiveRetrievalController {
  private vectorStore: VectorStoreInterface;
  private embeddings: EmbeddingsInterface;
  private llm: LLMService;
  private subLlm: LLMService;
  private config: RetrievalConfig;
  private hybridScorer: HybridScorer;

  constructor(
    vectorStore: VectorStoreInterface,
    embeddings: EmbeddingsInterface,
    llm: LLMService,
    subLlm?: LLMService,
    config?: Partial<RetrievalConfig>
  ) {
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
    this.llm = llm;
    this.subLlm = subLlm ?? llm;
    this.config = {
      ...DEFAULT_RETRIEVAL_CONFIG,
      ...config,
    };
    this.hybridScorer = getHybridScorer();
  }

  /**
   * Execute recursive retrieval for a query
   */
  async retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult> {
    // Step 1: Initial retrieval
    const embedding = await this.embeddings.embed(query);
    const searchOptions = {
      topK: this.config.initialRetrievalK,
      ...options?.searchOptions,
    };

    const rawResults = await this.vectorStore.search(embedding, searchOptions);
    
    // Convert SearchResult[] to EnhancedChunk[]
    const initialChunks = this.convertToEnhancedChunks(rawResults);

    // Apply hybrid scoring if enabled
    let scoredChunks = initialChunks;
    if (this.config.enableHybridScoring && initialChunks.length > 0) {
      const searchResultInputs = rawResults.map(r => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      }));
      
      const scoredResults = await this.hybridScorer.scoreResults(
        searchResultInputs,
        query,
        { seedChunkIds: options?.seedChunkIds }
      );
      
      // Re-order chunks based on hybrid scores
      const idToScore = new Map(scoredResults.map(r => [r.id, r.finalScore]));
      scoredChunks = [...initialChunks].sort((a, b) => {
        const scoreA = idToScore.get(a.id) ?? 0;
        const scoreB = idToScore.get(b.id) ?? 0;
        return scoreB - scoreA;
      });
    }

    // Step 2: Check for forced strategy
    if (options?.forceStrategy === 'direct') {
      return {
        chunks: scoredChunks,
        strategy: 'direct',
        iterations: 1,
        cost: 0,
        complexity: 'simple',
      };
    }

    // Step 3: Assess complexity
    const complexity = this.assessComplexity(query, scoredChunks);

    if (options?.forceStrategy === 'recursive') {
      // Force recursive even for simple queries
    } else if (complexity === 'simple') {
      return {
        chunks: scoredChunks,
        strategy: 'direct',
        iterations: 1,
        cost: 0,
        complexity,
      };
    }

    // Step 4: Complex query - use RLM-style processing
    const envConfig: Partial<EnvironmentConfig> = {
      maxIterations: this.config.maxIterations,
      costBudget: this.config.costBudget,
      timeoutMs: this.config.timeoutMs,
      enableAsyncSubCalls: this.config.enableRecursiveSubCalls,
    };

    const env = createContextEnvironment(envConfig);
    env.loadContext(scoredChunks);

    const result = await this.iterativeProcess(query, env);
    
    return {
      ...result,
      complexity,
    };
  }

  /**
   * Assess query complexity to decide strategy
   * Based on RLM paper: "more complex problems exhibit degradation at shorter lengths"
   */
  assessComplexity(query: string, chunks: EnhancedChunk[]): ComplexityLevel {
    const totalContext = chunks.reduce((sum, c) => sum + c.content.length, 0);

    // Check query patterns that indicate complexity
    const aggregationKeywords = /how many|count|list all|compare|summarize|aggregate|total|average/i;
    const multiHopKeywords = /because|therefore|which.*then|after.*when|relationship|connected|related/i;
    const analysisKeywords = /analyze|evaluate|assess|review|investigate|examine/i;

    const isAggregation = aggregationKeywords.test(query);
    const isMultiHop = multiHopKeywords.test(query);
    const isAnalysis = analysisKeywords.test(query);

    // Small context and simple query
    if (totalContext < this.config.complexityThresholds.simpleMaxContext) {
      if (!isAggregation && !isMultiHop && !isAnalysis) {
        return 'simple';
      }
      return 'moderate';
    }

    // Medium context
    if (totalContext < this.config.complexityThresholds.moderateMaxContext) {
      if (isAggregation || isMultiHop || isAnalysis) {
        return 'complex';
      }
      return 'moderate';
    }

    // Large context is always complex
    return 'complex';
  }

  /**
   * Iterative RLM-style processing
   */
  private async iterativeProcess(
    query: string,
    env: ContextEnvironment
  ): Promise<RetrievalResult> {
    let iteration = 0;
    let answer: string | undefined;
    let terminationReason: string | undefined;

    while (iteration < this.config.maxIterations) {
      iteration++;
      env.markIteration(iteration);

      // Check termination conditions
      const termCheck = env.shouldTerminate();
      if (termCheck.terminate) {
        terminationReason = termCheck.reason;
        break;
      }

      try {
        // Get next action from LLM
        const action = await this.getNextAction(query, env, iteration);

        if (action.type === 'answer') {
          answer = action.params.value as string;
          terminationReason = 'Answer found';
          break;
        }

        // Execute the action
        await this.executeAction(action, env, query);
      } catch (error) {
        if (error instanceof BudgetExceededError) {
          terminationReason = 'Budget exceeded';
          break;
        }
        if (error instanceof LimitExceededError) {
          terminationReason = 'Sub-call limit exceeded';
          break;
        }
        if (error instanceof TimeoutError) {
          terminationReason = 'Timeout';
          break;
        }
        throw error;
      }
    }

    if (!terminationReason && iteration >= this.config.maxIterations) {
      terminationReason = 'Max iterations reached';
    }

    // Collect relevant chunks from the environment
    const relevantChunks = this.collectRelevantChunks(env);

    return {
      chunks: relevantChunks,
      strategy: 'recursive',
      iterations: iteration,
      cost: env.getTotalCost(),
      answer,
      executionLog: env.getExecutionLog(),
      terminationReason,
    };
  }

  /**
   * Ask LLM what to do next
   */
  private async getNextAction(
    query: string,
    env: ContextEnvironment,
    iteration: number
  ): Promise<RetrievalAction> {
    const prompt = `You are processing a query using a context environment. Your goal is to find relevant information efficiently.

## Query
${query}

${env.getStateDescription()}

## Chunk Summary
${env.getChunkSummary()}

## Iteration ${iteration}

Based on the query and current state, decide your next action. Available actions:

1. **peek** - Look at specific chunks to understand content
   \`{"type": "peek", "params": {"variable": "context", "start": 0, "end": 3}}\`

2. **filter** - Filter chunks by keyword/pattern to narrow down
   \`{"type": "filter", "params": {"variable": "context", "pattern": "error|exception", "output": "errors"}}\`

3. **subQuery** - Ask a focused question about a subset of context
   \`{"type": "subQuery", "params": {"query": "What error handling patterns are used?", "variable": "context"}}\`

4. **store** - Store intermediate findings
   \`{"type": "store", "params": {"variable": "findings", "value": "..."}}\`

5. **answer** - Provide final answer if you have enough information
   \`{"type": "answer", "params": {"value": "The answer based on the context is..."}}\`

Respond with ONLY a JSON action:
\`\`\`json
{
  "type": "...",
  "params": { ... },
  "reasoning": "brief explanation"
}
\`\`\`

Be efficient - filter first before examining everything. Use subQuery for semantic understanding.`;

    const response = await this.llm.invoke(prompt, {
      maxTokens: 1000,
      temperature: 0.2,
    });

    return this.parseAction(response);
  }

  /**
   * Execute a retrieval action
   */
  private async executeAction(
    action: RetrievalAction,
    env: ContextEnvironment,
    query: string
  ): Promise<void> {
    switch (action.type) {
      case 'peek': {
        const variable = (action.params.variable as string) ?? 'context';
        const start = action.params.start as number | undefined;
        const end = action.params.end as number | undefined;
        const peekResult = env.peek(variable, start, end);
        env.store('_lastPeek', peekResult);
        break;
      }

      case 'filter': {
        const variable = (action.params.variable as string) ?? 'context';
        const pattern = action.params.pattern as string;
        const output = (action.params.output as string) ?? 'filtered';
        const count = env.filterAndStore(variable, pattern, output);
        env.store('_lastFilterCount', count);
        break;
      }

      case 'chunk': {
        const variable = (action.params.variable as string) ?? 'context';
        const size = (action.params.size as number) ?? 5;
        const batches = env.chunk(variable, size);
        for (let i = 0; i < batches.length; i++) {
          env.loadContext(batches[i], `batch_${i}`);
        }
        env.store('_batchCount', batches.length);
        break;
      }

      case 'subQuery': {
        const subQuery = action.params.query as string;
        const variable = (action.params.variable as string) ?? 'context';
        const chunks = env.getChunks(variable);
        
        if (chunks.length > 0) {
          const response = await env.subQuery(this.subLlm, subQuery, chunks);
          const outputVar = (action.params.output as string) ?? '_lastSubQuery';
          env.store(outputVar, response);
        }
        break;
      }

      case 'store': {
        const variable = action.params.variable as string;
        const value = action.params.value;
        env.store(variable, value);
        break;
      }

      case 'search': {
        // Additional search with different parameters
        const searchQuery = (action.params.query as string) ?? query;
        const embedding = await this.embeddings.embed(searchQuery);
        const topK = (action.params.topK as number) ?? 10;
        
        const results = await this.vectorStore.search(embedding, { topK });
        const chunks = this.convertToEnhancedChunks(results);
        
        const outputVar = (action.params.output as string) ?? 'additionalResults';
        env.loadContext(chunks, outputVar);
        break;
      }
    }
  }

  /**
   * Parse action from LLM response
   */
  private parseAction(response: string): RetrievalAction {
    // Try to extract JSON from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    try {
      // Try direct JSON parse
      const action = JSON.parse(jsonStr.trim());
      
      // Validate action type
      const validTypes = ['peek', 'filter', 'chunk', 'subQuery', 'store', 'answer', 'search'];
      if (!validTypes.includes(action.type)) {
        // Default to answer if we can't parse
        return {
          type: 'answer',
          params: { value: response },
          reasoning: 'Could not parse valid action',
        };
      }

      return {
        type: action.type,
        params: action.params || {},
        reasoning: action.reasoning,
      };
    } catch {
      // Try to find JSON object in response
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          const action = JSON.parse(objectMatch[0]);
          return {
            type: action.type || 'answer',
            params: action.params || { value: response },
            reasoning: action.reasoning,
          };
        } catch {
          // Fall through to default
        }
      }

      // Default: treat entire response as answer
      return {
        type: 'answer',
        params: { value: response },
        reasoning: 'Could not parse action JSON',
      };
    }
  }

  /**
   * Collect relevant chunks from environment
   */
  private collectRelevantChunks(env: ContextEnvironment): EnhancedChunk[] {
    const allChunks: EnhancedChunk[] = [];
    const seenIds = new Set<string>();

    // Collect from all chunk variables
    for (const varName of env.listVariables()) {
      if (varName.startsWith('_')) continue; // Skip internal variables
      
      const chunks = env.getChunks(varName);
      for (const chunk of chunks) {
        if (!seenIds.has(chunk.id)) {
          seenIds.add(chunk.id);
          allChunks.push(chunk);
        }
      }
    }

    return allChunks;
  }

  /**
   * Convert SearchResult[] to EnhancedChunk[]
   */
  private convertToEnhancedChunks(results: SearchResult[]): EnhancedChunk[] {
    return results.map(r => ({
      id: r.id,
      content: r.content,
      embedding: [],
      source: (r.metadata?.source as string) || 'unknown',
      metadata: r.metadata,
      createdAt: r.metadata?.createdAt ? new Date(r.metadata.createdAt as string) : new Date(),
      updatedAt: r.metadata?.updatedAt ? new Date(r.metadata.updatedAt as string) : new Date(),
      lastAccessedAt: r.metadata?.lastAccessedAt ? new Date(r.metadata.lastAccessedAt as string) : null,
      accessCount: (r.metadata?.accessCount as number) || 0,
      importance: (r.metadata?.importance as number) || 0.5,
      decayScore: (r.metadata?.decayScore as number) || 1.0,
      isArchived: (r.metadata?.isArchived as boolean) || false,
      chunkType: (r.metadata?.chunkType as EnhancedChunk['chunkType']) || 'documentation',
      relatedChunkIds: (r.metadata?.relatedChunkIds as string[]) || [],
      entities: (r.metadata?.entities as EnhancedChunk['entities']) || [],
      sourceConversationId: r.metadata?.sourceConversationId as string | undefined,
      sourceMessageIndex: r.metadata?.sourceMessageIndex as number | undefined,
    }));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetrievalConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetrievalConfig {
    return { ...this.config };
  }
}

let instance: RecursiveRetrievalController | null = null;

export function createRecursiveRetrievalController(
  vectorStore: VectorStoreInterface,
  embeddings: EmbeddingsInterface,
  llm: LLMService,
  subLlm?: LLMService,
  config?: Partial<RetrievalConfig>
): RecursiveRetrievalController {
  return new RecursiveRetrievalController(vectorStore, embeddings, llm, subLlm, config);
}

export function getRecursiveRetrievalController(
  vectorStore: VectorStoreInterface,
  embeddings: EmbeddingsInterface,
  llm: LLMService,
  subLlm?: LLMService,
  config?: Partial<RetrievalConfig>
): RecursiveRetrievalController {
  if (!instance) {
    instance = new RecursiveRetrievalController(vectorStore, embeddings, llm, subLlm, config);
  }
  return instance;
}

export function resetRecursiveRetrievalController(): void {
  instance = null;
}
