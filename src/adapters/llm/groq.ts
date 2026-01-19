/**
 * Groq LLM Provider
 * 
 * Fast inference for open-source models.
 * Supports: LLaMA, Mixtral, Gemma models
 */

import { BaseLLMProvider } from './base.js';
import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  GroqProviderConfig,
} from '../../types/llmProvider.js';
import { LLMError } from '../../types/llmProvider.js';

const GROQ_MODELS: Record<string, ModelCapabilities> = {
  'llama-3.3-70b-versatile': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 32768,
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
  },
  'llama-3.1-70b-versatile': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8000,
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
  },
  'llama-3.1-8b-instant': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8000,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.08,
  },
  'mixtral-8x7b-32768': {
    contextLength: 32768,
    supportsVision: false,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 32768,
    inputCostPer1M: 0.24,
    outputCostPer1M: 0.24,
  },
  'gemma2-9b-it': {
    contextLength: 8192,
    supportsVision: false,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.20,
    outputCostPer1M: 0.20,
  },
  'llama-3.2-90b-vision-preview': {
    contextLength: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    maxOutputTokens: 8000,
    inputCostPer1M: 0.90,
    outputCostPer1M: 0.90,
  },
};

interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqProvider extends BaseLLMProvider {
  readonly type = 'groq' as const;
  readonly name = 'Groq';

  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: GroqProviderConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.groq.com/openai';
    this.model = config.defaultModel ?? 'llama-3.3-70b-versatile';
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
    return Object.entries(GROQ_MODELS).map(([id, capabilities]) => ({
      id,
      name: this.formatModelName(id),
      provider: 'groq' as const,
      capabilities,
    }));
  }

  getModelCapabilities(model: string): ModelCapabilities | null {
    return GROQ_MODELS[model] ?? null;
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
        if (options?.jsonMode && capabilities?.supportsJsonMode) {
          body.response_format = { type: 'json_object' };
        }

        // Handle streaming
        if (options?.onStream && capabilities?.supportsStreaming) {
          return this.handleStream(body, options.onStream, startTime, model, capabilities);
        }

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
          },
          options?.timeout
        );

        if (!response.ok) {
          throw await this.parseErrorResponse(response);
        }

        const data = await response.json() as GroqResponse;
        const latencyMs = Date.now() - startTime;

        const usage = {
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
        };

        this.trackUsage(usage);

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
    }, `Groq chat completion`);
  }

  private async handleStream(
    body: Record<string, unknown>,
    onStream: (chunk: string) => void,
    startTime: number,
    model: string,
    capabilities: ModelCapabilities | null
  ): Promise<LLMResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
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
      throw new LLMError('No response body', 'INVALID_RESPONSE', 'groq', false);
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
        return new LLMError('Groq authentication failed', 'AUTHENTICATION_FAILED', 'groq', false);
      }
      if (response.status === 429) {
        return new LLMError('Groq rate limit exceeded', 'RATE_LIMITED', 'groq', true);
      }

      return new LLMError(`Groq API error: ${message}`, 'UNKNOWN', 'groq', response.status >= 500);
    } catch {
      return new LLMError(`Groq API error (${response.status})`, 'UNKNOWN', 'groq', response.status >= 500);
    }
  }

  private handleError(error: unknown): LLMError {
    if (error instanceof Error && error.name === 'AbortError') {
      return new LLMError('Groq request timed out', 'TIMEOUT', 'groq', true, error);
    }
    return new LLMError(
      `Groq error: ${error instanceof Error ? error.message : String(error)}`,
      'UNKNOWN',
      'groq',
      false,
      error instanceof Error ? error : undefined
    );
  }

  private formatModelName(modelId: string): string {
    return modelId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace('Llama', 'LLaMA')
      .replace('It', 'Instruct');
  }
}
