import { EntityType } from '../../src/types/memory.js';
import type {
  ExtractedKnowledge,
  ExtractedSolution,
  ExtractedPattern,
  ExtractedDecision,
  ExtractedStandard,
  ExtractedPreference,
  ExtractedEntity,
  CodeChange,
} from '../../src/types/extractedKnowledge.js';

let knowledgeCounter = 0;

export function createExtractedKnowledge(
  conversationId: string,
  options: Partial<ExtractedKnowledge> = {}
): ExtractedKnowledge {
  return {
    conversationId,
    extractedAt: options.extractedAt ?? new Date(),
    solutions: options.solutions ?? [],
    patterns: options.patterns ?? [],
    decisions: options.decisions ?? [],
    standards: options.standards ?? [],
    preferences: options.preferences ?? [],
    entities: options.entities ?? [],
  };
}

export interface SolutionFactoryOptions {
  id?: string;
  problem?: string;
  errorMessage?: string;
  solution?: string;
  codeChanges?: CodeChange[];
  filesAffected?: string[];
  tags?: string[];
  confidence?: number;
  sourceMessageIndices?: number[];
}

export function createExtractedSolution(options: SolutionFactoryOptions = {}): ExtractedSolution {
  knowledgeCounter++;
  return {
    id: options.id ?? `sol-${knowledgeCounter}`,
    problem: options.problem ?? 'Test problem description',
    errorMessage: options.errorMessage,
    solution: options.solution ?? 'Test solution description',
    codeChanges: options.codeChanges ?? [],
    filesAffected: options.filesAffected ?? [],
    tags: options.tags ?? ['test'],
    confidence: options.confidence ?? 0.8,
    sourceMessageIndices: options.sourceMessageIndices ?? [0, 1],
  };
}

export interface PatternFactoryOptions {
  id?: string;
  name?: string;
  description?: string;
  useCase?: string;
  implementation?: string;
  language?: string;
  relatedPatterns?: string[];
  tags?: string[];
  confidence?: number;
  sourceMessageIndices?: number[];
}

export function createExtractedPattern(options: PatternFactoryOptions = {}): ExtractedPattern {
  knowledgeCounter++;
  return {
    id: options.id ?? `pat-${knowledgeCounter}`,
    name: options.name ?? 'Test Pattern',
    description: options.description ?? 'A test pattern for unit testing',
    useCase: options.useCase ?? 'When testing factory functions',
    implementation: options.implementation ?? 'function testPattern() { return true; }',
    language: options.language ?? 'typescript',
    relatedPatterns: options.relatedPatterns ?? [],
    tags: options.tags ?? ['testing', 'pattern'],
    confidence: options.confidence ?? 0.7,
    sourceMessageIndices: options.sourceMessageIndices ?? [0, 1],
  };
}

export interface DecisionFactoryOptions {
  id?: string;
  topic?: string;
  decision?: string;
  reasoning?: string;
  alternatives?: string[];
  tradeoffs?: string[];
  context?: string;
  tags?: string[];
  confidence?: number;
  sourceMessageIndices?: number[];
}

export function createExtractedDecision(options: DecisionFactoryOptions = {}): ExtractedDecision {
  knowledgeCounter++;
  return {
    id: options.id ?? `dec-${knowledgeCounter}`,
    topic: options.topic ?? 'Technology Choice',
    decision: options.decision ?? 'Use TypeScript',
    reasoning: options.reasoning ?? 'Type safety improves code quality',
    alternatives: options.alternatives ?? ['JavaScript'],
    tradeoffs: options.tradeoffs ?? ['Steeper learning curve'],
    context: options.context ?? 'New project setup',
    tags: options.tags ?? ['architecture'],
    confidence: options.confidence ?? 0.9,
    sourceMessageIndices: options.sourceMessageIndices ?? [0, 1],
  };
}

export interface StandardFactoryOptions {
  id?: string;
  category?: string;
  rule?: string;
  examples?: string[];
  counterExamples?: string[];
  rationale?: string;
  tags?: string[];
  confidence?: number;
  sourceMessageIndices?: number[];
}

export function createExtractedStandard(options: StandardFactoryOptions = {}): ExtractedStandard {
  knowledgeCounter++;
  return {
    id: options.id ?? `std-${knowledgeCounter}`,
    category: options.category ?? 'Code Style',
    rule: options.rule ?? 'Use camelCase for variable names',
    examples: options.examples ?? ['const myVariable = 1'],
    counterExamples: options.counterExamples ?? ['const my_variable = 1'],
    rationale: options.rationale ?? 'Consistency with TypeScript conventions',
    tags: options.tags ?? ['style'],
    confidence: options.confidence ?? 0.85,
    sourceMessageIndices: options.sourceMessageIndices ?? [0, 1],
  };
}

export interface PreferenceFactoryOptions {
  id?: string;
  aspect?: string;
  preference?: string;
  correction?: string;
  context?: string;
  confidence?: number;
  sourceMessageIndices?: number[];
}

export function createExtractedPreference(options: PreferenceFactoryOptions = {}): ExtractedPreference {
  knowledgeCounter++;
  return {
    id: options.id ?? `pref-${knowledgeCounter}`,
    aspect: options.aspect ?? 'Code formatting',
    preference: options.preference ?? 'Single quotes for strings',
    correction: options.correction,
    context: options.context ?? 'TypeScript projects',
    confidence: options.confidence ?? 0.75,
    sourceMessageIndices: options.sourceMessageIndices ?? [0, 1],
  };
}

export interface EntityFactoryOptions {
  type?: EntityType;
  name?: string;
  description?: string;
  relationships?: Array<{
    targetEntity: string;
    relationshipType: string;
    strength: number;
  }>;
}

export function createExtractedEntity(options: EntityFactoryOptions = {}): ExtractedEntity {
  return {
    type: options.type ?? EntityType.FRAMEWORK,
    name: options.name ?? 'Test Framework',
    description: options.description,
    relationships: options.relationships ?? [],
  };
}

export function createCodeChange(options: Partial<CodeChange> = {}): CodeChange {
  return {
    filename: options.filename,
    language: options.language ?? 'typescript',
    before: options.before,
    after: options.after ?? 'const fixed = true;',
    explanation: options.explanation,
  };
}

export function createFullExtractedKnowledge(conversationId: string): ExtractedKnowledge {
  return createExtractedKnowledge(conversationId, {
    solutions: [createExtractedSolution()],
    patterns: [createExtractedPattern()],
    decisions: [createExtractedDecision()],
    standards: [createExtractedStandard()],
    preferences: [createExtractedPreference()],
    entities: [
      createExtractedEntity({ type: EntityType.LANGUAGE, name: 'TypeScript' }),
      createExtractedEntity({ type: EntityType.FRAMEWORK, name: 'Vitest' }),
    ],
  });
}

export function resetKnowledgeCounter(): void {
  knowledgeCounter = 0;
}
