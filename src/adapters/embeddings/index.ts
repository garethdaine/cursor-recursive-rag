import type { Embedder } from './types.js';
import { XenovaAdapter } from './xenova.js';
import { OpenAIAdapter } from './openai.js';
import { OllamaAdapter } from './ollama.js';
import type { RAGConfig } from '../../types/index.js';

export { Embedder } from './types.js';

export async function createEmbedder(type: string, config: RAGConfig): Promise<Embedder> {
  switch (type) {
    case 'xenova':
      return await XenovaAdapter.create(config);
    case 'openai':
      return new OpenAIAdapter(config);
    case 'ollama':
      return new OllamaAdapter(config);
    default:
      throw new Error(`Unknown embedder: ${type}`);
  }
}
