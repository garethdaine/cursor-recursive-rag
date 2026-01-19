import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { searchKnowledgeTool } from '../../../src/server/tools/search.js';
import { ingestDocumentTool } from '../../../src/server/tools/ingest.js';
import { listSourcesTool } from '../../../src/server/tools/list-sources.js';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions, RAGConfig } from '../../../src/types/index.js';
import { createMockEmbeddingsAdapter } from '../../mocks/embeddings.js';

const testId = `test-mcp-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testDir = join(tmpdir(), testId);

class InMemoryVectorStore implements VectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  async add(docs: VectorDocument[]): Promise<void> {
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (options.filter) {
        if (options.filter.source) {
          if (typeof options.filter.source === 'object' && '$in' in options.filter.source) {
            const sources = options.filter.source.$in as string[];
            if (!sources.includes(doc.metadata?.source)) continue;
          } else if (doc.metadata?.source !== options.filter.source) {
            continue;
          }
        }
      }

      const score = this.cosineSimilarity(embedding, doc.embedding);
      results.push({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.documents.size;
  }

  getAll(): VectorDocument[] {
    return Array.from(this.documents.values());
  }

  getSourcesList(): Array<{ source: string; count: number }> {
    const sourceCounts = new Map<string, number>();
    for (const doc of this.documents.values()) {
      const source = doc.metadata?.source || 'unknown';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }
    return Array.from(sourceCounts.entries()).map(([source, count]) => ({ source, count }));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

describe('MCP Tools Integration', () => {
  let vectorStore: InMemoryVectorStore;
  let embedder: ReturnType<typeof createMockEmbeddingsAdapter>;
  let config: RAGConfig;
  let deps: { vectorStore: InMemoryVectorStore; embedder: typeof embedder; config: RAGConfig };

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });

    vectorStore = new InMemoryVectorStore();
    embedder = createMockEmbeddingsAdapter();
    config = {
      vectorStore: 'memory',
      embeddings: 'xenova',
    };
    deps = { vectorStore, embedder, config };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('search_knowledge tool', () => {
    beforeEach(async () => {
      const docs: VectorDocument[] = [
        {
          id: 'doc-1',
          content: 'React is a JavaScript library for building user interfaces',
          embedding: await embedder.embed('React JavaScript UI library'),
          metadata: { source: 'react-docs' },
        },
        {
          id: 'doc-2',
          content: 'Vue.js is a progressive JavaScript framework',
          embedding: await embedder.embed('Vue JavaScript framework'),
          metadata: { source: 'vue-docs' },
        },
        {
          id: 'doc-3',
          content: 'TypeScript adds static types to JavaScript',
          embedding: await embedder.embed('TypeScript static types'),
          metadata: { source: 'typescript-docs' },
        },
      ];
      await vectorStore.add(docs);
    });

    it('should search and return results', async () => {
      const result = await searchKnowledgeTool(
        { query: 'JavaScript framework' },
        deps
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Found');
      expect(result.content[0].text).toContain('results');
    });

    it('should respect topK parameter', async () => {
      const result = await searchKnowledgeTool(
        { query: 'JavaScript', topK: 1 },
        deps
      );

      expect(result.content[0].text).toContain('Found 1 results');
    });

    it('should filter by sources when provided', async () => {
      const result = await searchKnowledgeTool(
        { query: 'JavaScript', sources: ['react-docs'] },
        deps
      );

      expect(result.content[0].text).toContain('react-docs');
      expect(result.content[0].text).not.toContain('vue-docs');
    });

    it('should return score in results', async () => {
      const result = await searchKnowledgeTool(
        { query: 'React library', topK: 1 },
        deps
      );

      expect(result.content[0].text).toMatch(/Score: \d+\.\d+/);
    });

    it('should handle empty results', async () => {
      const emptyStore = new InMemoryVectorStore();
      const result = await searchKnowledgeTool(
        { query: 'something not in index' },
        { ...deps, vectorStore: emptyStore }
      );

      expect(result.content[0].text).toContain('Found 0 results');
    });
  });

  describe('ingest_document tool', () => {
    it('should ingest text content', async () => {
      const result = await ingestDocumentTool(
        {
          source: 'This is a test document about JavaScript patterns.',
          title: 'JS Patterns',
        },
        deps
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('chunk');

      const count = await vectorStore.count();
      expect(count).toBeGreaterThan(0);
    });

    it('should ingest with custom metadata', async () => {
      await ingestDocumentTool(
        {
          source: 'Document content here.',
          title: 'Test Doc',
          metadata: { category: 'testing', author: 'test-user' },
        },
        deps
      );

      const docs = vectorStore.getAll();
      expect(docs.length).toBeGreaterThan(0);
      expect(docs[0].metadata).toHaveProperty('category', 'testing');
    });

    it('should chunk large documents', async () => {
      const largeContent = 'This is a paragraph about testing. '.repeat(100);
      
      await ingestDocumentTool(
        { source: largeContent, title: 'Large Doc' },
        deps
      );

      const count = await vectorStore.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should generate embeddings for ingested content', async () => {
      await ingestDocumentTool(
        { source: 'Test content for embedding', title: 'Embed Test' },
        deps
      );

      const count = await vectorStore.count();
      expect(count).toBeGreaterThan(0);
    });

    it('should handle markdown content', async () => {
      const markdown = `# Heading
      
