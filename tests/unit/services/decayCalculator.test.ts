import { describe, it, expect, beforeEach } from 'vitest';
import {
  DecayCalculator,
  DEFAULT_DECAY_CALCULATOR_CONFIG,
  getDecayCalculator,
  resetDecayCalculator,
} from '../../../src/services/decayCalculator.js';
import { ChunkType, type ChunkMetadata } from '../../../src/types/memory.js';

function createTestChunk(overrides: Partial<ChunkMetadata> = {}): ChunkMetadata {
  return {
    chunkId: 'test-chunk',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastAccessedAt: null,
    accessCount: 0,
    importance: 0.5,
    decayScore: 1.0,
    isArchived: false,
    chunkType: ChunkType.DOCUMENTATION,
    sourceConversationId: null,
    sourceMessageIndex: null,
    ...overrides,
  };
}

describe('DecayCalculator', () => {
  let calculator: DecayCalculator;

  beforeEach(() => {
    calculator = new DecayCalculator();
    resetDecayCalculator();
  });

  describe('configuration', () => {
    it('should use default configuration when none provided', () => {
      const config = calculator.getConfig();
      expect(config.halfLifeDays).toBe(DEFAULT_DECAY_CALCULATOR_CONFIG.halfLifeDays);
      expect(config.weights).toEqual(DEFAULT_DECAY_CALCULATOR_CONFIG.weights);
    });

    it('should merge custom configuration with defaults', () => {
      const customCalc = new DecayCalculator({ halfLifeDays: 30 });
      const config = customCalc.getConfig();

      expect(config.halfLifeDays).toBe(30);
      expect(config.weights).toEqual(DEFAULT_DECAY_CALCULATOR_CONFIG.weights);
    });

    it('should allow weight customization', () => {
      const customCalc = new DecayCalculator({
        weights: { age: 0.5, access: 0.3, importance: 0.2 },
      });
      const config = customCalc.getConfig();

      expect(config.weights.age).toBe(0.5);
      expect(config.weights.access).toBe(0.3);
      expect(config.weights.importance).toBe(0.2);
    });

    it('should update configuration', () => {
      calculator.updateConfig({ halfLifeDays: 90 });
      expect(calculator.getConfig().halfLifeDays).toBe(90);
    });
  });

  describe('calculateDecayScore', () => {
    it('should return high score for new chunks with high importance', () => {
      const chunk = createTestChunk({
        createdAt: new Date().toISOString(),
        importance: 1.0,
        accessCount: 5,
      });

      const score = calculator.calculateDecayScore(chunk);
      expect(score).toBeGreaterThan(0.8);
    });

    it('should return score between 0 and 1', () => {
      const chunk = createTestChunk();
      const score = calculator.calculateDecayScore(chunk);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should decrease score for older chunks', () => {
      const now = new Date();
      const recentChunk = createTestChunk({
        createdAt: now.toISOString(),
      });
      const oldChunk = createTestChunk({
        createdAt: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const recentScore = calculator.calculateDecayScore(recentChunk, now);
      const oldScore = calculator.calculateDecayScore(oldChunk, now);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should boost score for frequently accessed chunks', () => {
      const chunk1 = createTestChunk({ accessCount: 0 });
      const chunk2 = createTestChunk({ accessCount: 10 });

      const score1 = calculator.calculateDecayScore(chunk1);
      const score2 = calculator.calculateDecayScore(chunk2);

      expect(score2).toBeGreaterThan(score1);
    });

    it('should apply recency boost for recently accessed chunks', () => {
      const now = new Date();
      const recentlyAccessed = createTestChunk({
        accessCount: 1,
        lastAccessedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const oldAccess = createTestChunk({
        accessCount: 1,
        lastAccessedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const recentScore = calculator.calculateDecayScore(recentlyAccessed, now);
      const oldScore = calculator.calculateDecayScore(oldAccess, now);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should factor in importance', () => {
      const lowImportance = createTestChunk({ importance: 0.1 });
      const highImportance = createTestChunk({ importance: 0.9 });

      const lowScore = calculator.calculateDecayScore(lowImportance);
      const highScore = calculator.calculateDecayScore(highImportance);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should reach half decay at halfLifeDays', () => {
      const calc = new DecayCalculator({
        halfLifeDays: 60,
        weights: { age: 1, access: 0, importance: 0 },
      });

      const now = new Date();
      const newChunk = createTestChunk({ createdAt: now.toISOString() });
      const halfLifeChunk = createTestChunk({
        createdAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const newScore = calc.calculateDecayScore(newChunk, now);
      const halfLifeScore = calc.calculateDecayScore(halfLifeChunk, now);

      expect(halfLifeScore).toBeCloseTo(newScore / 2, 1);
    });
  });

  describe('calculateBatchDecayScores', () => {
    it('should calculate scores for multiple chunks', () => {
      const chunks = [
        createTestChunk({ chunkId: 'chunk-1' }),
        createTestChunk({ chunkId: 'chunk-2' }),
        createTestChunk({ chunkId: 'chunk-3' }),
      ];

      const results = calculator.calculateBatchDecayScores(chunks);

      expect(results).toHaveLength(3);
      expect(results.map(r => r.chunkId)).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);
      results.forEach(r => {
        expect(r.decayScore).toBeGreaterThanOrEqual(0);
        expect(r.decayScore).toBeLessThanOrEqual(1);
      });
    });

    it('should use provided timestamp for all calculations', () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const chunk = createTestChunk({
        chunkId: 'chunk-1',
        createdAt: pastDate.toISOString(),
      });

      const resultNow = calculator.calculateBatchDecayScores([chunk], new Date());
      const resultPast = calculator.calculateBatchDecayScores([chunk], pastDate);

      expect(resultPast[0].decayScore).toBeGreaterThan(resultNow[0].decayScore);
    });
  });

  describe('getArchivalCandidates', () => {
    it('should identify chunks below threshold', () => {
      const chunks = [
        createTestChunk({ chunkId: 'high', decayScore: 0.8 }),
        createTestChunk({ chunkId: 'low', decayScore: 0.1 }),
        createTestChunk({ chunkId: 'medium', decayScore: 0.3 }),
      ];

      const candidates = calculator.getArchivalCandidates(chunks, 0.25);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].chunkId).toBe('low');
    });

    it('should exclude already archived chunks', () => {
      const chunks = [
        createTestChunk({ chunkId: 'low', decayScore: 0.1, isArchived: false }),
        createTestChunk({ chunkId: 'archived', decayScore: 0.1, isArchived: true }),
      ];

      const candidates = calculator.getArchivalCandidates(chunks, 0.25);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].chunkId).toBe('low');
    });

    it('should use config threshold when none provided', () => {
      const calc = new DecayCalculator({ archivalThreshold: 0.3 });
      const chunks = [
        createTestChunk({ chunkId: 'below', decayScore: 0.25 }),
        createTestChunk({ chunkId: 'above', decayScore: 0.35 }),
      ];

      const candidates = calc.getArchivalCandidates(chunks);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].chunkId).toBe('below');
    });
  });

  describe('simulateDecay', () => {
    it('should simulate decay over time', () => {
      const results = calculator.simulateDecay(0.5, [], 30);

      expect(results).toHaveLength(31);
      expect(results[0].day).toBe(0);
      expect(results[30].day).toBe(30);
    });

    it('should show decay over time without access', () => {
      const results = calculator.simulateDecay(0.5, [], 60);

      const day0Score = results[0].decayScore;
      const day30Score = results[30].decayScore;
      const day60Score = results[60].decayScore;

      expect(day30Score).toBeLessThan(day0Score);
      expect(day60Score).toBeLessThan(day30Score);
    });

    it('should maintain score with regular access', () => {
      const accessPattern = Array.from({ length: 60 }, (_, i) => ({ dayOffset: i * 2 }));
      const results = calculator.simulateDecay(0.5, accessPattern, 60);

      const initialScore = results[0].decayScore;
      const finalScore = results[60].decayScore;

      expect(finalScore).toBeGreaterThan(initialScore * 0.5);
    });

    it('should boost score after access', () => {
      const accessPattern = [{ dayOffset: 10 }];
      const results = calculator.simulateDecay(0.5, accessPattern, 20);

      const beforeAccess = results[9].decayScore;
      const afterAccess = results[11].decayScore;

      expect(afterAccess).toBeGreaterThan(beforeAccess);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getDecayCalculator();
      const instance2 = getDecayCalculator();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = getDecayCalculator();
      resetDecayCalculator();
      const instance2 = getDecayCalculator();

      expect(instance1).not.toBe(instance2);
    });
  });
});
