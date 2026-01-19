import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { EnhancedVectorStore, DEFAULT_SCORE_WEIGHTS } from '../../src/services/enhancedVectorStore.js';
import { MemoryMetadataStore } from '../../src/services/memoryMetadataStore.js';
import { DecayCalculator } from '../../src/services/decayCalculator.js';
import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../src/types/index.js';
import type { ChunkType } from '../../src/types/memory.js';

const testId = `test-vector-metadata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        const matches = Object.entries(options.filter).every(([key, value]) => {
          return doc.metadata?.[key] === value;
        });
        if (!matches) continue;
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

function createDocument(
  id: string,
  content: string,
  embedding: number[],
  metadata: Record<string, any> = {}
): VectorDocument {
  return {
    id,
    content,
    embedding,
    metadata: { source: 'test', ...metadata },
  };
}

describe('EnhancedVectorStore + MemoryMetadataStore Integration', () => {
  let vectorStore: InMemoryVectorStore;
  let metadataStore: MemoryMetadataStore;
  let enhancedStore: EnhancedVectorStore;
  let dbPath: string;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'metadata.db');

    vectorStore = new InMemoryVectorStore();
    metadataStore = new MemoryMetadataStore(dbPath);
    enhancedStore = new EnhancedVectorStore(vectorStore, { metadataStore });
  });

  afterEach(() => {
    metadataStore.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Upsert Operations', () => {
    it('should store documents in both vector and metadata stores', async () => {
      const docs = [
        createDocument('doc-1', 'Hello world', [1, 0, 0]),
        createDocument('doc-2', 'Goodbye world', [0, 1, 0]),
      ];

      await enhancedStore.add(docs);

      const vectorCount = await vectorStore.count();
      expect(vectorCount).toBe(2);

      const metadata1 = metadataStore.getChunkMetadata('doc-1');
      const metadata2 = metadataStore.getChunkMetadata('doc-2');

      expect(metadata1).not.toBeNull();
      expect(metadata2).not.toBeNull();
      expect(metadata1!.chunkId).toBe('doc-1');
      expect(metadata2!.chunkId).toBe('doc-2');
    });

    it('should store chunk type from document metadata', async () => {
      const docs = [
        createDocument('solution-1', 'Solution content', [1, 0, 0], { chunkType: 'solution' }),
        createDocument('pattern-1', 'Pattern content', [0, 1, 0], { chunkType: 'pattern' }),
      ];

      await enhancedStore.add(docs);

      const solutionMeta = metadataStore.getChunkMetadata('solution-1');
      const patternMeta = metadataStore.getChunkMetadata('pattern-1');

      expect(solutionMeta!.chunkType).toBe('solution');
      expect(patternMeta!.chunkType).toBe('pattern');
    });

    it('should store importance from document metadata', async () => {
      const docs = [
        createDocument('high', 'High importance', [1, 0, 0], { importance: 0.9 }),
        createDocument('low', 'Low importance', [0, 1, 0], { importance: 0.2 }),
      ];

      await enhancedStore.add(docs);

      const highMeta = metadataStore.getChunkMetadata('high');
      const lowMeta = metadataStore.getChunkMetadata('low');

      expect(highMeta!.importance).toBe(0.9);
      expect(lowMeta!.importance).toBe(0.2);
    });

    it('should use default values when metadata not provided', async () => {
      const docs = [createDocument('default', 'Default metadata', [1, 0, 0])];

      await enhancedStore.add(docs);

      const metadata = metadataStore.getChunkMetadata('default');
      expect(metadata!.chunkType).toBe('documentation');
      expect(metadata!.importance).toBe(0.5);
      expect(metadata!.decayScore).toBe(1.0);
      expect(metadata!.isArchived).toBe(false);
    });
  });

  describe('Search with Metadata Enrichment', () => {
    beforeEach(async () => {
      const docs = [
        createDocument('recent', 'Recent document', [1, 0, 0], { importance: 0.8 }),
        createDocument('old', 'Old document', [0.9, 0.1, 0], { importance: 0.5 }),
        createDocument('irrelevant', 'Irrelevant document', [0, 1, 0], { importance: 0.3 }),
      ];
      await enhancedStore.add(docs);
    });

    it('should return results with decay scores', async () => {
      const results = await enhancedStore.search([1, 0, 0], { topK: 2 });

      expect(results).toHaveLength(2);
      expect(results[0].metadata).toHaveProperty('decayScore');
      expect(results[0].metadata).toHaveProperty('finalScore');
    });

    it('should calculate final score using weights', async () => {
      const results = await enhancedStore.search([1, 0, 0], { topK: 1 });

      const result = results[0];
      const metadata = metadataStore.getChunkMetadata(result.id);

      const similarity = 1.0;
      const decayScore = metadata!.decayScore;
      const importance = metadata!.importance;

      const expectedFinalScore =
        similarity * DEFAULT_SCORE_WEIGHTS.similarity +
        decayScore * DEFAULT_SCORE_WEIGHTS.decay +
        importance * DEFAULT_SCORE_WEIGHTS.importance;

      expect(result.metadata.finalScore).toBeCloseTo(expectedFinalScore, 2);
    });

    it('should re-rank results based on combined score', async () => {
      metadataStore.upsertChunkMetadata({
        chunkId: 'old',
        decayScore: 0.3,
      });

      metadataStore.upsertChunkMetadata({
        chunkId: 'recent',
        decayScore: 1.0,
      });

      const results = await enhancedStore.search([0.95, 0.05, 0], { topK: 2 });

      expect(results.length).toBeGreaterThan(0);
      const ids = results.map(r => r.id);
      expect(ids).toContain('recent');
    });
  });

  describe('Access Recording', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('doc-1', 'Document one', [1, 0, 0]),
        createDocument('doc-2', 'Document two', [0, 1, 0]),
      ]);
    });

    it('should record access when search returns results', async () => {
      const metaBefore = metadataStore.getChunkMetadata('doc-1');
      expect(metaBefore!.accessCount).toBe(0);

      await enhancedStore.search([1, 0, 0], { topK: 1 });

      const metaAfter = metadataStore.getChunkMetadata('doc-1');
      expect(metaAfter!.accessCount).toBe(1);
      expect(metaAfter!.lastAccessedAt).not.toBeNull();
    });

    it('should increment access count on multiple searches', async () => {
      await enhancedStore.search([1, 0, 0], { topK: 1 });
      await enhancedStore.search([1, 0, 0], { topK: 1 });
      await enhancedStore.search([1, 0, 0], { topK: 1 });

      const metadata = metadataStore.getChunkMetadata('doc-1');
      expect(metadata!.accessCount).toBe(3);
    });

    it('should record access for all returned results', async () => {
      await enhancedStore.add([
        createDocument('doc-3', 'Document three', [0.9, 0.1, 0]),
      ]);

      await enhancedStore.search([1, 0, 0], { topK: 3 });

      const meta1 = metadataStore.getChunkMetadata('doc-1');
      const meta3 = metadataStore.getChunkMetadata('doc-3');

      expect(meta1!.accessCount).toBe(1);
      expect(meta3!.accessCount).toBe(1);
    });
  });

  describe('Decay Score Updates', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('new', 'New document', [1, 0, 0], { importance: 0.9 }),
        createDocument('old', 'Old document', [0, 1, 0], { importance: 0.1 }),
      ]);

      metadataStore.upsertChunkMetadata({
        chunkId: 'old',
        createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        lastAccessedAt: null,
        accessCount: 0,
      });
    });

    it('should update decay scores for all chunks', () => {
      enhancedStore.updateDecayScores(false);

      const newMeta = metadataStore.getChunkMetadata('new');
      const oldMeta = metadataStore.getChunkMetadata('old');

      expect(newMeta!.decayScore).toBeGreaterThan(oldMeta!.decayScore);
    });

    it('should auto-archive chunks below threshold', () => {
      metadataStore.updateDecayScore('old', 0.1);

      const archivedIds = metadataStore.archiveStaleChunks(0.2);

      expect(archivedIds).toContain('old');
      const oldMeta = metadataStore.getChunkMetadata('old');
      expect(oldMeta!.isArchived).toBe(true);
    });

    it('should affect search ordering after decay update', async () => {
      metadataStore.upsertChunkMetadata({
        chunkId: 'old',
        decayScore: 0.1,
      });

      metadataStore.upsertChunkMetadata({
        chunkId: 'new',
        decayScore: 1.0,
      });

      const results = await enhancedStore.search([0.5, 0.5, 0], { topK: 2 });

      expect(results[0].id).toBe('new');
    });
  });

  describe('Enhanced Search Options', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('active', 'Active doc', [1, 0, 0], { chunkType: 'solution' }),
        createDocument('archived', 'Archived doc', [0.9, 0.1, 0], { chunkType: 'solution' }),
        createDocument('pattern', 'Pattern doc', [0.8, 0.2, 0], { chunkType: 'pattern' }),
      ]);

      metadataStore.archiveChunk('archived');

      metadataStore.updateDecayScore('active', 0.8);
      metadataStore.updateDecayScore('pattern', 0.3);
    });

    it('should filter archived chunks by default', async () => {
      const results = await enhancedStore.enhancedSearch([1, 0, 0], {
        topK: 10,
      });

      const ids = results.map(r => r.id);
      expect(ids).not.toContain('archived');
    });

    it('should include archived chunks when requested', async () => {
      const results = await enhancedStore.enhancedSearch([1, 0, 0], {
        topK: 10,
        includeArchived: true,
      });

      const ids = results.map(r => r.id);
      expect(ids).toContain('archived');
    });

    it('should filter by minimum decay score', async () => {
      const results = await enhancedStore.enhancedSearch([1, 0, 0], {
        topK: 10,
        minDecayScore: 0.5,
      });

      const ids = results.map(r => r.id);
      expect(ids).toContain('active');
      expect(ids).not.toContain('pattern');
    });

    it('should filter by chunk types', async () => {
      const results = await enhancedStore.enhancedSearch([1, 0, 0], {
        topK: 10,
        chunkTypes: ['solution'] as ChunkType[],
      });

      const ids = results.map(r => r.id);
      expect(ids).toContain('active');
      expect(ids).not.toContain('pattern');
    });

    it('should combine multiple filters', async () => {
      const results = await enhancedStore.enhancedSearch([1, 0, 0], {
        topK: 10,
        chunkTypes: ['solution'] as ChunkType[],
        includeArchived: false,
        minDecayScore: 0.5,
      });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('active');
    });
  });

  describe('Relationship Data in Results', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('main', 'Main document', [1, 0, 0]),
        createDocument('related', 'Related document', [0.9, 0.1, 0]),
        createDocument('unrelated', 'Unrelated document', [0, 1, 0]),
      ]);

      metadataStore.addRelationship('main', 'related', 'references', 0.8);
    });

    it('should retrieve related chunk IDs', () => {
      const relatedIds = metadataStore.getRelatedChunkIds('main');

      expect(relatedIds).toContain('related');
      expect(relatedIds).not.toContain('unrelated');
    });

    it('should include relationship metadata', () => {
      const relationships = metadataStore.getRelationships('main', 'from');

      expect(relationships.length).toBe(1);
      expect(relationships[0].targetChunkId).toBe('related');
      expect(relationships[0].relationshipType).toBe('references');
      expect(relationships[0].strength).toBe(0.8);
    });
  });

  describe('Delete Operations', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('keep', 'Keep this', [1, 0, 0]),
        createDocument('delete', 'Delete this', [0, 1, 0]),
      ]);

      metadataStore.addRelationship('keep', 'delete', 'references', 0.5);
    });

    it('should delete from both stores', async () => {
      await enhancedStore.delete(['delete']);

      const vectorCount = await vectorStore.count();
      expect(vectorCount).toBe(1);

      const metadata = metadataStore.getChunkMetadata('delete');
      expect(metadata).toBeNull();
    });

    it('should clean up relationships when deleting', async () => {
      await enhancedStore.delete(['delete']);

      const relationships = metadataStore.getRelationships('keep');
      expect(relationships.length).toBe(0);
    });
  });

  describe('Memory Statistics', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('doc-1', 'Doc 1', [1, 0, 0], { chunkType: 'solution' }),
        createDocument('doc-2', 'Doc 2', [0, 1, 0], { chunkType: 'pattern' }),
        createDocument('doc-3', 'Doc 3', [0, 0, 1], { chunkType: 'solution' }),
      ]);

      metadataStore.archiveChunk('doc-3');
      metadataStore.addRelationship('doc-1', 'doc-2', 'references', 0.5);
    });

    it('should return correct total and active counts', () => {
      const stats = enhancedStore.getMemoryStats();

      expect(stats.totalChunks).toBe(3);
      expect(stats.activeChunks).toBe(2);
      expect(stats.archivedChunks).toBe(1);
    });

    it('should return chunks by type', () => {
      const stats = enhancedStore.getMemoryStats();

      expect(stats.chunksByType['solution']).toBe(1);
      expect(stats.chunksByType['pattern']).toBe(1);
    });

    it('should return relationship count', () => {
      const stats = enhancedStore.getMemoryStats();

      expect(stats.relationshipCount).toBe(1);
    });
  });

  describe('Custom Score Weights', () => {
    it('should use custom weights when provided', async () => {
      const customStore = new EnhancedVectorStore(vectorStore, {
        metadataStore,
        scoreWeights: {
          similarity: 0.8,
          decay: 0.1,
          importance: 0.1,
        },
      });

      await customStore.add([
        createDocument('doc', 'Test doc', [1, 0, 0], { importance: 0.5 }),
      ]);

      metadataStore.upsertChunkMetadata({
        chunkId: 'doc',
        decayScore: 0.5,
      });

      const results = await customStore.search([1, 0, 0], { topK: 1 });

      const expectedScore =
        1.0 * 0.8 +
        0.5 * 0.1 +
        0.5 * 0.1;

      expect(results[0].metadata.finalScore).toBeCloseTo(expectedScore, 2);
    });
  });

  describe('Chunk Metadata Updates', () => {
    beforeEach(async () => {
      await enhancedStore.add([
        createDocument('doc', 'Test document', [1, 0, 0]),
      ]);
    });

    it('should allow updating importance', () => {
      enhancedStore.updateImportance('doc', 0.9);

      const metadata = metadataStore.getChunkMetadata('doc');
      expect(metadata!.importance).toBe(0.9);
    });

    it('should reflect importance changes in search scores', async () => {
      enhancedStore.updateImportance('doc', 1.0);

      const results = await enhancedStore.search([1, 0, 0], { topK: 1 });

      expect(results[0].metadata.finalScore).toBeGreaterThan(
        1.0 * DEFAULT_SCORE_WEIGHTS.similarity +
        1.0 * DEFAULT_SCORE_WEIGHTS.decay +
        0.5 * DEFAULT_SCORE_WEIGHTS.importance
      );
    });
  });

  describe('Store Accessors', () => {
    it('should provide access to underlying vector store', () => {
      const underlying = enhancedStore.getUnderlyingStore();
      expect(underlying).toBe(vectorStore);
    });

    it('should provide access to metadata store', () => {
      const metadata = enhancedStore.getMetadataStore();
      expect(metadata).toBe(metadataStore);
    });
  });
});
