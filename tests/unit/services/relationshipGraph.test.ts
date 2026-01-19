import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RelationshipGraph } from '../../../src/services/relationshipGraph.js';
import { MemoryMetadataStore } from '../../../src/services/memoryMetadataStore.js';
import { ChunkType, RelationshipType } from '../../../src/types/memory.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';

describe('RelationshipGraph', () => {
  let graph: RelationshipGraph;
  let store: MemoryMetadataStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-graph-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new MemoryMetadataStore(dbPath);
    graph = new RelationshipGraph(store);

    store.upsertChunkMetadata({ chunkId: 'chunk-a', chunkType: ChunkType.SOLUTION });
    store.upsertChunkMetadata({ chunkId: 'chunk-b', chunkType: ChunkType.PATTERN });
    store.upsertChunkMetadata({ chunkId: 'chunk-c', chunkType: ChunkType.DECISION });
    store.upsertChunkMetadata({ chunkId: 'chunk-d', chunkType: ChunkType.DOCUMENTATION });
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) rmSync(dbPath, { force: true });
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (existsSync(walPath)) rmSync(walPath, { force: true });
    if (existsSync(shmPath)) rmSync(shmPath, { force: true });
  });

  describe('addRelationship', () => {
    it('should add a unidirectional relationship', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.SOLVES, {
        strength: 0.9,
        bidirectional: false,
      });

      const fromRels = store.getRelationships('chunk-a', 'from');
      expect(fromRels).toHaveLength(1);
      expect(fromRels[0].targetChunkId).toBe('chunk-b');
      expect(fromRels[0].strength).toBe(0.9);

      const toRels = store.getRelationships('chunk-b', 'from');
      expect(toRels).toHaveLength(0);
    });

    it('should add bidirectional relationship for bidirectional types', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.SIMILAR_TO, {
        strength: 0.8,
      });

      const aToB = store.getRelationships('chunk-a', 'from');
      const bToA = store.getRelationships('chunk-b', 'from');

      expect(aToB).toHaveLength(1);
      expect(bToA).toHaveLength(1);
    });

    it('should store relationship metadata', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO, {
        metadata: { reason: 'test', confidence: 0.95 },
      });

      const rels = store.getRelationships('chunk-a', 'from');
      expect(rels[0].metadata).toEqual({ reason: 'test', confidence: 0.95 });
    });
  });

  describe('addRelationshipBatch', () => {
    it('should add multiple relationships', () => {
      const result = graph.addRelationshipBatch({
        relationships: [
          { fromChunkId: 'chunk-a', toChunkId: 'chunk-b', type: RelationshipType.RELATES_TO },
          { fromChunkId: 'chunk-b', toChunkId: 'chunk-c', type: RelationshipType.LEADS_TO },
          { fromChunkId: 'chunk-c', toChunkId: 'chunk-d', type: RelationshipType.DEPENDS_ON },
        ],
      });

      expect(result.created).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  describe('removeRelationship', () => {
    it('should remove a relationship', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.SOLVES);
      
      graph.removeRelationship('chunk-a', 'chunk-b', RelationshipType.SOLVES);
      
      const rels = store.getRelationships('chunk-a', 'from');
      expect(rels).toHaveLength(0);
    });

    it('should remove both directions for bidirectional relationships', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.SIMILAR_TO);
      
      graph.removeRelationship('chunk-a', 'chunk-b', RelationshipType.SIMILAR_TO);
      
      const aRels = store.getRelationships('chunk-a', 'both');
      const bRels = store.getRelationships('chunk-b', 'both');
      expect(aRels).toHaveLength(0);
      expect(bRels).toHaveLength(0);
    });
  });

  describe('traverse', () => {
    beforeEach(() => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO, { bidirectional: false });
      graph.addRelationship('chunk-b', 'chunk-c', RelationshipType.RELATES_TO, { bidirectional: false });
      graph.addRelationship('chunk-c', 'chunk-d', RelationshipType.RELATES_TO, { bidirectional: false });
    });

    it('should traverse to specified depth', () => {
      const result = graph.traverse('chunk-a', { maxDepth: 2 });

      expect(result.startChunkId).toBe('chunk-a');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map(n => n.chunkId)).toContain('chunk-b');
      expect(result.nodes.map(n => n.chunkId)).toContain('chunk-c');
      expect(result.maxDepthReached).toBe(2);
    });

    it('should not exceed max depth', () => {
      const result = graph.traverse('chunk-a', { maxDepth: 1 });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].chunkId).toBe('chunk-b');
    });

    it('should track traversal path', () => {
      const result = graph.traverse('chunk-a', { maxDepth: 3 });

      const nodeC = result.nodes.find(n => n.chunkId === 'chunk-c');
      expect(nodeC?.path).toContain('chunk-a');
      expect(nodeC?.path).toContain('chunk-b');
    });

    it('should filter by relationship type', () => {
      graph.addRelationship('chunk-a', 'chunk-d', RelationshipType.SOLVES, { bidirectional: false });

      const result = graph.traverse('chunk-a', {
        maxDepth: 2,
        relationshipTypes: [RelationshipType.SOLVES],
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].chunkId).toBe('chunk-d');
    });

    it('should filter by minimum strength', () => {
      store.addRelationship('chunk-a', 'chunk-d', RelationshipType.RELATES_TO, 0.3);

      const result = graph.traverse('chunk-a', {
        maxDepth: 2,
        minStrength: 0.4,
      });

      expect(result.nodes.map(n => n.chunkId)).not.toContain('chunk-d');
    });

    it('should exclude archived chunks', () => {
      store.archiveChunk('chunk-b');

      const result = graph.traverse('chunk-a', {
        maxDepth: 2,
        excludeArchived: true,
      });

      expect(result.nodes.map(n => n.chunkId)).not.toContain('chunk-b');
    });
  });

  describe('findRelated', () => {
    beforeEach(() => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO, { strength: 0.9, bidirectional: false });
      graph.addRelationship('chunk-a', 'chunk-c', RelationshipType.SOLVES, { strength: 0.7, bidirectional: false });
    });

    it('should find directly related chunks', () => {
      const related = graph.findRelated('chunk-a');

      expect(related).toHaveLength(2);
      expect(related.map(r => r.chunkId)).toContain('chunk-b');
      expect(related.map(r => r.chunkId)).toContain('chunk-c');
    });

    it('should filter by relationship types', () => {
      const related = graph.findRelated('chunk-a', {
        types: [RelationshipType.SOLVES],
      });

      expect(related).toHaveLength(1);
      expect(related[0].chunkId).toBe('chunk-c');
    });

    it('should filter by minimum strength', () => {
      const related = graph.findRelated('chunk-a', {
        minStrength: 0.8,
      });

      expect(related).toHaveLength(1);
      expect(related[0].chunkId).toBe('chunk-b');
    });

    it('should include transitive relationships', () => {
      graph.addRelationship('chunk-b', 'chunk-d', RelationshipType.RELATES_TO, { bidirectional: false });

      const related = graph.findRelated('chunk-a', {
        includeTransitive: true,
        transitiveDepth: 2,
      });

      expect(related.map(r => r.chunkId)).toContain('chunk-d');
      const transitiveChunk = related.find(r => r.chunkId === 'chunk-d');
      expect(transitiveChunk?.isTransitive).toBe(true);
    });

    it('should limit results', () => {
      const related = graph.findRelated('chunk-a', {
        maxResults: 1,
      });

      expect(related).toHaveLength(1);
      expect(related[0].strength).toBe(0.9);
    });
  });

  describe('findContradictions', () => {
    it('should find direct contradictions', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.CONTRADICTS, { strength: 0.8 });

      const contradictions = graph.findContradictions('chunk-a');

      expect(contradictions.length).toBeGreaterThanOrEqual(1);
      expect(contradictions.some(c => c.type === 'contradiction')).toBe(true);
      expect(contradictions.some(c => c.chunkId === 'chunk-b')).toBe(true);
    });

    it('should find superseded relationships', () => {
      graph.addRelationship('chunk-b', 'chunk-a', RelationshipType.SUPERSEDES, { bidirectional: false });

      const contradictions = graph.findContradictions('chunk-a');

      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].type).toBe('superseded');
    });

    it('should find invalidation relationships', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.INVALIDATED_BY);

      const contradictions = graph.findContradictions('chunk-a');

      expect(contradictions.some(c => c.type === 'invalidation')).toBe(true);
    });
  });

  describe('detectPotentialContradictions', () => {
    it('should detect high similarity as potential contradiction', () => {
      const now = new Date();
      const similar = [
        {
          id: 'existing-1',
          similarity: 0.92,
          chunkType: ChunkType.SOLUTION,
          createdAt: now.toISOString(),
        },
      ];

      const potentials = graph.detectPotentialContradictions(
        'new-chunk',
        ChunkType.SOLUTION,
        now,
        similar
      );

      expect(potentials).toHaveLength(1);
      expect(potentials[0].suggestedAction).toBe('review');
    });

    it('should suggest supersede for old similar chunks', () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const similar = [
        {
          id: 'old-chunk',
          similarity: 0.92,
          chunkType: ChunkType.SOLUTION,
          createdAt: oldDate.toISOString(),
        },
      ];

      const potentials = graph.detectPotentialContradictions(
        'new-chunk',
        ChunkType.SOLUTION,
        now,
        similar
      );

      expect(potentials[0].suggestedAction).toBe('supersede');
    });

    it('should suggest merge for very high similarity same day', () => {
      const now = new Date();
      const similar = [
        {
          id: 'duplicate',
          similarity: 0.98,
          chunkType: ChunkType.SOLUTION,
          createdAt: now.toISOString(),
        },
      ];

      const potentials = graph.detectPotentialContradictions(
        'new-chunk',
        ChunkType.SOLUTION,
        now,
        similar
      );

      expect(potentials[0].suggestedAction).toBe('merge');
    });

    it('should ignore non-contradiction types', () => {
      const now = new Date();
      const similar = [
        {
          id: 'doc-chunk',
          similarity: 0.95,
          chunkType: ChunkType.DOCUMENTATION,
          createdAt: now.toISOString(),
        },
      ];

      const potentials = graph.detectPotentialContradictions(
        'new-chunk',
        ChunkType.DOCUMENTATION,
        now,
        similar
      );

      expect(potentials).toHaveLength(0);
    });
  });

  describe('markSupersedes', () => {
    it('should create supersedes relationship', () => {
      graph.markSupersedes('chunk-b', 'chunk-a', 0.9);

      const contradictions = graph.findContradictions('chunk-a');
      expect(contradictions.some(c => c.type === 'superseded')).toBe(true);
    });
  });

  describe('markContradiction', () => {
    it('should create bidirectional contradiction', () => {
      graph.markContradiction('chunk-a', 'chunk-b', 0.8);

      const aContradictions = graph.findContradictions('chunk-a');
      const bContradictions = graph.findContradictions('chunk-b');

      expect(aContradictions.length).toBeGreaterThanOrEqual(1);
      expect(aContradictions.some(c => c.chunkId === 'chunk-b')).toBe(true);
      expect(bContradictions.length).toBeGreaterThanOrEqual(1);
      expect(bContradictions.some(c => c.chunkId === 'chunk-a')).toBe(true);
    });
  });

  describe('supersession chain', () => {
    beforeEach(() => {
      store.upsertChunkMetadata({ chunkId: 'v1' });
      store.upsertChunkMetadata({ chunkId: 'v2' });
      store.upsertChunkMetadata({ chunkId: 'v3' });
      
      graph.markSupersedes('v2', 'v1');
      graph.markSupersedes('v3', 'v2');
    });

    it('should find supersession chain', () => {
      const chain = graph.findSupersessionChain('v1');

      expect(chain).toEqual(['v2', 'v3']);
    });

    it('should get latest version', () => {
      const latest = graph.getLatestVersion('v1');
      expect(latest).toBe('v3');
    });

    it('should return self if no supersession', () => {
      const latest = graph.getLatestVersion('v3');
      expect(latest).toBe('v3');
    });
  });

  describe('findClusters', () => {
    it('should find connected clusters', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);
      graph.addRelationship('chunk-b', 'chunk-c', RelationshipType.RELATES_TO);

      const clusters = graph.findClusters(2);

      expect(clusters.length).toBeGreaterThanOrEqual(1);
      expect(clusters[0].length).toBeGreaterThanOrEqual(2);
    });

    it('should respect minimum cluster size', () => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);

      const clusters = graph.findClusters(5);
      expect(clusters.every(c => c.length >= 5)).toBe(true);
    });

    it('should sort clusters by size', () => {
      store.upsertChunkMetadata({ chunkId: 'chunk-e' });
      
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO);
      graph.addRelationship('chunk-b', 'chunk-c', RelationshipType.RELATES_TO);
      graph.addRelationship('chunk-d', 'chunk-e', RelationshipType.RELATES_TO);

      const clusters = graph.findClusters(2);

      if (clusters.length > 1) {
        expect(clusters[0].length).toBeGreaterThanOrEqual(clusters[1].length);
      }
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      graph.addRelationship('chunk-a', 'chunk-b', RelationshipType.RELATES_TO, { bidirectional: false });
      graph.addRelationship('chunk-a', 'chunk-c', RelationshipType.SOLVES, { bidirectional: false });
      graph.addRelationship('chunk-b', 'chunk-c', RelationshipType.DEPENDS_ON, { bidirectional: false });
    });

    it('should return correct statistics', () => {
      const stats = graph.getStats();

      expect(stats.totalRelationships).toBe(3);
      expect(stats.relationshipsByType[RelationshipType.RELATES_TO]).toBeGreaterThanOrEqual(1);
      expect(stats.avgRelationshipsPerChunk).toBeGreaterThan(0);
      expect(stats.mostConnectedChunks.length).toBeGreaterThan(0);
    });

    it('should identify isolated chunks', () => {
      const stats = graph.getStats();
      expect(stats.isolatedChunks).toBe(1);
    });
  });
});
