import { describe, it, expect } from 'vitest';
import {
  RelationshipType,
  RELATIONSHIP_CATEGORIES,
  BIDIRECTIONAL_RELATIONSHIPS,
  REVERSE_RELATIONSHIP_MAP,
  isBidirectional,
  getReverseType,
  getRelationshipsByCategory,
  DEFAULT_TRAVERSAL_OPTIONS,
} from '../../../src/types/relationships.js';

describe('RelationshipType enum', () => {
  it('should have all expected relationship types', () => {
    expect(RelationshipType.RELATES_TO).toBe('relates_to');
    expect(RelationshipType.SIMILAR_TO).toBe('similar_to');
    expect(RelationshipType.SOLVES).toBe('solves');
    expect(RelationshipType.SUPERSEDES).toBe('supersedes');
    expect(RelationshipType.CONTRADICTS).toBe('contradicts');
    expect(RelationshipType.DEPENDS_ON).toBe('depends_on');
  });

  it('should have correct number of relationship types', () => {
    const types = Object.values(RelationshipType);
    expect(types.length).toBeGreaterThanOrEqual(15);
  });
});

describe('RELATIONSHIP_CATEGORIES', () => {
  it('should have all main categories', () => {
    expect(RELATIONSHIP_CATEGORIES.semantic).toBeDefined();
    expect(RELATIONSHIP_CATEGORIES.causal).toBeDefined();
    expect(RELATIONSHIP_CATEGORIES.temporal).toBeDefined();
    expect(RELATIONSHIP_CATEGORIES.conflict).toBeDefined();
    expect(RELATIONSHIP_CATEGORIES.preference).toBeDefined();
    expect(RELATIONSHIP_CATEGORIES.structural).toBeDefined();
  });

  it('should contain RELATES_TO and SIMILAR_TO in semantic category', () => {
    expect(RELATIONSHIP_CATEGORIES.semantic).toContain(RelationshipType.RELATES_TO);
    expect(RELATIONSHIP_CATEGORIES.semantic).toContain(RelationshipType.SIMILAR_TO);
  });

  it('should contain SOLVES in causal category', () => {
    expect(RELATIONSHIP_CATEGORIES.causal).toContain(RelationshipType.SOLVES);
    expect(RELATIONSHIP_CATEGORIES.causal).toContain(RelationshipType.LEADS_TO);
    expect(RELATIONSHIP_CATEGORIES.causal).toContain(RelationshipType.DERIVES_FROM);
  });

  it('should contain SUPERSEDES in temporal category', () => {
    expect(RELATIONSHIP_CATEGORIES.temporal).toContain(RelationshipType.SUPERSEDES);
    expect(RELATIONSHIP_CATEGORIES.temporal).toContain(RelationshipType.EVOLVED_INTO);
  });

  it('should contain CONTRADICTS in conflict category', () => {
    expect(RELATIONSHIP_CATEGORIES.conflict).toContain(RelationshipType.CONTRADICTS);
    expect(RELATIONSHIP_CATEGORIES.conflict).toContain(RelationshipType.INVALIDATED_BY);
  });

  it('should have non-overlapping categories', () => {
    const allTypes = new Set<RelationshipType>();
    let totalCount = 0;

    for (const category of Object.values(RELATIONSHIP_CATEGORIES)) {
      for (const type of category) {
        allTypes.add(type);
        totalCount++;
      }
    }

    expect(allTypes.size).toBe(totalCount);
  });
});

describe('BIDIRECTIONAL_RELATIONSHIPS', () => {
  it('should include RELATES_TO', () => {
    expect(BIDIRECTIONAL_RELATIONSHIPS.has(RelationshipType.RELATES_TO)).toBe(true);
  });

  it('should include SIMILAR_TO', () => {
    expect(BIDIRECTIONAL_RELATIONSHIPS.has(RelationshipType.SIMILAR_TO)).toBe(true);
  });

  it('should include CONTRADICTS', () => {
    expect(BIDIRECTIONAL_RELATIONSHIPS.has(RelationshipType.CONTRADICTS)).toBe(true);
  });

  it('should NOT include directional types like SOLVES', () => {
    expect(BIDIRECTIONAL_RELATIONSHIPS.has(RelationshipType.SOLVES)).toBe(false);
    expect(BIDIRECTIONAL_RELATIONSHIPS.has(RelationshipType.LEADS_TO)).toBe(false);
    expect(BIDIRECTIONAL_RELATIONSHIPS.has(RelationshipType.SUPERSEDES)).toBe(false);
  });
});