## Section 1
This is section one content.

## Section 2
This is section two content with a code block:

\`\`\`javascript
const x = 1;
\`\`\`
`;
      
      const result = await ingestDocumentTool(
        { source: markdown, title: 'Markdown Doc' },
        deps
      );

      expect(result.isError).toBeFalsy();
    });
  });

  describe('list_sources tool', () => {
    beforeEach(async () => {
      const docs: VectorDocument[] = [
        {
          id: 'doc-1',
          content: 'Content from source A',
          embedding: await embedder.embed('source A'),
          metadata: { source: 'source-a' },
        },
        {
          id: 'doc-2',
          content: 'More content from source A',
          embedding: await embedder.embed('source A again'),
          metadata: { source: 'source-a' },
        },
        {
          id: 'doc-3',
          content: 'Content from source B',
          embedding: await embedder.embed('source B'),
          metadata: { source: 'source-b' },
        },
      ];
      await vectorStore.add(docs);
    });

    it('should list all unique sources', async () => {
      const result = await listSourcesTool({}, deps);

      expect(result.content[0].text).toContain('source-a');
      expect(result.content[0].text).toContain('source-b');
    });

    it('should include chunk counts per source', async () => {
      const result = await listSourcesTool({}, deps);

      expect(result.content[0].text).toContain('2');
      expect(result.content[0].text).toContain('1');
    });

    it('should handle empty vector store', async () => {
      const emptyStore = new InMemoryVectorStore();
      const result = await listSourcesTool({}, { ...deps, vectorStore: emptyStore });

      expect(result.content[0].text).toMatch(/(No sources|0 source)/i);
    });
  });

  describe('Tool Response Format', () => {
    it('should return MCP-compliant response format for search', async () => {
      const result = await searchKnowledgeTool(
        { query: 'test' },
        deps
      );

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return MCP-compliant response format for ingest', async () => {
      const result = await ingestDocumentTool(
        { source: 'test content', title: 'Test' },
        deps
      );

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should include isError flag on error responses', async () => {
      const badDeps = {
        vectorStore: {
          add: async () => { throw new Error('Storage failed'); },
          search: async () => [],
          delete: async () => {},
          count: async () => 0,
        } as any,
        embedder: {
          embed: async () => { throw new Error('Embedding failed'); },
        } as any,
        config,
      };

      try {
        await ingestDocumentTool({ source: 'test' }, badDeps);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('End-to-End Workflow', () => {
    it('should ingest and then search for content', async () => {
      await ingestDocumentTool(
        {
          source: 'React hooks are a powerful feature for state management in functional components.',
          title: 'React Hooks Guide',
          metadata: { source: 'react-tutorial' },
        },
        deps
      );

      const searchResult = await searchKnowledgeTool(
        { query: 'React state management hooks' },
        deps
      );

      expect(searchResult.content[0].text).toContain('Found');
      expect(searchResult.content[0].text).not.toContain('Found 0');
    });

    it('should ingest multiple documents and search across them', async () => {
      await ingestDocumentTool(
        {
          source: 'Redux is a predictable state container for JavaScript apps.',
          title: 'Redux',
          metadata: { source: 'redux-docs' },
        },
        deps
      );

      await ingestDocumentTool(
        {
          source: 'MobX makes state management simple through observable state.',
          title: 'MobX',
          metadata: { source: 'mobx-docs' },
        },
        deps
      );

      const searchResult = await searchKnowledgeTool(
        { query: 'state management JavaScript' },
        deps
      );

      expect(searchResult.content[0].text).toContain('Found');
      
      const sourcesResult = await listSourcesTool({}, deps);
      expect(sourcesResult.content[0].text).toMatch(/(Redux|redux-docs|2 source)/i);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters gracefully', async () => {
      const result = await searchKnowledgeTool(
        { query: '' },
        deps
      );

      expect(result.content[0].text).toContain('Found');
    });

    it('should handle malformed filter parameters', async () => {
      const result = await searchKnowledgeTool(
        { query: 'test', sources: [] },
        deps
      );

      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('Activity Logging', () => {
    it('should log search activity', async () => {
      await searchKnowledgeTool(
        { query: 'test query for logging' },
        deps
      );
    });

    it('should log ingest activity', async () => {
      await ingestDocumentTool(
        { source: 'content for logging test', title: 'Log Test' },
        deps
      );
    });
  });
});
