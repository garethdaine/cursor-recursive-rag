import { RelationshipType, type ChunkRelationship } from '../../src/types/memory.js';

let relationshipCounter = 0;

export interface RelationshipFactoryOptions {
  id?: string;
  sourceChunkId?: string;
  targetChunkId?: string;
  relationshipType?: RelationshipType;
  strength?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export function createRelationship(options: RelationshipFactoryOptions = {}): ChunkRelationship {
  relationshipCounter++;

  return {
    id: options.id ?? `rel-${relationshipCounter}`,
    sourceChunkId: options.sourceChunkId ?? `source-${relationshipCounter}`,
    targetChunkId: options.targetChunkId ?? `target-${relationshipCounter}`,
    relationshipType: options.relationshipType ?? RelationshipType.RELATES_TO,
    strength: options.strength ?? 1.0,
    metadata: options.metadata ?? {},
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export function createSolvesRelationship(solutionId: string, problemId: string, strength: number = 1.0): ChunkRelationship {
  return createRelationship({
    sourceChunkId: solutionId,
    targetChunkId: problemId,
    relationshipType: RelationshipType.SOLVES,
    strength,
  });
}

export function createSupersedesRelationship(newId: string, oldId: string): ChunkRelationship {
  return createRelationship({
    sourceChunkId: newId,
    targetChunkId: oldId,
    relationshipType: RelationshipType.SUPERSEDES,
    strength: 1.0,
  });
}

export function createContradictionRelationship(chunk1Id: string, chunk2Id: string, strength: number = 0.8): ChunkRelationship {
  return createRelationship({
    sourceChunkId: chunk1Id,
    targetChunkId: chunk2Id,
    relationshipType: RelationshipType.CONTRADICTS,
    strength,
  });
}

export function createDependencyRelationship(dependentId: string, dependencyId: string): ChunkRelationship {
  return createRelationship({
    sourceChunkId: dependentId,
    targetChunkId: dependencyId,
    relationshipType: RelationshipType.DEPENDS_ON,
    strength: 1.0,
  });
}

export function createSimilarityRelationship(chunk1Id: string, chunk2Id: string, similarity: number): ChunkRelationship {
  return createRelationship({
    sourceChunkId: chunk1Id,
    targetChunkId: chunk2Id,
    relationshipType: RelationshipType.SIMILAR_TO,
    strength: similarity,
  });
}

export function createExampleRelationship(exampleId: string, patternId: string): ChunkRelationship {
  return createRelationship({
    sourceChunkId: exampleId,
    targetChunkId: patternId,
    relationshipType: RelationshipType.EXAMPLE_OF,
    strength: 1.0,
  });
}

export function createChainOfRelationships(
  chunkIds: string[],
  relationshipType: RelationshipType = RelationshipType.LEADS_TO
): ChunkRelationship[] {
  const relationships: ChunkRelationship[] = [];

  for (let i = 0; i < chunkIds.length - 1; i++) {
    relationships.push(createRelationship({
      sourceChunkId: chunkIds[i],
      targetChunkId: chunkIds[i + 1],
      relationshipType,
    }));
  }

  return relationships;
}

export function createBidirectionalRelationship(
  chunk1Id: string,
  chunk2Id: string,
  relationshipType: RelationshipType = RelationshipType.RELATES_TO,
  strength: number = 1.0
): ChunkRelationship[] {
  return [
    createRelationship({
      sourceChunkId: chunk1Id,
      targetChunkId: chunk2Id,
      relationshipType,
      strength,
    }),
    createRelationship({
      sourceChunkId: chunk2Id,
      targetChunkId: chunk1Id,
      relationshipType,
      strength,
    }),
  ];
}

export function resetRelationshipCounter(): void {
  relationshipCounter = 0;
}
