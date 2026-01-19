import { ChunkType, EntityType, type EnhancedChunk, type EntityTag } from '../../src/types/memory.js';
import { createMockEmbeddingsAdapter } from '../mocks/embeddings.js';

let chunkCounter = 0;

export interface ChunkFactoryOptions {
  id?: string;
  content?: string;
  source?: string;
  chunkType?: ChunkType;
  importance?: number;
  decayScore?: number;
  accessCount?: number;
  isArchived?: boolean;
  entities?: EntityTag[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  lastAccessedAt?: Date | null;
  relatedChunkIds?: string[];
  sourceConversationId?: string;
  embedding?: number[];
}

export async function createChunk(options: ChunkFactoryOptions = {}): Promise<EnhancedChunk> {
  chunkCounter++;
  const embedAdapter = createMockEmbeddingsAdapter();
  const content = options.content ?? `Test chunk content ${chunkCounter}`;
  const embedding = options.embedding ?? await embedAdapter.embed(content);
  const now = new Date();

  return {
    id: options.id ?? `chunk-${chunkCounter}`,
    content,
    embedding,
    source: options.source ?? 'test',
    metadata: options.metadata ?? {},
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    lastAccessedAt: options.lastAccessedAt ?? null,
    accessCount: options.accessCount ?? 0,
    importance: options.importance ?? 0.5,
    decayScore: options.decayScore ?? 1.0,
    isArchived: options.isArchived ?? false,
    chunkType: options.chunkType ?? ChunkType.DOCUMENTATION,
    relatedChunkIds: options.relatedChunkIds ?? [],
    entities: options.entities ?? [],
    sourceConversationId: options.sourceConversationId,
  };
}

export function createChunkSync(options: ChunkFactoryOptions = {}): EnhancedChunk {
  chunkCounter++;
  const content = options.content ?? `Test chunk content ${chunkCounter}`;
  const dimension = options.embedding?.length ?? 384;
  const embedding = options.embedding ?? Array.from({ length: dimension }, () => Math.random() * 2 - 1);
  const now = new Date();

  return {
    id: options.id ?? `chunk-${chunkCounter}`,
    content,
    embedding,
    source: options.source ?? 'test',
    metadata: options.metadata ?? {},
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    lastAccessedAt: options.lastAccessedAt ?? null,
    accessCount: options.accessCount ?? 0,
    importance: options.importance ?? 0.5,
    decayScore: options.decayScore ?? 1.0,
    isArchived: options.isArchived ?? false,
    chunkType: options.chunkType ?? ChunkType.DOCUMENTATION,
    relatedChunkIds: options.relatedChunkIds ?? [],
    entities: options.entities ?? [],
    sourceConversationId: options.sourceConversationId,
  };
}

export function createSolutionChunk(problem: string, solution: string, options: ChunkFactoryOptions = {}): EnhancedChunk {
  return createChunkSync({
    ...options,
    content: `Problem: ${problem}\n\nSolution: ${solution}`,
    chunkType: ChunkType.SOLUTION,
    importance: options.importance ?? 0.8,
  });
}

export function createPatternChunk(name: string, implementation: string, options: ChunkFactoryOptions = {}): EnhancedChunk {
  return createChunkSync({
    ...options,
    content: `Pattern: ${name}\n\nImplementation:\n${implementation}`,
    chunkType: ChunkType.PATTERN,
    importance: options.importance ?? 0.7,
  });
}

export function createDecisionChunk(topic: string, decision: string, reasoning: string, options: ChunkFactoryOptions = {}): EnhancedChunk {
  return createChunkSync({
    ...options,
    content: `Topic: ${topic}\n\nDecision: ${decision}\n\nReasoning: ${reasoning}`,
    chunkType: ChunkType.DECISION,
    importance: options.importance ?? 0.9,
  });
}

export function createCodeChunk(language: string, code: string, options: ChunkFactoryOptions = {}): EnhancedChunk {
  return createChunkSync({
    ...options,
    content: code,
    chunkType: ChunkType.CODE,
    entities: [
      { type: EntityType.LANGUAGE, value: language, confidence: 1.0 },
      ...(options.entities ?? []),
    ],
  });
}

export function createArchivedChunk(options: ChunkFactoryOptions = {}): EnhancedChunk {
  return createChunkSync({
    ...options,
    isArchived: true,
    decayScore: 0.1,
    accessCount: 0,
    lastAccessedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  });
}

export function createHighImportanceChunk(options: ChunkFactoryOptions = {}): EnhancedChunk {
  return createChunkSync({
    ...options,
    importance: 0.95,
    decayScore: 1.0,
    accessCount: 50,
  });
}

export function createRelatedChunks(count: number, baseOptions: ChunkFactoryOptions = {}): EnhancedChunk[] {
  const chunks: EnhancedChunk[] = [];
  const ids: string[] = [];

  for (let i = 0; i < count; i++) {
    const id = `related-chunk-${Date.now()}-${i}`;
    ids.push(id);
  }

  for (let i = 0; i < count; i++) {
    const relatedIds = ids.filter((_, index) => index !== i);
    chunks.push(createChunkSync({
      ...baseOptions,
      id: ids[i],
      content: `Related chunk ${i + 1}: ${baseOptions.content ?? 'test content'}`,
      relatedChunkIds: relatedIds,
    }));
  }

  return chunks;
}

export function resetChunkCounter(): void {
  chunkCounter = 0;
}
