import { describe, it, expect } from 'vitest';
import {
  createEmptyExtractedKnowledge,
  normalizeConfidence,
  filterByConfidence,
  countExtractedItems,
  DEFAULT_EXTRACTION_CONFIG,
} from '../../../src/types/extractedKnowledge.js';
import {
  createExtractedKnowledge,
  createExtractedSolution,
  createExtractedPattern,
  createExtractedDecision,
  createExtractedStandard,
  createExtractedPreference,
} from '../../factories/knowledge.js';

describe('createEmptyExtractedKnowledge', () => {
  it('should create empty knowledge with conversation ID', () => {
    const knowledge = createEmptyExtractedKnowledge('conv-123');

    expect(knowledge.conversationId).toBe('conv-123');
    expect(knowledge.extractedAt).toBeInstanceOf(Date);
    expect(knowledge.solutions).toEqual([]);
    expect(knowledge.patterns).toEqual([]);
    expect(knowledge.decisions).toEqual([]);
    expect(knowledge.standards).toEqual([]);
    expect(knowledge.preferences).toEqual([]);
    expect(knowledge.entities).toEqual([]);
  });
});

describe('normalizeConfidence', () => {
  it('should return value unchanged if within bounds', () => {
    expect(normalizeConfidence(0.5)).toBe(0.5);
    expect(normalizeConfidence(0)).toBe(0);
    expect(normalizeConfidence(1)).toBe(1);
  });

  it('should clamp values above 1 to 1', () => {
    expect(normalizeConfidence(1.5)).toBe(1);
    expect(normalizeConfidence(100)).toBe(1);
  });

  it('should clamp values below 0 to 0', () => {
    expect(normalizeConfidence(-0.5)).toBe(0);
    expect(normalizeConfidence(-100)).toBe(0);
  });
});

describe('filterByConfidence', () => {
  it('should filter items below threshold', () => {
    const items = [
      { confidence: 0.9, value: 'high' },
      { confidence: 0.5, value: 'medium' },
      { confidence: 0.3, value: 'low' },
    ];

    const filtered = filterByConfidence(items, 0.6);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].value).toBe('high');
  });

  it('should include items at exactly the threshold', () => {
    const items = [
      { confidence: 0.6, value: 'exact' },
      { confidence: 0.59, value: 'below' },
    ];

    const filtered = filterByConfidence(items, 0.6);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].value).toBe('exact');
  });

  it('should return empty array if no items meet threshold', () => {
    const items = [
      { confidence: 0.3, value: 'low' },
      { confidence: 0.4, value: 'medium' },
    ];

    const filtered = filterByConfidence(items, 0.9);
    expect(filtered).toEqual([]);
  });

  it('should return all items if threshold is 0', () => {
    const items = [
      { confidence: 0.1, value: 'a' },
      { confidence: 0.5, value: 'b' },
    ];

    const filtered = filterByConfidence(items, 0);
    expect(filtered).toHaveLength(2);
  });
});

describe('countExtractedItems', () => {
  it('should count all item types', () => {
    const knowledge = createExtractedKnowledge('conv-1', {
      solutions: [createExtractedSolution(), createExtractedSolution()],
      patterns: [createExtractedPattern()],
      decisions: [createExtractedDecision(), createExtractedDecision(), createExtractedDecision()],
      standards: [createExtractedStandard()],
      preferences: [createExtractedPreference(), createExtractedPreference()],
    });

    const count = countExtractedItems(knowledge);
    expect(count).toBe(9);
  });

  it('should return 0 for empty knowledge', () => {
    const knowledge = createEmptyExtractedKnowledge('conv-1');
    expect(countExtractedItems(knowledge)).toBe(0);
  });
});

describe('DEFAULT_EXTRACTION_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_EXTRACTION_CONFIG.extractSolutions).toBe(true);
    expect(DEFAULT_EXTRACTION_CONFIG.extractPatterns).toBe(true);
    expect(DEFAULT_EXTRACTION_CONFIG.extractDecisions).toBe(true);
    expect(DEFAULT_EXTRACTION_CONFIG.extractStandards).toBe(true);
    expect(DEFAULT_EXTRACTION_CONFIG.extractPreferences).toBe(true);
  });

  it('should have confidence threshold between 0 and 1', () => {
    expect(DEFAULT_EXTRACTION_CONFIG.minConfidence).toBeGreaterThan(0);
    expect(DEFAULT_EXTRACTION_CONFIG.minConfidence).toBeLessThan(1);
  });

  it('should have reasonable max items limit', () => {
    expect(DEFAULT_EXTRACTION_CONFIG.maxItemsPerType).toBeGreaterThan(0);
    expect(DEFAULT_EXTRACTION_CONFIG.maxItemsPerType).toBeLessThanOrEqual(100);
  });
});

