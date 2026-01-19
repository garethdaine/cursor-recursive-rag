import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryMetadataStore } from '../../../src/services/memoryMetadataStore.js';
import { ChunkType, RelationshipType } from '../../../src/types/memory.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';

describe('MemoryMetadataStore', () => {
  let store: MemoryMetadataStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-memory-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new MemoryMetadataStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) {
      rmSync(dbPath, { force: true });
    }
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (existsSync(walPath)) rmSync(walPath, { force: true });
    if (existsSync(shmPath)) rmSync(shmPath, { force: true });
  });

  describe('Chunk Metadata CRUD', () => {
    it('should upsert and retrieve chunk metadata', () => {
      store.upsertChunkMetadata({
        chunkId: 'chunk-1',
        source: 'test',
        chunkType: ChunkType.SOLUTION,
        importance: 0.8,
      });

      const metadata = store.getChunkMetadata('chunk-1');

      expect(metadata).not.toBeNull();
      expect(metadata?.chunkId).toBe('chunk-1');
      expect(metadata?.chunkType).toBe(ChunkType.SOLUTION);
      expect(metadata?.importance).toBe(0.8);
      expect(metadata?.decayScore).toBe(1.0);
      expect(metadata?.isArchived).toBe(false);
    });

    it('should return null for non-existent chunk', () => {
      const metadata = store.getChunkMetadata('non-existent');
      expect(metadata).toBeNull();
    });

    it('should update existing chunk on upsert', () => {
      store.upsertChunkMetadata({
        chunkId: 'chunk-1',
        importance: 0.5,
      });

      store.upsertChunkMetadata({
        chunkId: 'chunk-1',
        importance: 0.9,
      });

      const metadata = store.getChunkMetadata('chunk-1');
      expect(metadata?.importance).toBe(0.9);
    });

    it('should get all chunk metadata', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      store.upsertChunkMetadata({ chunkId: 'chunk-2' });
      store.upsertChunkMetadata({ chunkId: 'chunk-3' });

      const allMetadata = store.getAllChunkMetadata();
      expect(allMetadata).toHaveLength(3);
    });

    it('should filter by archived status', () => {
      store.upsertChunkMetadata({ chunkId: 'active' });
      store.upsertChunkMetadata({ chunkId: 'archived', isArchived: true });

      const activeOnly = store.getAllChunkMetadata({ includeArchived: false });
      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].chunkId).toBe('active');

      const all = store.getAllChunkMetadata({ includeArchived: true });
      expect(all).toHaveLength(2);
    });

    it('should filter by minimum decay score', () => {
      store.upsertChunkMetadata({ chunkId: 'high', decayScore: 0.9 });
      store.upsertChunkMetadata({ chunkId: 'low', decayScore: 0.2 });

      const filtered = store.getAllChunkMetadata({ minDecayScore: 0.5 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].chunkId).toBe('high');
    });

    it('should filter by chunk types', () => {
      store.upsertChunkMetadata({ chunkId: 'sol', chunkType: ChunkType.SOLUTION });
      store.upsertChunkMetadata({ chunkId: 'pat', chunkType: ChunkType.PATTERN });
      store.upsertChunkMetadata({ chunkId: 'doc', chunkType: ChunkType.DOCUMENTATION });

      const filtered = store.getAllChunkMetadata({
        chunkTypes: [ChunkType.SOLUTION, ChunkType.PATTERN],
      });
      expect(filtered).toHaveLength(2);
    });

    it('should delete chunk metadata and related data', () => {
      store.upsertChunkMetadata({ chunkId: 'to-delete' });
      store.recordAccess('to-delete', 'test query');
      
      store.deleteChunkMetadata('to-delete');
      
      expect(store.getChunkMetadata('to-delete')).toBeNull();
    });
  });

  describe('Access Tracking', () => {
    it('should record access and update metadata', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      
      store.recordAccess('chunk-1', 'test query', 1);
      
      const metadata = store.getChunkMetadata('chunk-1');
      expect(metadata?.accessCount).toBe(1);
      expect(metadata?.lastAccessedAt).not.toBeNull();
    });

    it('should increment access count on multiple accesses', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      
      store.recordAccess('chunk-1');
      store.recordAccess('chunk-1');
      store.recordAccess('chunk-1');
      
      const metadata = store.getChunkMetadata('chunk-1');
      expect(metadata?.accessCount).toBe(3);
    });

    it('should get access stats', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      store.upsertChunkMetadata({ chunkId: 'chunk-2' });
      
      store.recordAccess('chunk-1');
      store.recordAccess('chunk-1');
      store.recordAccess('chunk-2');
      
      const stats = store.getAccessStats();
      expect(stats).toHaveLength(2);
      expect(stats[0].chunkId).toBe('chunk-1');
      expect(stats[0].accessCount).toBe(2);
    });
  });

  describe('Decay Score Management', () => {
    it('should update decay score', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1', decayScore: 1.0 });
      
      store.updateDecayScore('chunk-1', 0.5);
      
      const metadata = store.getChunkMetadata('chunk-1');
      expect(metadata?.decayScore).toBe(0.5);
    });

    it('should bulk update decay scores', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1', decayScore: 1.0 });
      store.upsertChunkMetadata({ chunkId: 'chunk-2', decayScore: 1.0 });
      store.upsertChunkMetadata({ chunkId: 'chunk-3', decayScore: 1.0 });

      store.bulkUpdateDecayScores([
        { chunkId: 'chunk-1', decayScore: 0.9 },
        { chunkId: 'chunk-2', decayScore: 0.8 },
        { chunkId: 'chunk-3', decayScore: 0.7 },
      ]);

      expect(store.getChunkMetadata('chunk-1')?.decayScore).toBe(0.9);
      expect(store.getChunkMetadata('chunk-2')?.decayScore).toBe(0.8);
      expect(store.getChunkMetadata('chunk-3')?.decayScore).toBe(0.7);
    });

    it('should archive chunk', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      
      store.archiveChunk('chunk-1');
      
      const metadata = store.getChunkMetadata('chunk-1');
      expect(metadata?.isArchived).toBe(true);
    });

    it('should archive stale chunks below threshold', () => {
      store.upsertChunkMetadata({ chunkId: 'high', decayScore: 0.8 });
      store.upsertChunkMetadata({ chunkId: 'low1', decayScore: 0.1 });
      store.upsertChunkMetadata({ chunkId: 'low2', decayScore: 0.15 });

      const archived = store.archiveStaleChunks(0.2);

      expect(archived).toHaveLength(2);
      expect(archived).toContain('low1');
      expect(archived).toContain('low2');
      expect(store.getChunkMetadata('high')?.isArchived).toBe(false);
    });
  });

  describe('Relationship Operations', () => {
    beforeEach(() => {
      store.upsertChunkMetadata({ chunkId: 'chunk-a' });
      store.upsertChunkMetadata({ chunkId: 'chunk-b' });
      store.upsertChunkMetadata({ chunkId: 'chunk-c' });
    });

    it('should add relationship', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.SOLVES, 0.9);

      const relationships = store.getRelationships('chunk-a', 'from');
      expect(relationships).toHaveLength(1);
      expect(relationships[0].targetChunkId).toBe('chunk-b');
      expect(relationships[0].relationshipType).toBe(RelationshipType.SOLVES);
      expect(relationships[0].strength).toBe(0.9);
    });

    it('should get relationships by direction', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);
      store.addRelationship('chunk-c', 'chunk-a', RelationshipType.DEPENDS_ON);

      const fromRels = store.getRelationships('chunk-a', 'from');
      expect(fromRels).toHaveLength(1);
      expect(fromRels[0].targetChunkId).toBe('chunk-b');

      const toRels = store.getRelationships('chunk-a', 'to');
      expect(toRels).toHaveLength(1);
      expect(toRels[0].sourceChunkId).toBe('chunk-c');

      const allRels = store.getRelationships('chunk-a', 'both');
      expect(allRels).toHaveLength(2);
    });

    it('should get related chunk IDs', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);
      store.addRelationship('chunk-a', 'chunk-c', RelationshipType.SIMILAR_TO);

      const related = store.getRelatedChunkIds('chunk-a');
      expect(related).toHaveLength(2);
      expect(related).toContain('chunk-b');
      expect(related).toContain('chunk-c');
    });

    it('should filter related chunks by relationship type', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);
      store.addRelationship('chunk-a', 'chunk-c', RelationshipType.SOLVES);

      const solvesRelated = store.getRelatedChunkIds('chunk-a', RelationshipType.SOLVES);
      expect(solvesRelated).toHaveLength(1);
      expect(solvesRelated[0]).toBe('chunk-c');

      const relatesToRelated = store.getRelatedChunkIds('chunk-a', RelationshipType.RELATES_TO);
      expect(relatesToRelated).toHaveLength(1);
      expect(relatesToRelated[0]).toBe('chunk-b');

      const allRelated = store.getRelatedChunkIds('chunk-a');
      expect(allRelated).toHaveLength(2);
    });

    it('should find contradictions', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.CONTRADICTS, 0.8);

      const contradictions = store.findContradictions('chunk-a');
      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].targetChunkId).toBe('chunk-b');
    });

    it('should update relationship on conflict', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO, 0.5);
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO, 0.9);

      const relationships = store.getRelationships('chunk-a', 'from');
      expect(relationships).toHaveLength(1);
      expect(relationships[0].strength).toBe(0.9);
    });

    it('should delete relationship', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);

      store.deleteRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);

      const relationships = store.getRelationships('chunk-a', 'from');
      expect(relationships).toHaveLength(0);
    });

    it('should store relationship metadata', () => {
      store.addRelationship('chunk-a', 'chunk-b', RelationshipType.SOLVES, 0.9, {
        reason: 'Direct solution',
        confidence: 0.95,
      });

      const relationships = store.getRelationships('chunk-a', 'from');
      expect(relationships[0].metadata).toEqual({
        reason: 'Direct solution',
        confidence: 0.95,
      });
    });
  });

  describe('Category Operations', () => {
    it('should upsert and retrieve category', () => {
      store.upsertCategory({
        id: 'cat-1',
        name: 'Testing',
        description: 'Testing related content',
      });

      const category = store.getCategory('cat-1');
      expect(category).not.toBeNull();
      expect(category?.name).toBe('Testing');
      expect(category?.description).toBe('Testing related content');
    });

    it('should get category by name', () => {
      store.upsertCategory({
        id: 'cat-1',
        name: 'Unique Name',
      });

      const category = store.getCategoryByName('Unique Name');
      expect(category?.id).toBe('cat-1');
    });

    it('should list all categories', () => {
      store.upsertCategory({ id: 'cat-1', name: 'Alpha' });
      store.upsertCategory({ id: 'cat-2', name: 'Beta' });
      store.upsertCategory({ id: 'cat-3', name: 'Gamma' });

      const categories = store.listCategories();
      expect(categories).toHaveLength(3);
      expect(categories[0].name).toBe('Alpha');
    });

    it('should assign chunk to category', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      store.upsertCategory({ id: 'cat-1', name: 'Test' });

      store.assignChunkToCategory('chunk-1', 'cat-1', 0.9);

      const chunkCategories = store.getChunkCategories('chunk-1');
      expect(chunkCategories).toHaveLength(1);
      expect(chunkCategories[0].categoryId).toBe('cat-1');
      expect(chunkCategories[0].relevanceScore).toBe(0.9);
    });

    it('should get category chunks', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      store.upsertChunkMetadata({ chunkId: 'chunk-2' });
      store.upsertCategory({ id: 'cat-1', name: 'Test' });

      store.assignChunkToCategory('chunk-1', 'cat-1', 0.9);
      store.assignChunkToCategory('chunk-2', 'cat-1', 0.7);

      const categoryChunks = store.getCategoryChunks('cat-1');
      expect(categoryChunks).toHaveLength(2);
      expect(categoryChunks[0].chunkId).toBe('chunk-1');
    });

    it('should update category chunk count', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      store.upsertChunkMetadata({ chunkId: 'chunk-2' });
      store.upsertCategory({ id: 'cat-1', name: 'Test' });

      store.assignChunkToCategory('chunk-1', 'cat-1');
      store.assignChunkToCategory('chunk-2', 'cat-1');

      const category = store.getCategory('cat-1');
      expect(category?.chunkCount).toBe(2);
    });

    it('should support category hierarchy', () => {
      store.upsertCategory({ id: 'parent', name: 'Parent' });
      store.upsertCategory({ id: 'child', name: 'Child', parentId: 'parent' });

      const child = store.getCategory('child');
      expect(child?.parentId).toBe('parent');
    });
  });

  describe('Processed Conversations', () => {
    it('should mark conversation as processed', () => {
      store.markConversationProcessed('conv-1', 10, 5, 3);

      expect(store.isConversationProcessed('conv-1')).toBe(true);
      expect(store.isConversationProcessed('conv-2')).toBe(false);
    });

    it('should get processed conversation details', () => {
      store.markConversationProcessed('conv-1', 10, 5, 3);

      const conv = store.getProcessedConversation('conv-1');
      expect(conv).not.toBeNull();
      expect(conv?.messageCount).toBe(10);
      expect(conv?.chunksCreated).toBe(5);
      expect(conv?.knowledgeExtracted).toBe(3);
    });

    it('should update on re-processing', () => {
      store.markConversationProcessed('conv-1', 10, 5, 3);
      store.markConversationProcessed('conv-1', 15, 8, 5);

      const conv = store.getProcessedConversation('conv-1');
      expect(conv?.messageCount).toBe(15);
      expect(conv?.chunksCreated).toBe(8);
    });
  });

  describe('Memory Stats', () => {
    it('should return correct stats', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1', chunkType: ChunkType.SOLUTION });
      store.upsertChunkMetadata({ chunkId: 'chunk-2', chunkType: ChunkType.SOLUTION });
      store.upsertChunkMetadata({ chunkId: 'chunk-3', chunkType: ChunkType.PATTERN, isArchived: true });
      store.upsertCategory({ id: 'cat-1', name: 'Test' });
      store.addRelationship('chunk-1', 'chunk-2', RelationshipType.RELATES_TO);
      store.recordAccess('chunk-1');

      const stats = store.getMemoryStats();

      expect(stats.totalChunks).toBe(3);
      expect(stats.activeChunks).toBe(2);
      expect(stats.archivedChunks).toBe(1);
      expect(stats.relationshipCount).toBe(1);
      expect(stats.categoryCount).toBe(1);
      expect(stats.totalAccesses).toBe(1);
      expect(stats.chunksByType[ChunkType.SOLUTION]).toBe(2);
    });

    it('should return zero stats for empty store', () => {
      const stats = store.getMemoryStats();

      expect(stats.totalChunks).toBe(0);
      expect(stats.activeChunks).toBe(0);
      expect(stats.avgDecayScore).toBe(0);
    });
  });

  describe('Cleanup Operations', () => {
    it('should vacuum database', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-1' });
      store.deleteChunkMetadata('chunk-1');

      expect(() => store.vacuum()).not.toThrow();
    });
  });
});
