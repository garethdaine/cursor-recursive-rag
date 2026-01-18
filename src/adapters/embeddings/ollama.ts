import { Ollama } from 'ollama';
import type { Embedder } from './types.js';
import type { RAGConfig } from '../../types/index.js';

export class OllamaAdapter implements Embedder {
  private client: Ollama;
  private model: string;
  dimensions = 768; // nomic-embed-text default dimensions

  constructor(config: RAGConfig) {
    const baseUrl = config.apiKeys?.ollama?.baseUrl || 'http://localhost:11434';
    this.model = config.apiKeys?.ollama?.model || 'nomic-embed-text';

    this.client = new Ollama({
      host: baseUrl
    });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings({
      model: this.model,
      prompt: text
    });
    return response.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch embeddings, so do sequentially
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}
