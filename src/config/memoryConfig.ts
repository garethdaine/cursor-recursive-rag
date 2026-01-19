import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { ChunkType } from '../types/memory.js';

export const MEMORY_CONFIG_DIR = join(homedir(), '.cursor-rag');
export const MEMORY_CONFIG_FILE = join(MEMORY_CONFIG_DIR, 'memory-config.json');

const ScoreWeightsSchema = z.object({
  similarity: z.number().min(0).max(1).default(0.35),
  decay: z.number().min(0).max(1).default(0.20),
  importance: z.number().min(0).max(1).default(0.15),
  recency: z.number().min(0).max(1).default(0.10),
  graphBoost: z.number().min(0).max(1).default(0.10),
  typeBoost: z.number().min(0).max(1).default(0.10),
});

const DecayConfigSchema = z.object({
  halfLifeDays: z.number().positive().default(60),
  expectedAccessesPerMonth: z.number().positive().default(5),
  recencyBoostDays: z.number().positive().default(7),
  recencyBoostMultiplier: z.number().positive().default(1.5),
  archivalThreshold: z.number().min(0).max(1).default(0.2),
});

const MaintenanceConfigSchema = z.object({
  enableAutoScheduling: z.boolean().default(false),
  nightlyHour: z.number().min(0).max(23).default(3),
  weeklyDay: z.number().min(0).max(6).default(0),
  weeklyHour: z.number().min(0).max(23).default(4),
  monthlyDay: z.number().min(1).max(28).default(1),
  monthlyHour: z.number().min(0).max(23).default(5),
  autoArchiveOnDecayUpdate: z.boolean().default(false),
});

const RetrievalConfigSchema = z.object({
  defaultTopK: z.number().positive().default(10),
  overFetchMultiplier: z.number().positive().default(2),
  minDecayScore: z.number().min(0).max(1).default(0.1),
  includeArchived: z.boolean().default(false),
  enableTieredRetrieval: z.boolean().default(true),
  maxSummariesPerQuery: z.number().positive().default(3),
  graphTraversalDepth: z.number().min(1).max(5).default(2),
  graphMinStrength: z.number().min(0).max(1).default(0.3),
});

const KnowledgeExtractionConfigSchema = z.object({
  enableLLMExtraction: z.boolean().default(false),
  llmEndpoint: z.string().optional(),
  llmApiKey: z.string().optional(),
  llmModel: z.string().default('gpt-4o-mini'),
  extractSolutions: z.boolean().default(true),
  extractPatterns: z.boolean().default(true),
  extractDecisions: z.boolean().default(true),
  extractStandards: z.boolean().default(true),
  minConfidenceThreshold: z.number().min(0).max(1).default(0.7),
});

const CategoryConfigSchema = z.object({
  maxCategoriesPerChunk: z.number().positive().default(3),
  minRelevanceScore: z.number().min(0).max(1).default(0.4),
  enableLLMClassification: z.boolean().default(false),
  enableLLMSummaries: z.boolean().default(false),
  summaryMaxItems: z.number().positive().default(20),
});

const TypeBoostsSchema = z.record(z.string(), z.number().positive()).default({
  solution: 1.2,
  pattern: 1.15,
  decision: 1.1,
  standard: 1.05,
  documentation: 1.0,
  code: 1.0,
  preference: 0.9,
  category_summary: 1.3,
});

export const MemoryConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  scoreWeights: ScoreWeightsSchema.default({}),
  decayConfig: DecayConfigSchema.default({}),
  maintenanceConfig: MaintenanceConfigSchema.default({}),
  retrievalConfig: RetrievalConfigSchema.default({}),
  knowledgeExtractionConfig: KnowledgeExtractionConfigSchema.default({}),
  categoryConfig: CategoryConfigSchema.default({}),
  typeBoosts: TypeBoostsSchema,
  databasePath: z.string().optional(),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type ScoreWeights = z.infer<typeof ScoreWeightsSchema>;
export type DecayConfig = z.infer<typeof DecayConfigSchema>;
export type MaintenanceConfig = z.infer<typeof MaintenanceConfigSchema>;
export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;
export type KnowledgeExtractionConfig = z.infer<typeof KnowledgeExtractionConfigSchema>;
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>;

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = MemoryConfigSchema.parse({});