describe('isBidirectional', () => {
  it('should return true for bidirectional types', () => {
    expect(isBidirectional(RelationshipType.RELATES_TO)).toBe(true);
    expect(isBidirectional(RelationshipType.SIMILAR_TO)).toBe(true);
    expect(isBidirectional(RelationshipType.CONTRADICTS)).toBe(true);
  });

  it('should return false for unidirectional types', () => {
    expect(isBidirectional(RelationshipType.SOLVES)).toBe(false);
    expect(isBidirectional(RelationshipType.LEADS_TO)).toBe(false);
    expect(isBidirectional(RelationshipType.SUPERSEDES)).toBe(false);
    expect(isBidirectional(RelationshipType.DEPENDS_ON)).toBe(false);
  });
});

describe('getReverseType', () => {
  it('should return same type for bidirectional relationships', () => {
    expect(getReverseType(RelationshipType.RELATES_TO)).toBe(RelationshipType.RELATES_TO);
    expect(getReverseType(RelationshipType.SIMILAR_TO)).toBe(RelationshipType.SIMILAR_TO);
    expect(getReverseType(RelationshipType.CONTRADICTS)).toBe(RelationshipType.CONTRADICTS);
  });

  it('should return correct reverse for LEADS_TO <-> DERIVES_FROM', () => {
    expect(getReverseType(RelationshipType.LEADS_TO)).toBe(RelationshipType.DERIVES_FROM);
    expect(getReverseType(RelationshipType.DERIVES_FROM)).toBe(RelationshipType.LEADS_TO);
  });

  it('should return correct reverse for IMPLEMENTS <-> EXEMPLIFIES', () => {
    expect(getReverseType(RelationshipType.IMPLEMENTS)).toBe(RelationshipType.EXEMPLIFIES);
    expect(getReverseType(RelationshipType.EXEMPLIFIES)).toBe(RelationshipType.IMPLEMENTS);
  });

  it('should be defined for all relationship types', () => {
    for (const type of Object.values(RelationshipType)) {
      expect(REVERSE_RELATIONSHIP_MAP[type]).toBeDefined();
    }
  });
});

describe('getRelationshipsByCategory', () => {
  it('should return semantic relationships', () => {
    const semantic = getRelationshipsByCategory('semantic');
    expect(semantic).toContain(RelationshipType.RELATES_TO);
    expect(semantic).toContain(RelationshipType.SIMILAR_TO);
  });

  it('should return causal relationships', () => {
    const causal = getRelationshipsByCategory('causal');
    expect(causal).toContain(RelationshipType.SOLVES);
    expect(causal).toContain(RelationshipType.LEADS_TO);
  });

  it('should return temporal relationships', () => {
    const temporal = getRelationshipsByCategory('temporal');
    expect(temporal).toContain(RelationshipType.SUPERSEDES);
  });

  it('should return conflict relationships', () => {
    const conflict = getRelationshipsByCategory('conflict');
    expect(conflict).toContain(RelationshipType.CONTRADICTS);
    expect(conflict).toContain(RelationshipType.INVALIDATED_BY);
  });

  it('should return structural relationships', () => {
    const structural = getRelationshipsByCategory('structural');
    expect(structural).toContain(RelationshipType.PART_OF);
    expect(structural).toContain(RelationshipType.DEPENDS_ON);
    expect(structural).toContain(RelationshipType.IMPLEMENTS);
  });

  it('should return a copy, not the original array', () => {
    const semantic1 = getRelationshipsByCategory('semantic');
    const semantic2 = getRelationshipsByCategory('semantic');
    expect(semantic1).not.toBe(semantic2);
    expect(semantic1).toEqual(semantic2);
  });
});

describe('DEFAULT_TRAVERSAL_OPTIONS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_TRAVERSAL_OPTIONS.maxDepth).toBe(2);
    expect(DEFAULT_TRAVERSAL_OPTIONS.minStrength).toBe(0.3);
    expect(DEFAULT_TRAVERSAL_OPTIONS.excludeArchived).toBe(true);
    expect(DEFAULT_TRAVERSAL_OPTIONS.includeMetadata).toBe(false);
    expect(DEFAULT_TRAVERSAL_OPTIONS.direction).toBe('both');
  });
});
