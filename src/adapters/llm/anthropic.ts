/**
 * Anthropic LLM Provider
 * 
 * Supports: Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus
 */

import { BaseLLMProvider } from './base.js';
import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  AnthropicProviderConfig,
} from '../../types/llmProvider.js';
import { LLMError } from '../../types/llmProvider.js';

/**
 * Anthropic model configurations
 */
const ANTHROPIC_MODELS: Record<string, ModelCapabilities> = {
  'claude-3-5-sonnet-20241022': {
    contextLength: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: false,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  'claude-3-5-haiku-20241022': {
    contextLength: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: false,
    supportsStreaming: true,
    maxOutputTokens: 8192,
    inputCostPer1M: 1,
    outputCostPer1M: 5,
  },
  'claude-3-opus-20240229': {
    contextLength: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJsonMode: false,
    supportsStreaming: true,
    maxOutputTokens: 4096,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
  },
};

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
  message?: AnthropicResponse;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class AnthropicProvider extends BaseLLMProvider {
  readonly type = 'anthropic' as const;
  readonly name = 'Anthropic';

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private anthropicVersion: string;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.model = config.defaultModel ?? 'claude-3-5-sonnet-20241022';
    this.anthropicVersion = config.anthropicVersion ?? '2023-06-01';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/messages`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model: this.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
        },
        5000
      );
      
      // 200 or 400 (validation error) means API is reachable
      return response.status === 200 || response.status === 400;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return Object.entries(ANTHROPIC_MODELS).map(([id, capabilities]) => ({
      id,
      name: this.formatModelName(id),
      provider: 'anthropic' as const,
      capabilities,
    }));
  }

  getModelCapabilities(model: string): ModelCapabilities | null {
    return ANTHROPIC_MODELS[model] ?? null;
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
        const { systemPrompt, conversationMessages } = this.formatMessages(messages);

        const body: Record<string, unknown> = {
          model,
          max_tokens: options?.maxTokens ?? capabilities?.maxOutputTokens ?? 4096,
          messages: conversationMessages,
        };

        if (systemPrompt) {
          body.system = systemPrompt;
        }

        if (options?.temperature !== undefined) {
          body.temperature = options.temperature;
        }
        if (options?.topP !== undefined) {
          body.top_p = options.topP;
        }
        if (options?.stop) {
          body.stop_sequences = options.stop;
        }

        // Handle streaming
        if (options?.onStream && capabilities?.supportsStreaming) {
          return this.handleStream(body, options.onStream, startTime, model);
        }

        const response = await this.fetchWithTimeout(
          `${this.baseUrl}/v1/messages`,
          {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(body),
          },
          options?.timeout
        );

        if (!response.ok) {
          throw await this.parseErrorResponse(response);
        }

        const data = await response.json() as AnthropicResponse;
        const latencyMs = Date.now() - startTime;

        const content = data.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');

        const usage = {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          estimatedCost: this.calculateCost(
            {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
            },
            capabilities?.inputCostPer1M,
            capabilities?.outputCostPer1M
          ),
        };

        this.trackUsage(usage);

        return {
          content,
          model: data.model,
          usage,
          latencyMs,
          streamed: false,
          finishReason: data.stop_reason ?? undefined,
        };

      } catch (error) {
        if (error instanceof LLMError) throw error;
        throw this.handleError(error);
      }
    }, `Anthropic chat completion`);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.anthropicVersion,
    };
  }

  private formatMessages(messages: LLMMessage[]): {
    systemPrompt: string | null;
    conversationMessages: AnthropicMessage[];
  } {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const systemPrompt = systemMessages.length > 0
      ? systemMessages.map(m => m.content).join('\n\n')
      : null;

    const conversationMessages: AnthropicMessage[] = otherMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    return { systemPrompt, conversationMessages };
  }

  private async handleStream(
    body: Record<string, unknown>,
    onStream: (chunk: string) => void,
    startTime: number,
    model: string
  ): Promise<LLMResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ ...body, stream: true }),
      }
    );

    if (!response.ok) {
      throw await this.parseErrorResponse(response);
    }

    let content = '';
    let finishReason: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new LLMError(
        'No response body for streaming',
        'INVALID_RESPONSE',
        'anthropic',
        false
      );
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
            const event: AnthropicStreamEvent = JSON.parse(jsonStr);
            
            if (event.type === 'content_block_delta' && event.delta?.text) {
              content += event.delta.text;
              onStream(event.delta.text);
            }
            
            if (event.type === 'message_delta' && event.delta?.stop_reason) {
              finishReason = event.delta.stop_reason;
            }
            
            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens;
            }
            
            if (event.type === 'message_delta' && event.usage?.output_tokens) {
              outputTokens = event.usage.output_tokens;
            }
          } catch {
            // Ignore malformed JSON in stream
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - startTime;
    const capabilities = this.getModelCapabilities(model);

    const usage = inputTokens || outputTokens ? {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: this.calculateCost(
        { promptTokens: inputTokens, completionTokens: outputTokens },
        capabilities?.inputCostPer1M,
        capabilities?.outputCostPer1M
      ),
    } : undefined;

    if (usage) this.trackUsage(usage);

    return {
      content,
      model,
      usage,
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
        return new LLMError(
          'Anthropic authentication failed - check your API key',
          'AUTHENTICATION_FAILED',
          'anthropic',
          false
        );
      }
      
      if (response.status === 429) {
        return new LLMError(
          'Anthropic rate limit exceeded',
          'RATE_LIMITED',
          'anthropic',
          true
        );
      }
      
      if (response.status === 400 && message.includes('context')) {
        return new LLMError(
          'Context too long for model',
          'CONTEXT_TOO_LONG',
          'anthropic',
          false
        );
      }

      return new LLMError(
        `Anthropic API error: ${message}`,
        'UNKNOWN',
        'anthropic',
        response.status >= 500
      );
    } catch {
      return new LLMError(
        `Anthropic API error (${response.status})`,
        'UNKNOWN',
        'anthropic',
        response.status >= 500
      );
    }
  }

  private handleError(error: unknown): LLMError {
    if (error instanceof Error && error.name === 'AbortError') {
      return new LLMError(
        'Anthropic request timed out',
        'TIMEOUT',
        'anthropic',
        true,
        error
      );
    }

    return new LLMError(
      `Anthropic error: ${error instanceof Error ? error.message : String(error)}`,
      'UNKNOWN',
      'anthropic',
      false,
      error instanceof Error ? error : undefined
    );
  }

  private formatModelName(modelId: string): string {
    const parts = modelId.split('-');
    if (parts.length >= 3) {
      const version = parts.slice(0, 3).join(' ');
      return version.replace(/(\d+)/, ' $1').replace(/\s+/g, ' ').trim();
    }
    return modelId;
  }
}
