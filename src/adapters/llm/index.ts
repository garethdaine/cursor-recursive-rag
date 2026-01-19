/**
 * LLM Provider Factory
 * 
 * Creates and manages LLM providers with auto-detection, fallback chains,
 * and configuration from environment variables and config files.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type {
  LLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  LLMConfigFile,
  LLMProviderFactoryConfig,
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
} from '../../types/llmProvider.js';
import { LLMError, LLM_ENV_VARS, DEFAULT_MODELS } from '../../types/llmProvider.js';

import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { DeepSeekProvider } from './deepseek.js';
import { GroqProvider } from './groq.js';
import { OllamaProvider } from './ollama.js';
import { OpenRouterProvider } from './openrouter.js';

// Re-export provider classes
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { DeepSeekProvider } from './deepseek.js';
export { GroqProvider } from './groq.js';
export { OllamaProvider } from './ollama.js';
export { OpenRouterProvider } from './openrouter.js';
export { BaseLLMProvider } from './base.js';

/**
 * Create a provider from configuration
 */
export function createProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'deepseek':
      return new DeepSeekProvider(config);
    case 'groq':
      return new GroqProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'cursor':
      // Cursor provider not yet implemented - fall back to Ollama
      console.warn('Cursor AI provider not yet implemented, falling back to Ollama');
      return new OllamaProvider({ provider: 'ollama', defaultModel: 'llama3.2' });
    default:
      throw new Error(`Unknown provider: ${(config as { provider: string }).provider}`);
  }
}

/**
 * Load LLM configuration from file
 */
