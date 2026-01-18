import { ChromaClient } from 'chromadb';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../types/index.js';
import type { RAGConfig } from '../../types/index.js';
import { CONFIG_DIR } from '../../services/config.js';
import { join } from 'path';

export class ChromaAdapter implements VectorStore {
  private client: ChromaClient;
  private collection: any;
  private collectionName = 'cursor-rag-knowledge-base';

  constructor(config: RAGConfig) {
    // ChromaDB stores data locally
    const dataPath = join(CONFIG_DIR, 'chroma-data');
    this.client = new ChromaClient({
      path: dataPath
    });
  }

  async initialize(): Promise<void> {
    if (!this.collection) {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 'hnsw:space': 'cosine' }
      });
    }
  }

  async add(docs: VectorDocument[]): Promise<void> {
    await this.initialize();

    const ids = docs.map(d => d.id);
    const embeddings = docs.map(d => d.embedding);
    const documents = docs.map(d => d.content);
    const metadatas = docs.map(d => d.metadata);

    await this.collection.add({
      ids,
      embeddings,
      documents,
      metadatas
    });
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    await this.initialize();

    const results = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults: options.topK,
      where: options.filter || undefined
    });

    // Transform Chroma results to our format
    const searchResults: SearchResult[] = [];
    if (results.ids && results.ids[0] && results.documents && results.documents[0]) {
      const ids = results.ids[0];
      const documents = results.documents[0];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        // Convert distance to similarity score (1 - distance for cosine similarity)
        const score = 1 - (distances[i] || 0);
        searchResults.push({
          id: ids[i],
          content: documents[i],
          metadata: metadatas[i] || {},
          score
        });
      }
    }

    return searchResults;
  }

  async delete(ids: string[]): Promise<void> {
    await this.initialize();
    await this.collection.delete({ ids });
  }

  async count(): Promise<number> {
    await this.initialize();
    const count = await this.collection.count();
    return count;
  }
}