export function loadMemoryConfig(): MemoryConfig {
  if (!existsSync(MEMORY_CONFIG_FILE)) {
    return DEFAULT_MEMORY_CONFIG;
  }

  try {
    const content = readFileSync(MEMORY_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return MemoryConfigSchema.parse(parsed);
  } catch (error) {
    console.warn(`Failed to load memory config, using defaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return DEFAULT_MEMORY_CONFIG;
  }
}

export function saveMemoryConfig(config: MemoryConfig): void {
  if (!existsSync(MEMORY_CONFIG_DIR)) {
    mkdirSync(MEMORY_CONFIG_DIR, { recursive: true });
  }

  const validated = MemoryConfigSchema.parse(config);
  writeFileSync(MEMORY_CONFIG_FILE, JSON.stringify(validated, null, 2));
}

export function getMemoryConfigWithEnvOverrides(): MemoryConfig {
  const baseConfig = loadMemoryConfig();

  // Environment variable overrides
  const envOverrides: Partial<MemoryConfig> = {};

  if (process.env.CURSOR_RAG_LLM_ENDPOINT) {
    envOverrides.knowledgeExtractionConfig = {
      ...baseConfig.knowledgeExtractionConfig,
      llmEndpoint: process.env.CURSOR_RAG_LLM_ENDPOINT,
      enableLLMExtraction: true,
    };
  }

  if (process.env.CURSOR_RAG_LLM_API_KEY || process.env.OPENAI_API_KEY) {
    const apiKey = process.env.CURSOR_RAG_LLM_API_KEY || process.env.OPENAI_API_KEY;
    envOverrides.knowledgeExtractionConfig = {
      ...baseConfig.knowledgeExtractionConfig,
      ...envOverrides.knowledgeExtractionConfig,
      llmApiKey: apiKey,
    };
  }

  if (process.env.CURSOR_RAG_LLM_MODEL) {
    envOverrides.knowledgeExtractionConfig = {
      ...baseConfig.knowledgeExtractionConfig,
      ...envOverrides.knowledgeExtractionConfig,
      llmModel: process.env.CURSOR_RAG_LLM_MODEL,
    };
  }

  if (process.env.CURSOR_RAG_DECAY_HALF_LIFE) {
    envOverrides.decayConfig = {
      ...baseConfig.decayConfig,
      halfLifeDays: parseInt(process.env.CURSOR_RAG_DECAY_HALF_LIFE, 10),
    };
  }

  if (process.env.CURSOR_RAG_ARCHIVAL_THRESHOLD) {
    envOverrides.decayConfig = {
      ...baseConfig.decayConfig,
      ...envOverrides.decayConfig,
      archivalThreshold: parseFloat(process.env.CURSOR_RAG_ARCHIVAL_THRESHOLD),
    };
  }

  if (process.env.CURSOR_RAG_DEFAULT_TOP_K) {
    envOverrides.retrievalConfig = {
      ...baseConfig.retrievalConfig,
      defaultTopK: parseInt(process.env.CURSOR_RAG_DEFAULT_TOP_K, 10),
    };
  }

  if (process.env.CURSOR_RAG_ENABLE_TIERED_RETRIEVAL) {
    envOverrides.retrievalConfig = {
      ...baseConfig.retrievalConfig,
      ...envOverrides.retrievalConfig,
      enableTieredRetrieval: process.env.CURSOR_RAG_ENABLE_TIERED_RETRIEVAL === 'true',
    };
  }

  if (process.env.CURSOR_RAG_DATABASE_PATH) {
    envOverrides.databasePath = process.env.CURSOR_RAG_DATABASE_PATH;
  }

  if (process.env.CURSOR_RAG_AUTO_MAINTENANCE) {
    envOverrides.maintenanceConfig = {
      ...baseConfig.maintenanceConfig,
      enableAutoScheduling: process.env.CURSOR_RAG_AUTO_MAINTENANCE === 'true',
    };
  }

  return MemoryConfigSchema.parse({
    ...baseConfig,
    ...envOverrides,
  });
}

export function validateMemoryConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = MemoryConfigSchema.safeParse(config);
  
  if (result.success) {
    // Additional validation: weights should sum to approximately 1
    const weights = result.data.scoreWeights;
    const sum = weights.similarity + weights.decay + weights.importance + 
                weights.recency + weights.graphBoost + weights.typeBoost;
    
    const errors: string[] = [];
    if (sum < 0.95 || sum > 1.05) {
      errors.push(`Score weights sum to ${sum.toFixed(2)}, should be close to 1.0`);
    }

    return { valid: errors.length === 0, errors };
  }

  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { valid: false, errors };
}

export function mergeMemoryConfig(
  base: MemoryConfig,
  overrides: Partial<MemoryConfig>
): MemoryConfig {
  return MemoryConfigSchema.parse({
    ...base,
    ...overrides,
    scoreWeights: {
      ...base.scoreWeights,
      ...overrides.scoreWeights,
    },
    decayConfig: {
      ...base.decayConfig,
      ...overrides.decayConfig,
    },
    maintenanceConfig: {
      ...base.maintenanceConfig,
      ...overrides.maintenanceConfig,
    },
    retrievalConfig: {
      ...base.retrievalConfig,
      ...overrides.retrievalConfig,
    },
    knowledgeExtractionConfig: {
      ...base.knowledgeExtractionConfig,
      ...overrides.knowledgeExtractionConfig,
    },
    categoryConfig: {
      ...base.categoryConfig,
      ...overrides.categoryConfig,
    },
    typeBoosts: {
      ...base.typeBoosts,
      ...overrides.typeBoosts,
    },
  });
}

export function printMemoryConfig(config: MemoryConfig): string {
  const lines: string[] = [
    'Memory Configuration:',
    '',
    'Score Weights:',
    `  Similarity: ${config.scoreWeights.similarity}`,
    `  Decay: ${config.scoreWeights.decay}`,
    `  Importance: ${config.scoreWeights.importance}`,
    `  Recency: ${config.scoreWeights.recency}`,
    `  Graph Boost: ${config.scoreWeights.graphBoost}`,
    `  Type Boost: ${config.scoreWeights.typeBoost}`,
    '',
    'Decay Settings:',
    `  Half-life: ${config.decayConfig.halfLifeDays} days`,
    `  Archival threshold: ${config.decayConfig.archivalThreshold}`,
    `  Recency boost: ${config.decayConfig.recencyBoostMultiplier}x for ${config.decayConfig.recencyBoostDays} days`,
    '',
    'Retrieval Settings:',
    `  Default top-k: ${config.retrievalConfig.defaultTopK}`,
    `  Min decay score: ${config.retrievalConfig.minDecayScore}`,
    `  Tiered retrieval: ${config.retrievalConfig.enableTieredRetrieval ? 'enabled' : 'disabled'}`,
    `  Graph traversal depth: ${config.retrievalConfig.graphTraversalDepth}`,
    '',
    'Maintenance Settings:',
    `  Auto-scheduling: ${config.maintenanceConfig.enableAutoScheduling ? 'enabled' : 'disabled'}`,
    `  Nightly hour: ${config.maintenanceConfig.nightlyHour}:00`,
    `  Weekly: Day ${config.maintenanceConfig.weeklyDay} at ${config.maintenanceConfig.weeklyHour}:00`,
    '',
    'Knowledge Extraction:',
    `  LLM extraction: ${config.knowledgeExtractionConfig.enableLLMExtraction ? 'enabled' : 'disabled'}`,
    `  Model: ${config.knowledgeExtractionConfig.llmModel}`,
    `  Min confidence: ${config.knowledgeExtractionConfig.minConfidenceThreshold}`,
    '',
    'Category Settings:',
    `  Max per chunk: ${config.categoryConfig.maxCategoriesPerChunk}`,
    `  Min relevance: ${config.categoryConfig.minRelevanceScore}`,
    `  LLM classification: ${config.categoryConfig.enableLLMClassification ? 'enabled' : 'disabled'}`,
  ];

  return lines.join('\n');
}
