import { describe, it, expect, beforeEach } from 'vitest';
import {
  createChunkSync,
  createSolutionChunk,
  createPatternChunk,
  createDecisionChunk,
  createCodeChunk,
  createArchivedChunk,
  createHighImportanceChunk,
  createRelatedChunks,
  resetChunkCounter,
} from '../factories/chunk.js';
import {
  createConversation,
  createProblemSolvingConversation,
  createMultiTurnConversation,
  createErrorResolutionConversation,
  resetConversationCounter,
} from '../factories/conversation.js';
import {
  createRelationship,
  createSolvesRelationship,
  createContradictionRelationship,
  createChainOfRelationships,
  createBidirectionalRelationship,
  resetRelationshipCounter,
} from '../factories/relationship.js';
import {
  createCategory,
  createCategoryItem,
  createCategoryHierarchy,
  createTechCategories,
  createCategoryWithItems,
  resetCategoryCounters,
} from '../factories/category.js';
import {
  createExtractedKnowledge,
  createExtractedSolution,
  createExtractedPattern,
  createExtractedDecision,
  createFullExtractedKnowledge,
  resetKnowledgeCounter,
} from '../factories/knowledge.js';
import { ChunkType, RelationshipType, EntityType } from '../../src/types/memory.js';

describe('Chunk Factory', () => {
  beforeEach(() => {
    resetChunkCounter();
  });

  it('should create a basic chunk with defaults', () => {
    const chunk = createChunkSync();

    expect(chunk.id).toMatch(/^chunk-\d+$/);
    expect(chunk.content).toBeDefined();
    expect(chunk.embedding).toHaveLength(384);
    expect(chunk.importance).toBe(0.5);
    expect(chunk.decayScore).toBe(1.0);
    expect(chunk.chunkType).toBe(ChunkType.DOCUMENTATION);
  });

  it('should create a solution chunk', () => {
    const chunk = createSolutionChunk('Error in module', 'Install the dependency');

    expect(chunk.chunkType).toBe(ChunkType.SOLUTION);
    expect(chunk.content).toContain('Problem:');
    expect(chunk.content).toContain('Solution:');
    expect(chunk.importance).toBe(0.8);
  });

  it('should create a pattern chunk', () => {
    const chunk = createPatternChunk('Singleton', 'class Singleton {}');

    expect(chunk.chunkType).toBe(ChunkType.PATTERN);
    expect(chunk.content).toContain('Pattern: Singleton');
  });

  it('should create a decision chunk', () => {
    const chunk = createDecisionChunk('Database', 'Use PostgreSQL', 'Better for complex queries');

    expect(chunk.chunkType).toBe(ChunkType.DECISION);
    expect(chunk.importance).toBe(0.9);
  });

  it('should create a code chunk with language entity', () => {
    const chunk = createCodeChunk('typescript', 'const x = 1;');

    expect(chunk.chunkType).toBe(ChunkType.CODE);
    expect(chunk.entities).toHaveLength(1);
    expect(chunk.entities[0].type).toBe(EntityType.LANGUAGE);
    expect(chunk.entities[0].value).toBe('typescript');
  });

  it('should create an archived chunk', () => {
    const chunk = createArchivedChunk();

    expect(chunk.isArchived).toBe(true);
    expect(chunk.decayScore).toBe(0.1);
  });

  it('should create high importance chunk', () => {
    const chunk = createHighImportanceChunk();

    expect(chunk.importance).toBe(0.95);
    expect(chunk.accessCount).toBe(50);
  });

  it('should create related chunks with cross-references', () => {
    const chunks = createRelatedChunks(3);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].relatedChunkIds).not.toContain(chunks[0].id);
    expect(chunks[0].relatedChunkIds).toContain(chunks[1].id);
    expect(chunks[0].relatedChunkIds).toContain(chunks[2].id);
  });
});

describe('Conversation Factory', () => {
  beforeEach(() => {
    resetConversationCounter();
  });

  it('should create a basic conversation', () => {
    const conv = createConversation();

    expect(conv.id).toMatch(/^conv-\d+$/);
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0].role).toBe('user');
    expect(conv.messages[1].role).toBe('assistant');
  });

  it('should create a problem-solving conversation', () => {
    const conv = createProblemSolvingConversation('App crashes', 'Check null pointer');

    expect(conv.messages[0].content).toContain('problem');
    expect(conv.messages[1].content).toContain('solve');
  });

  it('should create a multi-turn conversation', () => {
    const conv = createMultiTurnConversation([
      { user: 'Hello', assistant: 'Hi!' },
      { user: 'How are you?', assistant: 'Good!' },
      { user: 'Goodbye', assistant: 'Bye!' },
    ]);

    expect(conv.messages).toHaveLength(6);
  });

  it('should create an error resolution conversation', () => {
    const conv = createErrorResolutionConversation(
      'TypeError: undefined',
      'Add null check',
      ['app.ts', 'utils.ts']
    );

    expect(conv.messages[0].content).toContain('TypeError');
    expect(conv.messages[1].content).toContain('Files affected');
  });
});

