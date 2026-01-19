export {
  createChunk,
  createChunkSync,
  createSolutionChunk,
  createPatternChunk,
  createDecisionChunk,
  createCodeChunk,
  createArchivedChunk,
  createHighImportanceChunk,
  createRelatedChunks,
  resetChunkCounter,
} from './chunk.js';
export type { ChunkFactoryOptions } from './chunk.js';

export {
  createConversation,
  createProblemSolvingConversation,
  createCodeDiscussionConversation,
  createDecisionConversation,
  createMultiTurnConversation,
  createErrorResolutionConversation,
  createPatternDiscoveryConversation,
  createPreferenceConversation,
  resetConversationCounter,
} from './conversation.js';
export type { Conversation, ConversationMessage, ConversationFactoryOptions } from './conversation.js';

export {
  createRelationship,
  createSolvesRelationship,
  createSupersedesRelationship,
  createContradictionRelationship,
  createDependencyRelationship,
  createSimilarityRelationship,
  createExampleRelationship,
  createChainOfRelationships,
  createBidirectionalRelationship,
  resetRelationshipCounter,
} from './relationship.js';
export type { RelationshipFactoryOptions } from './relationship.js';

export {
  createCategory,
  createCategoryItem,
  createCategoryHierarchy,
  createTechCategories,
  createCategoryWithItems,
  resetCategoryCounters,
} from './category.js';
export type { CategoryFactoryOptions, CategoryItemFactoryOptions } from './category.js';

export {
  createExtractedKnowledge,
  createExtractedSolution,
  createExtractedPattern,
  createExtractedDecision,
  createExtractedStandard,
  createExtractedPreference,
  createExtractedEntity,
  createCodeChange,
  createFullExtractedKnowledge,
  resetKnowledgeCounter,
} from './knowledge.js';
export type {
  SolutionFactoryOptions,
  PatternFactoryOptions,
  DecisionFactoryOptions,
  StandardFactoryOptions,
  PreferenceFactoryOptions,
  EntityFactoryOptions,
} from './knowledge.js';

export function resetAllCounters(): void {
  const { resetChunkCounter } = require('./chunk.js');
  const { resetConversationCounter } = require('./conversation.js');
  const { resetRelationshipCounter } = require('./relationship.js');
  const { resetCategoryCounters } = require('./category.js');
  const { resetKnowledgeCounter } = require('./knowledge.js');

  resetChunkCounter();
  resetConversationCounter();
  resetRelationshipCounter();
  resetCategoryCounters();
  resetKnowledgeCounter();
}