describe('ExtractedSolution type', () => {
  it('should have all required fields', () => {
    const solution = createExtractedSolution({
      problem: 'Test problem',
      solution: 'Test solution',
      confidence: 0.85,
    });

    expect(solution.id).toBeDefined();
    expect(solution.problem).toBe('Test problem');
    expect(solution.solution).toBe('Test solution');
    expect(solution.confidence).toBe(0.85);
    expect(solution.codeChanges).toEqual([]);
    expect(solution.filesAffected).toEqual([]);
    expect(solution.tags).toBeDefined();
    expect(solution.sourceMessageIndices).toBeDefined();
  });

  it('should support optional error message', () => {
    const solution = createExtractedSolution({
      errorMessage: 'TypeError: undefined is not a function',
    });

    expect(solution.errorMessage).toBe('TypeError: undefined is not a function');
  });
});

describe('ExtractedPattern type', () => {
  it('should have all required fields', () => {
    const pattern = createExtractedPattern({
      name: 'Factory Pattern',
      description: 'Creates objects without specifying class',
      useCase: 'Object creation',
      implementation: 'class Factory {}',
      language: 'typescript',
    });

    expect(pattern.name).toBe('Factory Pattern');
    expect(pattern.description).toBe('Creates objects without specifying class');
    expect(pattern.useCase).toBe('Object creation');
    expect(pattern.implementation).toBe('class Factory {}');
    expect(pattern.language).toBe('typescript');
    expect(pattern.relatedPatterns).toEqual([]);
  });
});

describe('ExtractedDecision type', () => {
  it('should have all required fields', () => {
    const decision = createExtractedDecision({
      topic: 'State Management',
      decision: 'Use Redux',
      reasoning: 'Complex state requirements',
      context: 'Large dashboard app',
    });

    expect(decision.topic).toBe('State Management');
    expect(decision.decision).toBe('Use Redux');
    expect(decision.reasoning).toBe('Complex state requirements');
    expect(decision.context).toBe('Large dashboard app');
  });

  it('should support alternatives and tradeoffs', () => {
    const decision = createExtractedDecision({
      alternatives: ['Context API', 'Zustand', 'Jotai'],
      tradeoffs: ['Learning curve', 'Bundle size'],
    });

    expect(decision.alternatives).toContain('Context API');
    expect(decision.tradeoffs).toContain('Learning curve');
  });
});

describe('ExtractedStandard type', () => {
  it('should have all required fields', () => {
    const standard = createExtractedStandard({
      category: 'Naming',
      rule: 'Use camelCase for variables',
    });

    expect(standard.category).toBe('Naming');
    expect(standard.rule).toBe('Use camelCase for variables');
    expect(standard.examples).toBeDefined();
  });

  it('should support examples and counter-examples', () => {
    const standard = createExtractedStandard({
      examples: ['const myVar = 1'],
      counterExamples: ['const my_var = 1'],
      rationale: 'Consistency',
    });

    expect(standard.examples).toContain('const myVar = 1');
    expect(standard.counterExamples).toContain('const my_var = 1');
    expect(standard.rationale).toBe('Consistency');
  });
});

describe('ExtractedPreference type', () => {
  it('should have all required fields', () => {
    const preference = createExtractedPreference({
      aspect: 'Quotes',
      preference: 'Single quotes',
      context: 'JavaScript code',
    });

    expect(preference.aspect).toBe('Quotes');
    expect(preference.preference).toBe('Single quotes');
    expect(preference.context).toBe('JavaScript code');
  });

  it('should support correction field', () => {
    const preference = createExtractedPreference({
      correction: 'Changed from double to single quotes',
    });

    expect(preference.correction).toBe('Changed from double to single quotes');
  });
});