function loadConfigFile(): LLMConfigFile | null {
  const configPath = join(homedir(), '.cursor-rag', 'llm-config.json');
  
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load LLM config from ${configPath}:`, error);
    return null;
  }
}

/**
 * Detect available providers from environment variables
 */
function detectProvidersFromEnv(): LLMProviderConfig[] {
  const providers: LLMProviderConfig[] = [];

  if (process.env[LLM_ENV_VARS.openai]) {
    providers.push({
      provider: 'openai',
      apiKey: process.env[LLM_ENV_VARS.openai]!,
      defaultModel: DEFAULT_MODELS.openai,
    });
  }

  if (process.env[LLM_ENV_VARS.anthropic]) {
    providers.push({
      provider: 'anthropic',
      apiKey: process.env[LLM_ENV_VARS.anthropic]!,
      defaultModel: DEFAULT_MODELS.anthropic,
    });
  }

  if (process.env[LLM_ENV_VARS.deepseek]) {
    providers.push({
      provider: 'deepseek',
      apiKey: process.env[LLM_ENV_VARS.deepseek]!,
      defaultModel: DEFAULT_MODELS.deepseek,
    });
  }

  if (process.env[LLM_ENV_VARS.groq]) {
    providers.push({
      provider: 'groq',
      apiKey: process.env[LLM_ENV_VARS.groq]!,
      defaultModel: DEFAULT_MODELS.groq,
    });
  }

  if (process.env[LLM_ENV_VARS.openrouter]) {
    providers.push({
      provider: 'openrouter',
      apiKey: process.env[LLM_ENV_VARS.openrouter]!,
      defaultModel: DEFAULT_MODELS.openrouter,
    });
  }

  // Ollama is always available as a fallback (no API key required)
  providers.push({
    provider: 'ollama',
    baseUrl: process.env[LLM_ENV_VARS.ollama] ?? 'http://localhost:11434',
    defaultModel: DEFAULT_MODELS.ollama,
  });

  return providers;
}

/**
 * Build provider config from config file
 */
function buildConfigFromFile(config: LLMConfigFile): LLMProviderConfig[] {
  const providers: LLMProviderConfig[] = [];
  const providerConfigs = config.providers ?? {};

  if (providerConfigs.openai?.apiKey) {
    providers.push({
      provider: 'openai',
      ...providerConfigs.openai,
    });
  }

  if (providerConfigs.anthropic?.apiKey) {
    providers.push({
      provider: 'anthropic',
      ...providerConfigs.anthropic,
    });
  }

  if (providerConfigs.deepseek?.apiKey) {
    providers.push({
      provider: 'deepseek',
      ...providerConfigs.deepseek,
    });
  }

  if (providerConfigs.groq?.apiKey) {
    providers.push({
      provider: 'groq',
      ...providerConfigs.groq,
    });
  }

  if (providerConfigs.openrouter?.apiKey) {
    providers.push({
      provider: 'openrouter',
      ...providerConfigs.openrouter,
    });
  }

  // Ollama from config or fallback
  providers.push({
    provider: 'ollama',
    baseUrl: providerConfigs.ollama?.baseUrl ?? 'http://localhost:11434',
    defaultModel: providerConfigs.ollama?.defaultModel ?? DEFAULT_MODELS.ollama,
  });

  // Reorder based on fallback order if specified
  if (config.fallbackOrder) {
    const ordered: LLMProviderConfig[] = [];
    for (const providerType of config.fallbackOrder) {
      const found = providers.find(p => p.provider === providerType);
      if (found) {
        ordered.push(found);
      }
    }
    // Add any remaining providers
    for (const p of providers) {
      if (!ordered.includes(p)) {
        ordered.push(p);
      }
    }
    return ordered;
  }

  // Move default provider to front
  if (config.defaultProvider) {
    const defaultIndex = providers.findIndex(p => p.provider === config.defaultProvider);
    if (defaultIndex > 0) {
      const [defaultProvider] = providers.splice(defaultIndex, 1);
      providers.unshift(defaultProvider);
    }
  }

  return providers;
}

/**
 * LLM Provider Manager with fallback support
 */
export class LLMProviderManager implements LLMProvider {
  readonly type: LLMProviderType;
  readonly name: string;

  private providers: LLMProvider[] = [];
  private primaryProvider: LLMProvider;
  private totalTokens: number = 0;
  private totalCost: number = 0;

  constructor(configs: LLMProviderConfig[]) {
    if (configs.length === 0) {
      throw new Error('At least one provider configuration is required');
    }

    this.providers = configs.map(c => createProvider(c));
    this.primaryProvider = this.providers[0];
    this.type = this.primaryProvider.type;
    this.name = `${this.primaryProvider.name} (with ${this.providers.length - 1} fallbacks)`;
  }

  async isAvailable(): Promise<boolean> {
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        return true;
      }
    }
    return false;
  }

  async listModels() {
    return this.primaryProvider.listModels();
  }

  getModelCapabilities(model: string) {
    return this.primaryProvider.getModelCapabilities(model);
  }

  async complete(prompt: string, options?: LLMCompletionOptions): Promise<LLMResponse> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMResponse> {
    let lastError: Error | undefined;

    for (const provider of this.providers) {
      try {
        if (!(await provider.isAvailable())) {
          continue;
        }

        const response = await provider.chat(messages, options);
        
        // Track usage
        if (response.usage) {
          this.totalTokens += response.usage.totalTokens;
          this.totalCost += response.usage.estimatedCost ?? 0;
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on authentication or context errors
        if (error instanceof LLMError && !error.retryable) {
          console.warn(`Provider ${provider.name} failed with non-retryable error: ${error.message}`);
          continue;
        }

        console.warn(`Provider ${provider.name} failed, trying next: ${lastError.message}`);
      }
    }

    throw lastError ?? new LLMError(
      'All providers failed',
      'PROVIDER_UNAVAILABLE',
      this.type,
      false
    );
  }

  getTotalTokensUsed(): number {
    return this.totalTokens;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  resetUsageTracking(): void {
    this.totalTokens = 0;
    this.totalCost = 0;
    for (const provider of this.providers) {
      provider.resetUsageTracking();
    }
  }

  /**
   * Get the primary provider
   */
  getPrimaryProvider(): LLMProvider {
    return this.primaryProvider;
  }

  /**
   * Get all configured providers
   */
  getAllProviders(): LLMProvider[] {
    return this.providers;
  }

  /**
   * Switch primary provider
   */
  setPrimaryProvider(providerType: LLMProviderType): boolean {
    const provider = this.providers.find(p => p.type === providerType);
    if (provider) {
      this.primaryProvider = provider;
      return true;
    }
    return false;
  }
}

/**
 * Get or create the default LLM provider manager
 */
let defaultManager: LLMProviderManager | null = null;

export function getLLMProvider(config?: LLMProviderFactoryConfig): LLMProviderManager {
  // Return cached manager if no specific config requested
  if (!config && defaultManager) {
    return defaultManager;
  }

  let providers: LLMProviderConfig[] = [];

  if (config?.primary) {
    providers.push(config.primary);
  }

  if (config?.fallbacks) {
    providers.push(...config.fallbacks);
  }

  // Auto-detect if no explicit config or autoDetect is enabled
  if (providers.length === 0 || config?.autoDetect !== false) {
    const configFile = loadConfigFile();
    
    if (configFile) {
      const fileProviders = buildConfigFromFile(configFile);
      // Merge with explicit providers (explicit takes priority)
      for (const fp of fileProviders) {
        if (!providers.some(p => p.provider === fp.provider)) {
          providers.push(fp);
        }
      }
    } else {
      const envProviders = detectProvidersFromEnv();
      for (const ep of envProviders) {
        if (!providers.some(p => p.provider === ep.provider)) {
          providers.push(ep);
        }
      }
    }
  }

  if (providers.length === 0) {
    // Always fall back to Ollama
    providers.push({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.2',
    });
  }

  const manager = new LLMProviderManager(providers);

  // Cache as default if no specific config
  if (!config) {
    defaultManager = manager;
  }

  return manager;
}

/**
 * Create a single provider directly (without fallbacks)
 */
export function createSingleProvider(
  providerType: LLMProviderType,
  config?: Partial<LLMProviderConfig>
): LLMProvider {
  const envKey = LLM_ENV_VARS[providerType];
  const apiKey = config?.apiKey ?? (envKey ? process.env[envKey] : undefined);

  const fullConfig: LLMProviderConfig = {
    provider: providerType,
    apiKey,
    defaultModel: config?.defaultModel ?? DEFAULT_MODELS[providerType],
    baseUrl: config?.baseUrl,
    timeout: config?.timeout,
    maxRetries: config?.maxRetries,
    rateLimit: config?.rateLimit,
    trackCosts: config?.trackCosts,
  } as LLMProviderConfig;

  return createProvider(fullConfig);
}

/**
 * Check which providers are available
 */
export async function checkAvailableProviders(): Promise<Record<LLMProviderType, boolean>> {
  const results: Record<LLMProviderType, boolean> = {
    openai: false,
    anthropic: false,
    deepseek: false,
    groq: false,
    ollama: false,
    openrouter: false,
    cursor: false,
  };

  const checks = Object.keys(results).map(async (providerType) => {
    try {
      const provider = createSingleProvider(providerType as LLMProviderType);
      results[providerType as LLMProviderType] = await provider.isAvailable();
    } catch {
      results[providerType as LLMProviderType] = false;
    }
  });

  await Promise.all(checks);
  return results;
}

// Re-export types
export type {
  LLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  LLMConfigFile,
  LLMMessage,
  LLMCompletionOptions,
  LLMResponse,
  ModelInfo,
  ModelCapabilities,
  TokenUsage,
} from '../../types/llmProvider.js';

export { LLMError, LLM_ENV_VARS, DEFAULT_MODELS } from '../../types/llmProvider.js';
