import { describe, it, expect } from 'vitest';
import {
  ChunkType,
  EntityType,
  RelationshipType,
  DEFAULT_DECAY_CONFIG,
} from '../../../src/types/memory.js';

describe('ChunkType enum', () => {
  it('should have all expected chunk types', () => {
    expect(ChunkType.DOCUMENTATION).toBe('documentation');
    expect(ChunkType.CODE).toBe('code');
    expect(ChunkType.SOLUTION).toBe('solution');
    expect(ChunkType.PATTERN).toBe('pattern');
    expect(ChunkType.DECISION).toBe('decision');
    expect(ChunkType.STANDARD).toBe('standard');
    expect(ChunkType.PREFERENCE).toBe('preference');
    expect(ChunkType.CATEGORY_SUMMARY).toBe('category_summary');
  });

  it('should have exactly 8 chunk types', () => {
    const types = Object.values(ChunkType);
    expect(types).toHaveLength(8);
  });
});

describe('EntityType enum', () => {
  it('should have all expected entity types', () => {
    expect(EntityType.TOOL).toBe('tool');
    expect(EntityType.LANGUAGE).toBe('language');
    expect(EntityType.FRAMEWORK).toBe('framework');
    expect(EntityType.CONCEPT).toBe('concept');
    expect(EntityType.PROJECT).toBe('project');
    expect(EntityType.PERSON).toBe('person');
    expect(EntityType.FILE).toBe('file');
    expect(EntityType.COMPONENT).toBe('component');
  });

  it('should have exactly 8 entity types', () => {
    const types = Object.values(EntityType);
    expect(types).toHaveLength(8);
  });
});

describe('RelationshipType enum', () => {
  it('should have semantic relationship types', () => {
    expect(RelationshipType.RELATES_TO).toBe('relates_to');
    expect(RelationshipType.SIMILAR_TO).toBe('similar_to');
  });

  it('should have causal relationship types', () => {
    expect(RelationshipType.LEADS_TO).toBe('leads_to');
    expect(RelationshipType.DERIVES_FROM).toBe('derives_from');
    expect(RelationshipType.SOLVES).toBe('solves');
  });

  it('should have temporal relationship types', () => {
    expect(RelationshipType.SUPERSEDES).toBe('supersedes');
    expect(RelationshipType.OCCURRED_BEFORE).toBe('occurred_before');
    expect(RelationshipType.EVOLVED_INTO).toBe('evolved_into');
  });

  it('should have conflict relationship types', () => {
    expect(RelationshipType.CONTRADICTS).toBe('contradicts');
    expect(RelationshipType.INVALIDATED_BY).toBe('invalidated_by');
  });

  it('should have structural relationship types', () => {
    expect(RelationshipType.PART_OF).toBe('part_of');
    expect(RelationshipType.DEPENDS_ON).toBe('depends_on');
    expect(RelationshipType.IMPLEMENTS).toBe('implements');
    expect(RelationshipType.EXTENDS).toBe('extends');
    expect(RelationshipType.REFERENCES).toBe('references');
  });
});

describe('DEFAULT_DECAY_CONFIG', () => {
  it('should have reasonable half-life', () => {
    expect(DEFAULT_DECAY_CONFIG.halfLifeDays).toBeGreaterThan(0);
    expect(DEFAULT_DECAY_CONFIG.halfLifeDays).toBeLessThanOrEqual(365);
  });

  it('should have access boost factor between 0 and 1', () => {
    expect(DEFAULT_DECAY_CONFIG.accessBoostFactor).toBeGreaterThan(0);
    expect(DEFAULT_DECAY_CONFIG.accessBoostFactor).toBeLessThanOrEqual(1);
  });

  it('should have importance weight between 0 and 1', () => {
    expect(DEFAULT_DECAY_CONFIG.importanceWeight).toBeGreaterThan(0);
    expect(DEFAULT_DECAY_CONFIG.importanceWeight).toBeLessThanOrEqual(1);
  });

  it('should have valid min/max decay scores', () => {
    expect(DEFAULT_DECAY_CONFIG.minDecayScore).toBe(0);
    expect(DEFAULT_DECAY_CONFIG.maxDecayScore).toBe(1);
    expect(DEFAULT_DECAY_CONFIG.minDecayScore).toBeLessThan(DEFAULT_DECAY_CONFIG.maxDecayScore);
  });
});

describe('EnhancedChunk interface requirements', () => {
  it('should define all required fields via factory', async () => {
    const { createChunkSync } = await import('../../factories/chunk.js');
    const chunk = createChunkSync();

    expect(chunk.id).toBeDefined();
    expect(chunk.content).toBeDefined();
    expect(chunk.embedding).toBeDefined();
    expect(chunk.source).toBeDefined();
    expect(chunk.metadata).toBeDefined();
    expect(chunk.createdAt).toBeInstanceOf(Date);
    expect(chunk.updatedAt).toBeInstanceOf(Date);
    expect(typeof chunk.accessCount).toBe('number');
    expect(typeof chunk.importance).toBe('number');
    expect(typeof chunk.decayScore).toBe('number');
    expect(typeof chunk.isArchived).toBe('boolean');
    expect(chunk.chunkType).toBeDefined();
    expect(Array.isArray(chunk.relatedChunkIds)).toBe(true);
    expect(Array.isArray(chunk.entities)).toBe(true);
  });
});

describe('EntityTag interface requirements', () => {
  it('should have type, value, and confidence', async () => {
    const { createCodeChunk } = await import('../../factories/chunk.js');
    const chunk = createCodeChunk('typescript', 'const x = 1;');

    expect(chunk.entities).toHaveLength(1);
    const entity = chunk.entities[0];
    expect(entity.type).toBe(EntityType.LANGUAGE);
    expect(entity.value).toBe('typescript');
    expect(entity.confidence).toBe(1.0);
  });
});

describe('ChunkMetadata interface', () => {
  it('should support serialization to database', () => {
    const metadata = {
      chunkId: 'test-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: null,
      accessCount: 5,
      importance: 0.8,
      decayScore: 0.9,
      isArchived: false,
      chunkType: ChunkType.SOLUTION,
      sourceConversationId: 'conv-1',
      sourceMessageIndex: 2,
    };

    const json = JSON.stringify(metadata);
    const parsed = JSON.parse(json);

    expect(parsed.chunkId).toBe('test-id');
    expect(parsed.accessCount).toBe(5);
    expect(parsed.importance).toBe(0.8);
    expect(parsed.chunkType).toBe('solution');
  });
});

describe('EnhancedSearchOptions', () => {
  it('should support all filter types', () => {
    const options = {
      topK: 10,
      filter: { source: 'test' },
      minDecayScore: 0.3,
      chunkTypes: [ChunkType.SOLUTION, ChunkType.PATTERN],
      includeArchived: false,
      categoryIds: ['cat-1'],
      entityFilters: { [EntityType.LANGUAGE]: ['typescript'] },
      timeRange: {
        from: new Date('2024-01-01'),
        to: new Date('2024-12-31'),
      },
      includeRelated: true,
      maxRelatedDepth: 2,
      scoreWeights: {
        similarity: 0.5,
        decay: 0.3,
        importance: 0.2,
      },
    };

    expect(options.topK).toBe(10);
    expect(options.chunkTypes).toContain(ChunkType.SOLUTION);
    expect(options.entityFilters?.[EntityType.LANGUAGE]).toContain('typescript');
    expect(options.scoreWeights?.similarity).toBe(0.5);
  });
});