describe('Relationship Factory', () => {
  beforeEach(() => {
    resetRelationshipCounter();
  });

  it('should create a basic relationship', () => {
    const rel = createRelationship();

    expect(rel.id).toMatch(/^rel-\d+$/);
    expect(rel.relationshipType).toBe(RelationshipType.RELATES_TO);
    expect(rel.strength).toBe(1.0);
  });

  it('should create a solves relationship', () => {
    const rel = createSolvesRelationship('sol-1', 'prob-1');

    expect(rel.sourceChunkId).toBe('sol-1');
    expect(rel.targetChunkId).toBe('prob-1');
    expect(rel.relationshipType).toBe(RelationshipType.SOLVES);
  });

  it('should create a contradiction relationship', () => {
    const rel = createContradictionRelationship('chunk-1', 'chunk-2', 0.9);

    expect(rel.relationshipType).toBe(RelationshipType.CONTRADICTS);
    expect(rel.strength).toBe(0.9);
  });

  it('should create a chain of relationships', () => {
    const chain = createChainOfRelationships(['a', 'b', 'c', 'd']);

    expect(chain).toHaveLength(3);
    expect(chain[0].sourceChunkId).toBe('a');
    expect(chain[0].targetChunkId).toBe('b');
    expect(chain[2].sourceChunkId).toBe('c');
    expect(chain[2].targetChunkId).toBe('d');
  });

  it('should create bidirectional relationships', () => {
    const rels = createBidirectionalRelationship('a', 'b', RelationshipType.SIMILAR_TO);

    expect(rels).toHaveLength(2);
    expect(rels[0].sourceChunkId).toBe('a');
    expect(rels[0].targetChunkId).toBe('b');
    expect(rels[1].sourceChunkId).toBe('b');
    expect(rels[1].targetChunkId).toBe('a');
  });
});

describe('Category Factory', () => {
  beforeEach(() => {
    resetCategoryCounters();
  });

  it('should create a basic category', () => {
    const cat = createCategory();

    expect(cat.id).toMatch(/^cat-\d+$/);
    expect(cat.parentId).toBeNull();
    expect(cat.chunkCount).toBe(0);
  });

  it('should create a category hierarchy', () => {
    const hierarchy = createCategoryHierarchy(3);

    expect(hierarchy).toHaveLength(3);
    expect(hierarchy[0].parentId).toBeNull();
    expect(hierarchy[1].parentId).toBe(hierarchy[0].id);
    expect(hierarchy[2].parentId).toBe(hierarchy[1].id);
  });

  it('should create tech categories', () => {
    const categories = createTechCategories();

    expect(categories.length).toBeGreaterThan(5);
    const names = categories.map(c => c.name);
    expect(names).toContain('Frontend');
    expect(names).toContain('Backend');
    expect(names).toContain('Testing');
  });

  it('should create category with items', () => {
    const { category, items } = createCategoryWithItems({ name: 'Test Category' }, 5);

    expect(category.name).toBe('Test Category');
    expect(category.chunkCount).toBe(5);
    expect(items).toHaveLength(5);
    items.forEach(item => {
      expect(item.categoryId).toBe(category.id);
    });
  });
});

describe('Knowledge Factory', () => {
  beforeEach(() => {
    resetKnowledgeCounter();
  });

  it('should create empty extracted knowledge', () => {
    const knowledge = createExtractedKnowledge('conv-1');

    expect(knowledge.conversationId).toBe('conv-1');
    expect(knowledge.solutions).toHaveLength(0);
    expect(knowledge.patterns).toHaveLength(0);
  });

  it('should create an extracted solution', () => {
    const solution = createExtractedSolution({
      problem: 'Test problem',
      solution: 'Test solution',
    });

    expect(solution.id).toMatch(/^sol-\d+$/);
    expect(solution.problem).toBe('Test problem');
    expect(solution.confidence).toBeGreaterThanOrEqual(0);
    expect(solution.confidence).toBeLessThanOrEqual(1);
  });

  it('should create an extracted pattern', () => {
    const pattern = createExtractedPattern({
      name: 'Factory Pattern',
      language: 'typescript',
    });

    expect(pattern.name).toBe('Factory Pattern');
    expect(pattern.language).toBe('typescript');
  });

  it('should create an extracted decision', () => {
    const decision = createExtractedDecision({
      topic: 'Database',
      decision: 'Use PostgreSQL',
    });

    expect(decision.topic).toBe('Database');
    expect(decision.alternatives).toBeDefined();
  });

  it('should create full extracted knowledge', () => {
    const knowledge = createFullExtractedKnowledge('conv-1');

    expect(knowledge.solutions.length).toBeGreaterThan(0);
    expect(knowledge.patterns.length).toBeGreaterThan(0);
    expect(knowledge.decisions.length).toBeGreaterThan(0);
    expect(knowledge.standards.length).toBeGreaterThan(0);
    expect(knowledge.preferences.length).toBeGreaterThan(0);
    expect(knowledge.entities.length).toBeGreaterThan(0);
  });
});
