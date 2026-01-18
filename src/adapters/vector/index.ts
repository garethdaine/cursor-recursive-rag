import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../types/index.js';
import { ChromaAdapter } from './chroma.js';
import { QdrantAdapter } from './qdrant.js';
import { VectorizeAdapter } from './vectorize.js';
import type { RAGConfig } from '../../types/index.js';

export { VectorStore, VectorDocument, SearchResult, SearchOptions };

export function createVectorStore(type: string, config: RAGConfig): VectorStore {
  switch (type) {
    case 'chroma':
      return new ChromaAdapter(config);
    case 'qdrant':
      return new QdrantAdapter(config);
    case 'vectorize':
      return new VectorizeAdapter(config);
    default:
      throw new Error(`Unknown vector store: ${type}`);
  }
}
