import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../types/index.js';
import type { RAGConfig } from '../../types/index.js';
import { CONFIG_DIR } from '../../services/config.js';

/**
 * Simple file-based vector store for local development and testing.
 * No external dependencies required.
 * 
 * Data is persisted to ~/.cursor-rag/memory-store.json
 */
export class MemoryAdapter implements VectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private storagePath: string;
  private loaded = false;

  constructor(_config: RAGConfig) {
    this.storagePath = join(CONFIG_DIR, 'memory-store.json');
  }

  private load(): void {
    if (this.loaded) return;
    
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf-8'));
        this.documents = new Map(Object.entries(data));
      }
    } catch {
      // Start fresh if file is corrupted
      this.documents = new Map();
    }
    this.loaded = true;
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.documents);
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save memory store:', error);
    }
  }

  async add(docs: VectorDocument[]): Promise<void> {
    this.load();
    
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }
    
    this.save();
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    this.load();
    
    const results: Array<{ doc: VectorDocument; score: number }> = [];
    
    for (const doc of this.documents.values()) {
      // Apply source filter if provided
      if (options.filter?.source) {
        const filterSources = options.filter.source.$in || [options.filter.source];
        if (!filterSources.includes(doc.metadata?.source)) {
          continue;
        }
      }
      
      const score = this.cosineSimilarity(embedding, doc.embedding);
      results.push({ doc, score });
    }
    
    // Sort by score descending and take top K
    results.sort((a, b) => b.score - a.score);
    const topK = results.slice(0, options.topK || 10);
    
    return topK.map(r => ({
      id: r.doc.id,
      content: r.doc.content,
      metadata: r.doc.metadata,
      score: r.score
    }));
  }

  async delete(ids: string[]): Promise<void> {
    this.load();
    
    for (const id of ids) {
      this.documents.delete(id);
    }
    
    this.save();
  }

  async count(): Promise<number> {
    this.load();
    return this.documents.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    
    return dotProduct / magnitude;
  }
}
