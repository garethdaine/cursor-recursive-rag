/**
 * OpenAI LLM Provider
 * 
 * Supports: GPT-4o, GPT-4o-mini, o1, o1-mini, GPT-4-turbo
 */

import OpenAI from 'openai';
import { BaseLLMProvider } from './base.js';
import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  OpenAIProviderConfig,
} from '../../types/llmProvider.js';
import { LLMError } from '../../types/llmProvider.js';

/**
 * OpenAI model configurations
 */
const OPENAI_MODELS: Record<string, ModelCapabilities> = {
  'gpt-4o': {
    contextLength: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  'gpt-4o-mini': {
    contextLength: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  'o1': {
    contextLength: 200000,
    supportsVision: true,
    supportsFunctions: false,
    supportsJsonMode: false,
    supportsStreaming: true,
    maxOutputTokens: 100000,
    inputCostPer1M: 15,
    outputCostPer1M: 60,
  },
  'o1-mini': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: false,
    supportsStreaming: true,
    maxOutputTokens: 65536,
    inputCostPer1M: 3,
    outputCostPer1M: 12,
  },
  'gpt-4-turbo': {
    contextLength: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 4096,
    inputCostPer1M: 10,
    outputCostPer1M: 30,
  },
};

export class OpenAIProvider extends BaseLLMProvider {
  readonly type = 'openai' as const;
  readonly name = 'OpenAI';

  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.model = config.defaultModel ?? 'gpt-4o-mini';
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return Object.entries(OPENAI_MODELS).map(([id, capabilities]) => ({
      id,
      name: id,
      provider: 'openai' as const,
      capabilities,
    }));
  }

  getModelCapabilities(model: string): ModelCapabilities | null {
    return OPENAI_MODELS[model] ?? null;
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    const model = options?.headers?.['x-model'] ?? this.model;
    const capabilities = this.getModelCapabilities(model);
    const startTime = Date.now();

    const isReasoningModel = model.startsWith('o1');

    return this.withRetry(async () => {
      try {
        // Build request parameters
        const params: OpenAI.ChatCompletionCreateParams = {
          model,
          messages: this.formatMessages(messages, isReasoningModel),
          max_completion_tokens: options?.maxTokens ?? capabilities?.maxOutputTokens ?? 4096,
        };

        // Only add temperature for non-reasoning models
        if (!isReasoningModel && options?.temperature !== undefined) {
          params.temperature = options.temperature;
        }

        // Add optional parameters (not supported by reasoning models)
        if (!isReasoningModel) {
          if (options?.topP !== undefined) params.top_p = options.topP;
          if (options?.stop) params.stop = options.stop;
          if (options?.jsonMode && capabilities?.supportsJsonMode) {
            params.response_format = { type: 'json_object' };
          }
        }

        // Handle streaming
        if (options?.onStream && capabilities?.supportsStreaming && !isReasoningModel) {
          return this.handleStream(params, options.onStream, startTime, model);
        }

        // Regular completion
        const response = await this.client.chat.completions.create(params);
        const latencyMs = Date.now() - startTime;

        const usage = response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          estimatedCost: this.calculateCost(
            {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            },
            capabilities?.inputCostPer1M,
            capabilities?.outputCostPer1M
          ),
        } : undefined;

        this.trackUsage(usage);

        return {
          content: response.choices[0]?.message?.content ?? '',
          model: response.model,
          usage,
          latencyMs,
          streamed: false,
          finishReason: response.choices[0]?.finish_reason ?? undefined,
        };

      } catch (error) {
        throw this.handleError(error);
      }
    }, `OpenAI chat completion`);
  }

  private formatMessages(
    messages: LLMMessage[],
    isReasoningModel: boolean
  ): OpenAI.ChatCompletionMessageParam[] {
    // Reasoning models don't support system messages, prepend to first user message
    if (isReasoningModel) {
      const systemMessages = messages.filter(m => m.role === 'system');
      const otherMessages = messages.filter(m => m.role !== 'system');
      
      if (systemMessages.length > 0 && otherMessages.length > 0) {
        const systemContent = systemMessages.map(m => m.content).join('\n\n');
        const firstUserIndex = otherMessages.findIndex(m => m.role === 'user');
        
        if (firstUserIndex >= 0) {
          otherMessages[firstUserIndex] = {
            ...otherMessages[firstUserIndex],
            content: `${systemContent}\n\n${otherMessages[firstUserIndex].content}`,
          };
        }
        
        return otherMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      }
    }

    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  private async handleStream(
    params: OpenAI.ChatCompletionCreateParams,
    onStream: (chunk: string) => void,
    startTime: number,
    model: string
  ): Promise<LLMResponse> {
    const stream = await this.client.chat.completions.create({
      ...params,
      stream: true,
    });

    let content = '';
    let finishReason: string | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        content += delta;
        onStream(delta);
      }
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
    }

    const latencyMs = Date.now() - startTime;

    return {
      content,
      model,
      latencyMs,
      streamed: true,
      finishReason,
    };
  }

  private handleError(error: unknown): LLMError {
    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      
      if (status === 401) {
        return new LLMError(
          'OpenAI authentication failed - check your API key',
          'AUTHENTICATION_FAILED',
          'openai',
          false,
          error
        );
      }
      
      if (status === 429) {
        return new LLMError(
          'OpenAI rate limit exceeded',
          'RATE_LIMITED',
          'openai',
          true,
          error
        );
      }
      
      if (status === 400 && error.message.includes('context_length')) {
        return new LLMError(
          'Context too long for model',
          'CONTEXT_TOO_LONG',
          'openai',
          false,
          error
        );
      }
      
      if (status === 404) {
        return new LLMError(
          `Model not found: ${error.message}`,
          'MODEL_NOT_FOUND',
          'openai',
          false,
          error
        );
      }

      return new LLMError(
        `OpenAI API error: ${error.message}`,
        'UNKNOWN',
        'openai',
        status >= 500,
        error
      );
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return new LLMError(
        'OpenAI request timed out',
        'TIMEOUT',
        'openai',
        true,
        error
      );
    }

    return new LLMError(
      `OpenAI error: ${error instanceof Error ? error.message : String(error)}`,
      'UNKNOWN',
      'openai',
      false,
      error instanceof Error ? error : undefined
    );
  }
}
