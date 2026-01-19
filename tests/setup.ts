import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mockEmbeddingsAdapter } from './mocks/embeddings.js';
import { mockVectorStore } from './mocks/vectorStore.js';
import { mockLLMProvider } from './mocks/llmProvider.js';

export { mockEmbeddingsAdapter, mockVectorStore, mockLLMProvider };

const openDatabases: Set<{ close: () => void }> = new Set();

export function registerDatabase(db: { close: () => void }) {
  openDatabases.add(db);
}

export function unregisterDatabase(db: { close: () => void }) {
  openDatabases.delete(db);
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CURSOR_RAG_DATA_DIR', '/tmp/cursor-rag-test');
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  for (const db of openDatabases) {
    try {
      db.close();
    } catch {
      // Ignore errors during cleanup
    }
  }
  openDatabases.clear();
  
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  
  await new Promise(resolve => setTimeout(resolve, 100));
});

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'test' | 'development' | 'production';
      CURSOR_RAG_DATA_DIR: string;
    }
  }
}
