import { vi } from 'vitest';
import type { LLMProvider, LLMResponse, LLMMessage } from '../../src/types/llmProvider.js';

export interface MockLLMOptions {
  defaultResponse?: string;
  responses?: Map<string, string>;
  responseFn?: (messages: LLMMessage[]) => Promise<string>;
  shouldFail?: boolean;
  failureError?: Error;
  tokenUsage?: { input: number; output: number };
}

export function createMockLLMProvider(options: MockLLMOptions = {}): LLMProvider {
  const {
    defaultResponse = 'Mock LLM response',
    responses = new Map(),
    responseFn,
    shouldFail = false,
    failureError = new Error('Mock LLM failure'),
    tokenUsage = { input: 100, output: 50 },
  } = options;

  const generateResponse = async (messages: LLMMessage[]): Promise<string> => {
    if (shouldFail) {
      throw failureError;
    }

    if (responseFn) {
      return responseFn(messages);
    }

    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content || '';

    for (const [key, value] of responses) {
      if (content.includes(key)) {
        return value;
      }
    }

    return defaultResponse;
  };

  return {
    chat: vi.fn(async (messages: LLMMessage[]): Promise<LLMResponse> => {
      const content = await generateResponse(messages);
      return {
        content,
        model: 'mock-model',
        usage: {
          inputTokens: tokenUsage.input,
          outputTokens: tokenUsage.output,
          totalTokens: tokenUsage.input + tokenUsage.output,
        },
        finishReason: 'stop',
      };
    }),

    complete: vi.fn(async (prompt: string): Promise<LLMResponse> => {
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const content = await generateResponse(messages);
      return {
        content,
        model: 'mock-model',
        usage: {
          inputTokens: tokenUsage.input,
          outputTokens: tokenUsage.output,
          totalTokens: tokenUsage.input + tokenUsage.output,
        },
        finishReason: 'stop',
      };
    }),

    isAvailable: vi.fn(async (): Promise<boolean> => !shouldFail),

    getModel: vi.fn(() => 'mock-model'),

    getProvider: vi.fn(() => 'mock'),

    getConfig: vi.fn(() => ({
      provider: 'mock' as const,
      model: 'mock-model',
      maxTokens: 4096,
      temperature: 0.7,
    })),
  };
}

export function createMockLLMWithJSONResponse<T>(
  responseData: T
): LLMProvider {
  return createMockLLMProvider({
    responseFn: async () => JSON.stringify(responseData),
  });
}

export const mockLLMProvider = createMockLLMProvider();
