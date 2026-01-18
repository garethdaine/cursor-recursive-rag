import { pipeline } from '@xenova/transformers';
import type { Embedder } from './types.js';
import type { RAGConfig } from '../../types/index.js';

export class XenovaAdapter implements Embedder {
  private model: any;
  dimensions = 384; // all-MiniLM-L6-v2 dimensions

  private constructor(model: any) {
    this.model = model;
  }

  static async create(config: RAGConfig): Promise<XenovaAdapter> {
    // Initialize the embedding model
    const model = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    return new XenovaAdapter(model);
  }

  async embed(text: string): Promise<number[]> {
    const output = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process in parallel
    const embeddings = await Promise.all(texts.map(text => this.embed(text)));
    return embeddings;
  }
}
