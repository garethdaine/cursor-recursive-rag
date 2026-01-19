/**
 * OpenRouter LLM Provider
 * 
 * Unified API access to 100+ models from multiple providers.
 * OpenAI-compatible API format.
 */

import { BaseLLMProvider } from './base.js';
import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  OpenRouterProviderConfig,
} from '../../types/llmProvider.js';
import { LLMError } from '../../types/llmProvider.js';

const OPENROUTER_MODELS: Record<string, ModelCapabilities> = {
  'anthropic/claude-3.5-sonnet': {
    contextLength: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: false,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  'openai/gpt-4o': {
    contextLength: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  'openai/gpt-4o-mini': {
    contextLength: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  'google/gemini-2.0-flash-001': {
    contextLength: 1048576,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
  },
  'meta-llama/llama-3.1-70b-instruct': {
    contextLength: 131072,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.52,
    outputCostPer1M: 0.75,
  },
  'deepseek/deepseek-chat': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
  },
  'qwen/qwen-2.5-coder-32b-instruct': {
    contextLength: 32768,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.18,
    outputCostPer1M: 0.18,
  },
};

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterProvider extends BaseLLMProvider {
  readonly type = 'openrouter' as const;
  readonly name = 'OpenRouter';

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private siteUrl?: string;
  private siteName?: string;

  constructor(config: OpenRouterProviderConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api';
    this.model = config.defaultModel ?? 'anthropic/claude-3.5-sonnet';
    this.siteUrl = config.siteUrl;
    this.siteName = config.siteName;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/models`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        },
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/models`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        },
        10000
      );

      if (!response.ok) {
        return this.getStaticModels();
      }

      const data = await response.json() as { data?: Array<{ id: string; name?: string; context_length?: number }> };
      const models = data.data ?? [];

      return models.slice(0, 50).map((m) => {
        const known = OPENROUTER_MODELS[m.id];
        return {
          id: m.id,
          name: m.name ?? m.id,
          provider: 'openrouter' as const,
          capabilities: known ?? {
            contextLength: m.context_length ?? 8192,
            supportsVision: false,
            supportsFunctions: false,
            supportsJsonMode: false,
            supportsStreaming: true,
          },
        };
      });
    } catch {
      return this.getStaticModels();
    }
  }

  private getStaticModels(): ModelInfo[] {
    return Object.entries(OPENROUTER_MODELS).map(([id, capabilities]) => ({
      id,
      name: id,
      provider: 'openrouter' as const,
      capabilities,
    }));
  }

  getModelCapabilities(model: string): ModelCapabilities | null {
    return OPENROUTER_MODELS[model] ?? null;
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    const model = options?.headers?.['x-model'] ?? this.model;
    const capabilities = this.getModelCapabilities(model);
    const startTime = Date.now();

    return this.withRetry(async () => {
      try {
        const body: Record<string, unknown> = {
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          max_tokens: options?.maxTokens ?? capabilities?.maxOutputTokens ?? 4096,
        };

        if (options?.temperature !== undefined) {
          body.temperature = options.temperature;
        }
        if (options?.topP !== undefined) {
          body.top_p = options.topP;
        }
        if (options?.stop) {
          body.stop = options.stop;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        };

        if (this.siteUrl) {
          headers['HTTP-Referer'] = this.siteUrl;
        }
        if (this.siteName) {
          headers['X-Title'] = this.siteName;
        }

        // Handle streaming
        if (options?.onStream && capabilities?.supportsStreaming) {
          return this.handleStream(body, headers, options.onStream, startTime, model, capabilities);
        }

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/chat/completions`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          },
          options?.timeout
        );

        if (!response.ok) {
          throw await this.parseErrorResponse(response);
        }

        const data = await response.json() as OpenRouterResponse;
        const latencyMs = Date.now() - startTime;

        const usage = data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          estimatedCost: this.calculateCost(
            {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
            },
            capabilities?.inputCostPer1M,
            capabilities?.outputCostPer1M
          ),
        } : undefined;

        if (usage) this.trackUsage(usage);

        return {
          content: data.choices[0]?.message?.content ?? '',
          model: data.model,
          usage,
          latencyMs,
          streamed: false,
          finishReason: data.choices[0]?.finish_reason ?? undefined,
        };

      } catch (error) {
        if (error instanceof LLMError) throw error;
        throw this.handleError(error);
      }
    }, `OpenRouter chat completion`);
  }

  private async handleStream(
    body: Record<string, unknown>,
    headers: Record<string, string>,
    onStream: (chunk: string) => void,
    startTime: number,
    model: string,
    capabilities: ModelCapabilities | null
  ): Promise<LLMResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, stream: true }),
      }
    );

    if (!response.ok) {
      throw await this.parseErrorResponse(response);
    }

    let content = '';
    let finishReason: string | undefined;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new LLMError('No response body', 'INVALID_RESPONSE', 'openrouter', false);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              onStream(delta);
            }
            if (chunk.choices?.[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
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

  private async parseErrorResponse(response: Response): Promise<LLMError> {
    try {
      const data = await response.json() as { error?: { message?: string } };
      const message = data.error?.message ?? 'Unknown error';

      if (response.status === 401) {
        return new LLMError('OpenRouter authentication failed', 'AUTHENTICATION_FAILED', 'openrouter', false);
      }
      if (response.status === 429) {
        return new LLMError('OpenRouter rate limit exceeded', 'RATE_LIMITED', 'openrouter', true);
      }

      return new LLMError(`OpenRouter API error: ${message}`, 'UNKNOWN', 'openrouter', response.status >= 500);
    } catch {
      return new LLMError(`OpenRouter API error (${response.status})`, 'UNKNOWN', 'openrouter', response.status >= 500);
    }
  }

  private handleError(error: unknown): LLMError {
    if (error instanceof Error && error.name === 'AbortError') {
      return new LLMError('OpenRouter request timed out', 'TIMEOUT', 'openrouter', true, error);
    }
    return new LLMError(
      `OpenRouter error: ${error instanceof Error ? error.message : String(error)}`,
      'UNKNOWN',
      'openrouter',
      false,
      error instanceof Error ? error : undefined
    );
  }
}
