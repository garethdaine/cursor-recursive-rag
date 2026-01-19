/**
 * Base LLM Provider Implementation
 * 
 * Abstract base class with common functionality for all LLM providers.
 */

import type {
  LLMProvider,
  LLMProviderType,
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  TokenUsage,
  BaseLLMProviderConfig,
} from '../../types/llmProvider.js';
import { LLMError } from '../../types/llmProvider.js';

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly type: LLMProviderType;
  abstract readonly name: string;

  protected config: BaseLLMProviderConfig;
  protected totalTokensUsed: number = 0;
  protected totalCost: number = 0;
  protected requestCount: number = 0;
  protected lastRequestTime: number = 0;

  constructor(config: BaseLLMProviderConfig) {
    this.config = {
      timeout: 60000,
      maxRetries: 3,
      rateLimit: 60,
      trackCosts: true,
      ...config,
    };
  }

  abstract isAvailable(): Promise<boolean>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract getModelCapabilities(model: string): ModelCapabilities | null;

  /**
   * Complete a single prompt (convenience wrapper)
   */
  async complete(
    prompt: string,
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    return this.chat(
      [{ role: 'user', content: prompt }],
      options
    );
  }

  /**
   * Chat completion - to be implemented by subclasses
   */
  abstract chat(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse>;

  getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  resetUsageTracking(): void {
    this.totalTokensUsed = 0;
    this.totalCost = 0;
    this.requestCount = 0;
  }

  /**
   * Track usage from a response
   */
  protected trackUsage(usage?: TokenUsage): void {
    if (!this.config.trackCosts || !usage) return;
    
    this.totalTokensUsed += usage.totalTokens;
    if (usage.estimatedCost) {
      this.totalCost += usage.estimatedCost;
    }
    this.requestCount++;
  }

  /**
   * Calculate cost based on token usage and model pricing
   */
  protected calculateCost(
    usage: Pick<TokenUsage, 'promptTokens' | 'completionTokens'>,
    inputCostPer1M?: number,
    outputCostPer1M?: number
  ): number {
    if (!inputCostPer1M || !outputCostPer1M) return 0;
    
    const inputCost = (usage.promptTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (usage.completionTokens / 1_000_000) * outputCostPer1M;
    
    return inputCost + outputCost;
  }

  /**
   * Rate limiting check
   */
  protected async checkRateLimit(): Promise<void> {
    if (!this.config.rateLimit) return;
    
    const now = Date.now();
    const minInterval = 60000 / this.config.rateLimit; // ms between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      await this.sleep(minInterval - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Retry wrapper with exponential backoff
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    const maxRetries = this.config.maxRetries ?? 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.checkRateLimit();
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on non-retryable errors
        if (error instanceof LLMError && !error.retryable) {
          throw error;
        }

        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(backoff)}ms...`);
          await this.sleep(backoff);
        }
      }
    }

    throw lastError;
  }

  /**
   * Make an HTTP request with timeout
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout?: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = timeout ?? this.config.timeout ?? 60000;
    
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse JSON safely with error handling
   */
  protected parseJSON<T>(text: string, context: string): T {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new LLMError(
        `Failed to parse JSON response: ${context}`,
        'INVALID_RESPONSE',
        this.type,
        false,
        error instanceof Error ? error : undefined
      );
    }
  }
}
