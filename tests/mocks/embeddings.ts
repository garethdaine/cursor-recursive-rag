import { vi } from 'vitest';
import type { EmbeddingsAdapter, EmbeddingsConfig } from '../../src/adapters/embeddings/types.js';

export interface MockEmbeddingsOptions {
  dimension?: number;
  fixedEmbedding?: number[];
  embedFn?: (text: string) => Promise<number[]>;
}

export function createMockEmbeddingsAdapter(
  options: MockEmbeddingsOptions = {}
): EmbeddingsAdapter {
  const { dimension = 384, fixedEmbedding, embedFn } = options;

  const defaultEmbed = async (text: string): Promise<number[]> => {
    if (fixedEmbedding) {
      return fixedEmbedding;
    }
    const hash = simpleHash(text);
    const random = seededRandom(hash);
    return Array.from({ length: dimension }, () => random() * 2 - 1);
  };

  const embed = embedFn || defaultEmbed;

  return {
    embed: vi.fn(embed),
    embedBatch: vi.fn(async (texts: string[]) => {
      return Promise.all(texts.map(embed));
    }),
    getDimension: vi.fn(() => dimension),
    getConfig: vi.fn((): EmbeddingsConfig => ({
      provider: 'mock',
      model: 'mock-embedding-model',
      dimension,
    })),
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export const mockEmbeddingsAdapter = createMockEmbeddingsAdapter();
