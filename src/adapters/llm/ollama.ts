/**
 * Ollama LLM Provider
 * 
 * Local model inference with no API key required.
 * Supports any model available in Ollama.
 */

import { Ollama } from 'ollama';
import { BaseLLMProvider } from './base.js';
import type {
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  OllamaProviderConfig,
} from '../../types/llmProvider.js';
import { LLMError } from '../../types/llmProvider.js';

/**
 * Common Ollama model configurations
 */
const OLLAMA_MODELS: Record<string, Partial<ModelCapabilities>> = {
  'llama3.2': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'llama3.2:3b': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'llama3.1': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'llama3.1:70b': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'codellama': {
    contextLength: 16384,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: false,
    supportsStreaming: true,
  },
  'deepseek-coder-v2': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'qwen2.5-coder': {
    contextLength: 32768,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'mistral': {
    contextLength: 32768,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'mixtral': {
    contextLength: 32768,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'phi3': {
    contextLength: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  'gemma2': {
    contextLength: 8192,
    supportsVision: false,
    supportsFunctions: false,
    supportsJsonMode: true,
    supportsStreaming: true,
  },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  contextLength: 8192,
  supportsVision: false,
  supportsFunctions: false,
  supportsJsonMode: false,
  supportsStreaming: true,
  inputCostPer1M: 0, // Free (local)
  outputCostPer1M: 0,
};

export class OllamaProvider extends BaseLLMProvider {
  readonly type = 'ollama' as const;
  readonly name = 'Ollama';

  private client: Ollama;
  private model: string;
  private availableModels: string[] = [];

  constructor(config: OllamaProviderConfig) {
    super(config);
    this.model = config.defaultModel ?? 'llama3.2';
    this.client = new Ollama({
      host: config.baseUrl ?? 'http://localhost:11434',
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const models = await this.client.list();
      this.availableModels = models.models.map(m => m.name);
      return this.availableModels.length > 0;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const models = await this.client.list();
      this.availableModels = models.models.map(m => m.name);
      
      return models.models.map(m => {
        const baseName = m.name.split(':')[0];
        const knownCapabilities = OLLAMA_MODELS[baseName] ?? OLLAMA_MODELS[m.name];
        
        return {
          id: m.name,
          name: m.name,
          provider: 'ollama' as const,
          capabilities: {
            ...DEFAULT_CAPABILITIES,
            ...knownCapabilities,
          },
        };
      });
    } catch {
      return [];
    }
  }

  getModelCapabilities(model: string): ModelCapabilities | null {
    const baseName = model.split(':')[0];
    const known = OLLAMA_MODELS[baseName] ?? OLLAMA_MODELS[model];
    
    return {
      ...DEFAULT_CAPABILITIES,
      ...known,
    };
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
        const ollamaMessages = messages.map(m => ({
          role: m.role,
          content: m.content,
        }));

        const requestOptions: Record<string, unknown> = {};
        if (options?.temperature !== undefined) {
          requestOptions.temperature = options.temperature;
        }
        if (options?.topP !== undefined) {
          requestOptions.top_p = options.topP;
        }
        if (options?.stop) {
          requestOptions.stop = options.stop;
        }
        if (options?.maxTokens) {
          requestOptions.num_predict = options.maxTokens;
        }

        // Handle streaming
        if (options?.onStream && capabilities?.supportsStreaming) {
          return this.handleStream(model, ollamaMessages, requestOptions, options.onStream, startTime);
        }

        // Non-streaming request
        const response = await this.client.chat({
          model,
          messages: ollamaMessages,
          options: requestOptions,
          stream: false,
        });

        const latencyMs = Date.now() - startTime;

        // Ollama returns token counts in eval_count and prompt_eval_count
        const usage = {
          promptTokens: response.prompt_eval_count ?? 0,
          completionTokens: response.eval_count ?? 0,
          totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
          estimatedCost: 0, // Free (local)
        };

        this.trackUsage(usage);

        return {
          content: response.message.content,
          model,
          usage,
          latencyMs,
          streamed: false,
          finishReason: response.done ? 'stop' : undefined,
        };

      } catch (error) {
        throw this.handleError(error);
      }
    }, `Ollama chat completion`);
  }

  private async handleStream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    requestOptions: Record<string, unknown>,
    onStream: (chunk: string) => void,
    startTime: number
  ): Promise<LLMResponse> {
    let content = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = await this.client.chat({
      model,
      messages,
      options: requestOptions,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.message?.content) {
        content += chunk.message.content;
        onStream(chunk.message.content);
      }
      
      if (chunk.prompt_eval_count) {
        promptTokens = chunk.prompt_eval_count;
      }
      if (chunk.eval_count) {
        completionTokens = chunk.eval_count;
      }
    }

    const latencyMs = Date.now() - startTime;

    const usage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost: 0,
    };

    this.trackUsage(usage);

    return {
      content,
      model,
      usage,
      latencyMs,
      streamed: true,
      finishReason: 'stop',
    };
  }

  private handleError(error: unknown): LLMError {
    const message = error instanceof Error ? error.message : String(error);
    
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return new LLMError(
        'Ollama is not running. Start it with: ollama serve',
        'PROVIDER_UNAVAILABLE',
        'ollama',
        true,
        error instanceof Error ? error : undefined
      );
    }

    if (message.includes('model') && message.includes('not found')) {
      return new LLMError(
        `Model not found. Pull it with: ollama pull ${this.model}`,
        'MODEL_NOT_FOUND',
        'ollama',
        false,
        error instanceof Error ? error : undefined
      );
    }

    return new LLMError(
      `Ollama error: ${message}`,
      'UNKNOWN',
      'ollama',
      false,
      error instanceof Error ? error : undefined
    );
  }
}
