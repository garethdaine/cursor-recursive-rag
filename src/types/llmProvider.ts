/**
 * LLM Provider Types
 * 
 * Strategy pattern interfaces for multiple LLM backends.
 * Supports: OpenAI, Anthropic, DeepSeek, Groq, Ollama, OpenRouter, and Cursor AI.
 */

/**
 * Supported LLM provider types
 */
export type LLMProviderType = 
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'ollama'
  | 'openrouter'
  | 'cursor';

/**
 * Message role in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A single message in a conversation
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/**
 * Options for LLM completion requests
 */
export interface LLMCompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0-2) */
  temperature?: number;
  /** Top-p sampling */
  topP?: number;
  /** Stop sequences */
  stop?: string[];
  /** Force JSON output (if supported) */
  jsonMode?: boolean;
  /** Streaming callback */
  onStream?: (chunk: string) => void;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom headers for the request */
  headers?: Record<string, string>;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in USD (if available) */
  estimatedCost?: number;
}

/**
 * Response from an LLM completion request
 */
export interface LLMResponse {
  /** The generated content */
  content: string;
  /** The model that was used */
  model: string;
  /** Token usage statistics */
  usage?: TokenUsage;
  /** Time taken for the request in milliseconds */
  latencyMs: number;
  /** Whether the response was streamed */
  streamed: boolean;
  /** Finish reason (stop, length, etc.) */
  finishReason?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  /** Maximum context window size */
  contextLength: number;
  /** Supports vision/images */
  supportsVision: boolean;
  /** Supports function calling / tools */
  supportsFunctions: boolean;
  /** Supports JSON mode */
  supportsJsonMode: boolean;
  /** Supports streaming */
  supportsStreaming: boolean;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Cost per 1M input tokens in USD */
  inputCostPer1M?: number;
  /** Cost per 1M output tokens in USD */
  outputCostPer1M?: number;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProviderType;
  capabilities: ModelCapabilities;
}

/**
 * Base configuration for all LLM providers
 */
export interface BaseLLMProviderConfig {
  /** Provider type */
  provider: LLMProviderType;
  /** API key (if required) */
  apiKey?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Base URL override */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Rate limit (requests per minute) */
  rateLimit?: number;
  /** Enable cost tracking */
  trackCosts?: boolean;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIProviderConfig extends BaseLLMProviderConfig {
  provider: 'openai';
  apiKey: string;
  organization?: string;
}

/**
 * Anthropic-specific configuration
 */
export interface AnthropicProviderConfig extends BaseLLMProviderConfig {
  provider: 'anthropic';
  apiKey: string;
  anthropicVersion?: string;
}

/**
 * DeepSeek-specific configuration
 */
export interface DeepSeekProviderConfig extends BaseLLMProviderConfig {
  provider: 'deepseek';
  apiKey: string;
}

/**
 * Groq-specific configuration
 */
export interface GroqProviderConfig extends BaseLLMProviderConfig {
  provider: 'groq';
  apiKey: string;
}

/**
 * Ollama-specific configuration
 */
export interface OllamaProviderConfig extends BaseLLMProviderConfig {
  provider: 'ollama';
  /** Base URL (default: http://localhost:11434) */
  baseUrl?: string;
}

/**
 * OpenRouter-specific configuration
 */
export interface OpenRouterProviderConfig extends BaseLLMProviderConfig {
  provider: 'openrouter';
  apiKey: string;
  /** Site URL for attribution */
  siteUrl?: string;
  /** Site name for attribution */
  siteName?: string;
}

/**
 * Cursor AI-specific configuration (MCP-based)
 */
export interface CursorProviderConfig extends BaseLLMProviderConfig {
  provider: 'cursor';
  /** MCP endpoint URL */
  mcpEndpoint?: string;
}

/**
 * Union of all provider configurations
 */
export type LLMProviderConfig = 
  | OpenAIProviderConfig
  | AnthropicProviderConfig
  | DeepSeekProviderConfig
  | GroqProviderConfig
  | OllamaProviderConfig
  | OpenRouterProviderConfig
  | CursorProviderConfig;

/**
 * LLM Provider interface (Strategy Pattern)
 */
export interface LLMProvider {
  /** Provider type */
  readonly type: LLMProviderType;
  
  /** Provider name for display */
  readonly name: string;

  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get information about available models
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Get capabilities for a specific model
   */
  getModelCapabilities(model: string): ModelCapabilities | null;

  /**
   * Complete a single prompt
   */
  complete(
    prompt: string,
    options?: LLMCompletionOptions
  ): Promise<LLMResponse>;

  /**
   * Complete a conversation (chat format)
   */
  chat(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse>;

  /**
   * Get total tokens used
   */
  getTotalTokensUsed(): number;

  /**
   * Get estimated total cost
   */
  getTotalCost(): number;

  /**
   * Reset usage tracking
   */
  resetUsageTracking(): void;
}

/**
 * LLM Provider factory configuration
 */
export interface LLMProviderFactoryConfig {
  /** Primary provider to use */
  primary?: LLMProviderConfig;
  /** Fallback providers (in order of preference) */
  fallbacks?: LLMProviderConfig[];
  /** Auto-detect provider from environment */
  autoDetect?: boolean;
}

/**
 * LLM configuration file format (~/.cursor-rag/llm-config.json)
 */
export interface LLMConfigFile {
  /** Default provider to use */
  defaultProvider?: LLMProviderType;
  /** Provider-specific configurations */
  providers?: {
    openai?: Omit<OpenAIProviderConfig, 'provider'>;
    anthropic?: Omit<AnthropicProviderConfig, 'provider'>;
    deepseek?: Omit<DeepSeekProviderConfig, 'provider'>;
    groq?: Omit<GroqProviderConfig, 'provider'>;
    ollama?: Omit<OllamaProviderConfig, 'provider'>;
    openrouter?: Omit<OpenRouterProviderConfig, 'provider'>;
    cursor?: Omit<CursorProviderConfig, 'provider'>;
  };
  /** Fallback order */
  fallbackOrder?: LLMProviderType[];
}

/**
 * Error types for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly provider: LLMProviderType,
    public readonly retryable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export type LLMErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'CONTEXT_TOO_LONG'
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

/**
 * Environment variable names for API keys
 */
export const LLM_ENV_VARS = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: 'OLLAMA_BASE_URL',
  cursor: 'CURSOR_MCP_ENDPOINT',
} as const;

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.1-70b-versatile',
  ollama: 'llama3.2',
  openrouter: 'anthropic/claude-3.5-sonnet',
  cursor: 'cursor-ai',
};
