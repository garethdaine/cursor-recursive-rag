import OpenAI from 'openai';
import type { Embedder } from './types.js';
import type { RAGConfig } from '../../types/index.js';

export class OpenAIAdapter implements Embedder {
  private client: OpenAI;
  private model = 'text-embedding-3-small';
  dimensions = 1536; // text-embedding-3-small dimensions

  constructor(config: RAGConfig) {
    const apiKey = config.apiKeys?.openai;
    if (!apiKey) {
      throw new Error('OpenAI API key is required for OpenAI embeddings');
    }

    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts
    });
    return response.data.map(item => item.embedding);
  }
}
