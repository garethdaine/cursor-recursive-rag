import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import type { VectorDocument } from '../../../src/types/index.js';

const testDir = join(tmpdir(), `test-memory-adapter-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock('../../../src/services/config.js', () => ({
  CONFIG_DIR: testDir,
}));

describe('MemoryAdapter', () => {
  let adapter: any;
  let MemoryAdapter: any;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    const module = await import('../../../src/adapters/vector/memory.js');
    MemoryAdapter = module.MemoryAdapter;
    adapter = new MemoryAdapter({ vectorStore: 'memory' } as any);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createDoc(id: string, content: string, embedding: number[]): VectorDocument {
    return {
      id,
      content,
      embedding,
      metadata: { source: 'test' },
    };
  }

  describe('add', () => {
    it('should add documents', async () => {
      const docs = [
        createDoc('doc-1', 'Hello world', [0.1, 0.2, 0.3]),
        createDoc('doc-2', 'Goodbye world', [0.4, 0.5, 0.6]),
      ];

      await adapter.add(docs);
      const count = await adapter.count();

      expect(count).toBe(2);
    });

    it('should overwrite document with same ID', async () => {
      await adapter.add([createDoc('doc-1', 'Original', [0.1, 0.2, 0.3])]);
      await adapter.add([createDoc('doc-1', 'Updated', [0.4, 0.5, 0.6])]);

      const count = await adapter.count();
      expect(count).toBe(1);
    });

    it('should persist to file', async () => {
      await adapter.add([createDoc('doc-1', 'Test', [0.1, 0.2, 0.3])]);

      const storagePath = join(testDir, 'memory-store.json');
      expect(existsSync(storagePath)).toBe(true);

      const data = JSON.parse(readFileSync(storagePath, 'utf-8'));
      expect(data['doc-1']).toBeDefined();
      expect(data['doc-1'].content).toBe('Test');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await adapter.add([
        createDoc('similar', 'Similar content', [1, 0, 0]),
        createDoc('different', 'Different content', [0, 1, 0]),
        createDoc('opposite', 'Opposite content', [-1, 0, 0]),
      ]);
    });

    it('should return results sorted by similarity', async () => {
      const results = await adapter.search([1, 0, 0], { topK: 3 });

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('similar');
      expect(results[0].score).toBeCloseTo(1, 5);
      expect(results[2].id).toBe('opposite');
      expect(results[2].score).toBeCloseTo(-1, 5);
    });

    it('should respect topK limit', async () => {
      const results = await adapter.search([1, 0, 0], { topK: 1 });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('similar');
    });

    it('should filter by source', async () => {
      await adapter.add([
        {
          id: 'other-source',
          content: 'Other source doc',
          embedding: [1, 0, 0],
          metadata: { source: 'other' },
        },
      ]);

      const results = await adapter.search([1, 0, 0], {
        topK: 10,
        filter: { source: 'test' },
      });

      expect(results.every(r => r.metadata?.source === 'test')).toBe(true);
      expect(results.map(r => r.id)).not.toContain('other-source');
    });

    it('should filter by multiple sources with $in', async () => {
      await adapter.add([
        {
          id: 'source-a',
          content: 'Source A',
          embedding: [1, 0, 0],
          metadata: { source: 'source-a' },
        },
        {
          id: 'source-b',
          content: 'Source B',
          embedding: [0.9, 0.1, 0],
          metadata: { source: 'source-b' },
        },
      ]);

      const results = await adapter.search([1, 0, 0], {
        topK: 10,
        filter: { source: { $in: ['source-a', 'source-b'] } },
      });

      expect(results.map(r => r.id)).toContain('source-a');
      expect(results.map(r => r.id)).toContain('source-b');
      expect(results.map(r => r.id)).not.toContain('similar');
    });

    it('should return content and metadata', async () => {
      const results = await adapter.search([1, 0, 0], { topK: 1 });

      expect(results[0].content).toBe('Similar content');
      expect(results[0].metadata).toEqual({ source: 'test' });
    });
  });

  describe('delete', () => {
    it('should delete documents by ID', async () => {
      await adapter.add([
        createDoc('keep', 'Keep this', [0.1, 0.2, 0.3]),
        createDoc('delete', 'Delete this', [0.4, 0.5, 0.6]),
      ]);

      await adapter.delete(['delete']);

      const count = await adapter.count();
      expect(count).toBe(1);

      const results = await adapter.search([0.4, 0.5, 0.6], { topK: 10 });
      expect(results.map(r => r.id)).not.toContain('delete');
    });

    it('should delete multiple documents', async () => {
      await adapter.add([
        createDoc('doc-1', 'Doc 1', [0.1, 0.2, 0.3]),
        createDoc('doc-2', 'Doc 2', [0.4, 0.5, 0.6]),
        createDoc('doc-3', 'Doc 3', [0.7, 0.8, 0.9]),
      ]);

      await adapter.delete(['doc-1', 'doc-2']);

      const count = await adapter.count();
      expect(count).toBe(1);
    });

    it('should handle deleting non-existent IDs gracefully', async () => {
      await adapter.add([createDoc('existing', 'Exists', [0.1, 0.2, 0.3])]);

      await expect(adapter.delete(['non-existent'])).resolves.not.toThrow();

      const count = await adapter.count();
      expect(count).toBe(1);
    });
  });

  describe('count', () => {
    it('should return 0 for empty store', async () => {
      const count = await adapter.count();
      expect(count).toBe(0);
    });

    it('should return correct count after adds and deletes', async () => {
      await adapter.add([
        createDoc('doc-1', 'Doc 1', [0.1, 0.2, 0.3]),
        createDoc('doc-2', 'Doc 2', [0.4, 0.5, 0.6]),
      ]);

      expect(await adapter.count()).toBe(2);

      await adapter.delete(['doc-1']);

      expect(await adapter.count()).toBe(1);
    });
  });

  describe('cosine similarity', () => {
    it('should return 1 for identical vectors', async () => {
      await adapter.add([createDoc('doc', 'Test', [1, 0, 0])]);
      const results = await adapter.search([1, 0, 0], { topK: 1 });

      expect(results[0].score).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', async () => {
      await adapter.add([createDoc('doc', 'Test', [1, 0, 0])]);
      const results = await adapter.search([0, 1, 0], { topK: 1 });

      expect(results[0].score).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', async () => {
      await adapter.add([createDoc('doc', 'Test', [1, 0, 0])]);
      const results = await adapter.search([-1, 0, 0], { topK: 1 });

      expect(results[0].score).toBeCloseTo(-1, 5);
    });
  });

  describe('persistence', () => {
    it('should load existing data on restart', async () => {
      await adapter.add([createDoc('persisted', 'Persisted doc', [0.1, 0.2, 0.3])]);

      const newAdapter = new MemoryAdapter({ vectorStore: 'memory' } as any);

      const count = await newAdapter.count();
      expect(count).toBe(1);

      const results = await newAdapter.search([0.1, 0.2, 0.3], { topK: 1 });
      expect(results[0].id).toBe('persisted');
    });
  });
});
