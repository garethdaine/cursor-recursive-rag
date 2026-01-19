import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig } from '../../types/index.js';
import { ChunkType, RelationshipType } from '../../types/memory.js';
import { getMemoryMetadataStore } from '../../services/memoryMetadataStore.js';
import { getRelationshipGraph } from '../../services/relationshipGraph.js';
import { getCategoryManager } from '../../services/categoryManager.js';
import { getHybridScorer } from '../../services/hybridScorer.js';
import { createEnhancedVectorStore } from '../../services/enhancedVectorStore.js';
import { createCursorChatReader } from '../../services/cursorChatReader.js';
import { createConversationProcessor } from '../../services/conversationProcessor.js';
import { createKnowledgeExtractor } from '../../services/knowledgeExtractor.js';
import { createKnowledgeStorageService } from '../../services/knowledgeStorage.js';
import { countExtractedItems } from '../../types/extractedKnowledge.js';

interface ToolDependencies {
  vectorStore: VectorStore;
  embedder: Embedder;
  config: RAGConfig;
}

export interface SearchPastSolutionsArgs {
  problem: string;
  topK?: number;
  minScore?: number;
}

export async function searchPastSolutionsTool(
  args: SearchPastSolutionsArgs,
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const { problem, topK = 5, minScore = 0.3 } = args;
  const enhancedStore = createEnhancedVectorStore(deps.vectorStore);
  const metadataStore = getMemoryMetadataStore();
  const hybridScorer = getHybridScorer();

  const embedding = await deps.embedder.embed(problem);
  
  const results = await enhancedStore.enhancedSearch(embedding, {
    topK: topK * 3,
    chunkTypes: [ChunkType.SOLUTION],
    minDecayScore: 0.1,
    includeArchived: false,
  });

  const searchInputs = results.map(r => ({
    id: r.id,
    content: r.content,
    score: r.similarityScore,
    metadata: r.metadata,
  }));

  const scored = await hybridScorer.scoreResults(searchInputs, problem, {
    preferredTypes: [ChunkType.SOLUTION],
  });

  const filtered = scored.filter(r => r.finalScore >= minScore).slice(0, topK);

  if (filtered.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No past solutions found for this problem. Try rephrasing or check if relevant conversations have been ingested.',
      }],
    };
  }

  const output = filtered.map((r, i) => {
    return `## Solution ${i + 1} (Score: ${r.finalScore.toFixed(2)})\n\n${r.content}`;
  }).join('\n\n---\n\n');

  return {
    content: [{
      type: 'text',
      text: `Found ${filtered.length} past solutions:\n\n${output}`,
    }],
  };
}

export interface FindSimilarIssuesArgs {
  issue: string;
  topK?: number;
}

export async function findSimilarIssuesTool(
  args: FindSimilarIssuesArgs,
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const { issue, topK = 5 } = args;
  const enhancedStore = createEnhancedVectorStore(deps.vectorStore);
  const hybridScorer = getHybridScorer();
  const graph = getRelationshipGraph();

  const embedding = await deps.embedder.embed(issue);
  
  const results = await enhancedStore.enhancedSearch(embedding, {
    topK: topK * 3,
    chunkTypes: [ChunkType.SOLUTION, ChunkType.CODE, ChunkType.DOCUMENTATION],
    minDecayScore: 0.05,
    includeArchived: false,
  });

  const searchInputs = results.map(r => ({
    id: r.id,
    content: r.content,
    score: r.similarityScore,
    metadata: r.metadata,
  }));

  const scored = await hybridScorer.scoreResults(searchInputs, issue);
  const topResults = scored.slice(0, topK);

  // Find related items through graph
  const relatedItems: string[] = [];
  for (const result of topResults.slice(0, 3)) {
    const related = graph.findRelated(result.id, {
      types: [RelationshipType.RELATES_TO, RelationshipType.SIMILAR_TO, RelationshipType.SOLVES],
      maxResults: 3,
      minStrength: 0.4,
    });
    relatedItems.push(...related.map(r => r.chunkId));
  }

  const output = topResults.map((r, i) => {
    const type = r.metadata?.chunkType || 'unknown';
    return `### ${i + 1}. [${type}] Score: ${r.finalScore.toFixed(2)}\n\n${r.content.substring(0, 500)}${r.content.length > 500 ? '...' : ''}`;
  }).join('\n\n');

  let response = `Found ${topResults.length} similar issues:\n\n${output}`;
  
  if (relatedItems.length > 0) {
    response += `\n\n**Related items**: ${[...new Set(relatedItems)].slice(0, 5).join(', ')}`;
  }

  return {
    content: [{
      type: 'text',
      text: response,
    }],
  };
}

export interface GetProjectPatternsArgs {
  project?: string;
  category?: string;
  topK?: number;
}

export async function getProjectPatternsTool(
  args: GetProjectPatternsArgs,
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const { category, topK = 10 } = args;
  const metadataStore = getMemoryMetadataStore();
  const categoryManager = getCategoryManager(metadataStore);

  await categoryManager.initialize();

  const allPatterns = metadataStore.getAllChunkMetadata({
    includeArchived: false,
    chunkTypes: [ChunkType.PATTERN, ChunkType.STANDARD],
  });

  // Filter by category if specified
  let patterns = allPatterns;
  if (category) {
    const categoryChunks = new Set(
      categoryManager.getCategoryItems(category).map(item => item.chunkId)
    );
    patterns = patterns.filter(p => categoryChunks.has(p.chunkId));
  }

  // Sort by importance and decay
  patterns.sort((a, b) => {
    const scoreA = a.importance * 0.6 + a.decayScore * 0.4;
    const scoreB = b.importance * 0.6 + b.decayScore * 0.4;
    return scoreB - scoreA;
  });

  const topPatterns = patterns.slice(0, topK);

  if (topPatterns.length === 0) {
    return {
      content: [{
        type: 'text',
        text: category 
          ? `No patterns found for category "${category}". Try ingesting more conversations or documents.`
          : 'No patterns found. Try ingesting conversations with `cursor-rag chat ingest --extract`.',
      }],
    };
  }

  const output = topPatterns.map((p, i) => {
    return `${i + 1}. **${p.chunkType}** (importance: ${p.importance.toFixed(2)}, decay: ${p.decayScore.toFixed(2)})\n   ID: ${p.chunkId}`;
  }).join('\n');

  return {
    content: [{
      type: 'text',
      text: `Found ${topPatterns.length} patterns${category ? ` in category "${category}"` : ''}:\n\n${output}`,
    }],
  };
}

export interface RecallDecisionArgs {
  topic: string;
  topK?: number;
}

export async function recallDecisionTool(
  args: RecallDecisionArgs,
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const { topic, topK = 5 } = args;
  const enhancedStore = createEnhancedVectorStore(deps.vectorStore);
  const hybridScorer = getHybridScorer();

  const embedding = await deps.embedder.embed(`decision about ${topic}`);
  
  const results = await enhancedStore.enhancedSearch(embedding, {
    topK: topK * 3,
    chunkTypes: [ChunkType.DECISION, ChunkType.STANDARD],
    minDecayScore: 0.05,
    includeArchived: false,
  });

  const searchInputs = results.map(r => ({
    id: r.id,
    content: r.content,
    score: r.similarityScore,
    metadata: r.metadata,
  }));

  const scored = await hybridScorer.scoreResults(searchInputs, topic, {
    preferredTypes: [ChunkType.DECISION],
  });

  const decisions = scored.slice(0, topK);

  if (decisions.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No decisions found about "${topic}". Decisions are extracted from chat history using \`cursor-rag chat ingest --extract\`.`,
      }],
    };
  }

  const output = decisions.map((d, i) => {
    const type = d.metadata?.chunkType || 'decision';
    return `## Decision ${i + 1} [${type}]\n**Score**: ${d.finalScore.toFixed(2)}\n\n${d.content}`;
  }).join('\n\n---\n\n');

  return {
    content: [{
      type: 'text',
      text: `Found ${decisions.length} decisions about "${topic}":\n\n${output}`,
    }],
  };
}

export interface GetCategorySummaryArgs {
  category: string;
}

export async function getCategorySummaryTool(
  args: GetCategorySummaryArgs,
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const { category } = args;
  const metadataStore = getMemoryMetadataStore();
  const categoryManager = getCategoryManager(metadataStore);

  await categoryManager.initialize();

  const summary = categoryManager.getCategorySummary(category);
  const categories = metadataStore.listCategories();
  const targetCategory = categories.find(c => c.name.toLowerCase() === category.toLowerCase());

  if (!targetCategory) {
    const availableCategories = categories.map(c => c.name).join(', ');
    return {
      content: [{
        type: 'text',
        text: `Category "${category}" not found. Available categories: ${availableCategories}`,
      }],
    };
  }

  let response = `## ${targetCategory.name}\n\n`;
  response += `**Description**: ${targetCategory.description || 'No description'}\n`;
  response += `**Items**: ${targetCategory.chunkCount}\n`;
  response += `**Last Updated**: ${targetCategory.lastUpdated || 'Never'}\n\n`;

  if (summary) {
    response += `### Summary\n\n${summary}`;
  } else {
    response += '*No summary available. Run `cursor-rag maintenance run summarize` to generate summaries.*';
  }

  return {
    content: [{
      type: 'text',
      text: response,
    }],
  };
}

export interface IngestChatHistoryArgs {
  limit?: number;
  extract?: boolean;
  since?: string;
}

export async function ingestChatHistoryTool(
  args: IngestChatHistoryArgs,
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const { limit, extract = false, since } = args;
  const enhancedStore = createEnhancedVectorStore(deps.vectorStore);
  const metadataStore = getMemoryMetadataStore();

  const reader = createCursorChatReader();
  
  if (!reader.isDatabaseAvailable()) {
    return {
      content: [{
        type: 'text',
        text: 'Cursor database not found. Make sure Cursor is installed and has been used at least once.',
      }],
    };
  }

  const filterOptions: any = {};
  if (limit) filterOptions.limit = limit;
  if (since) filterOptions.since = new Date(since);

  const conversations = reader.listConversations(filterOptions);
  const toProcess = conversations.filter(c => !metadataStore.isConversationProcessed(c.id));

  if (toProcess.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `All ${conversations.length} conversations already processed. Use --force in CLI to re-process.`,
      }],
    };
  }

  const processor = createConversationProcessor();
  const knowledgeExtractor = extract ? createKnowledgeExtractor(deps.config) : null;
  const knowledgeStorage = extract ? createKnowledgeStorageService(enhancedStore, deps.embedder) : null;

  let totalChunks = 0;
  let totalKnowledge = 0;
  let processedCount = 0;

  for (const summary of toProcess.slice(0, limit || 10)) {
    try {
      const conversation = reader.getConversation(summary.id);
      if (!conversation) continue;

      const result = processor.processConversation(conversation);
      if (result.chunks.length === 0) continue;

      const documents = await Promise.all(
        result.chunks.map(async (chunk) => {
          const embedding = await deps.embedder.embed(chunk.content);
          return {
            id: chunk.id,
            content: chunk.content,
            embedding,
            metadata: {
              ...chunk.metadata,
              source: chunk.source,
              chunkType: chunk.chunkType,
              importance: chunk.importance,
              sourceConversationId: chunk.sourceConversationId,
            },
          };
        })
      );

      await enhancedStore.add(documents);
      totalChunks += result.chunks.length;

      if (knowledgeExtractor && knowledgeStorage) {
        try {
          const extracted = await knowledgeExtractor.extract(conversation);
          const knowledgeCount = countExtractedItems(extracted);
          if (knowledgeCount > 0) {
            await knowledgeStorage.store(extracted);
            totalKnowledge += knowledgeCount;
          }
        } catch (e) {
          // Knowledge extraction failure is not fatal
        }
      }

      metadataStore.markConversationProcessed(
        summary.id,
        summary.messageCount,
        result.chunks.length,
        totalKnowledge
      );

      processedCount++;
    } catch (e) {
      // Continue processing other conversations
    }
  }

  let response = `Processed ${processedCount} conversations, created ${totalChunks} chunks.`;
  if (extract) {
    response += ` Extracted ${totalKnowledge} knowledge items.`;
  }

  return {
    content: [{
      type: 'text',
      text: response,
    }],
  };
}

export async function memoryStatsTool(
  deps: ToolDependencies
): Promise<{ content: { type: string; text: string }[] }> {
  const metadataStore = getMemoryMetadataStore();
  const graph = getRelationshipGraph(metadataStore);
  const categoryManager = getCategoryManager(metadataStore);

  await categoryManager.initialize();

  const memoryStats = metadataStore.getMemoryStats();
  const graphStats = graph.getStats();
  const categories = categoryManager.getAllCategoriesWithStats();

  let response = `## Memory System Statistics\n\n`;

  response += `### Chunks\n`;
  response += `- Total: ${memoryStats.totalChunks}\n`;
  response += `- Active: ${memoryStats.activeChunks}\n`;
  response += `- Archived: ${memoryStats.archivedChunks}\n`;
  response += `- Avg Decay: ${memoryStats.avgDecayScore.toFixed(3)}\n`;
  response += `- Avg Importance: ${memoryStats.avgImportance.toFixed(3)}\n`;
  response += `- Total Accesses: ${memoryStats.totalAccesses}\n\n`;

  if (Object.keys(memoryStats.chunksByType).length > 0) {
    response += `### By Type\n`;
    for (const [type, count] of Object.entries(memoryStats.chunksByType)) {
      response += `- ${type}: ${count}\n`;
    }
    response += '\n';
  }

  response += `### Relationships\n`;
  response += `- Total: ${graphStats.totalRelationships}\n`;
  response += `- Avg per chunk: ${graphStats.avgRelationshipsPerChunk.toFixed(2)}\n`;
  response += `- Max depth: ${graphStats.maxDepth}\n`;
  response += `- Isolated chunks: ${graphStats.isolatedChunks}\n\n`;

  response += `### Categories\n`;
  response += `- Total: ${memoryStats.categoryCount}\n`;
  const activeCategories = categories.filter(c => c.chunkCount > 0);
  if (activeCategories.length > 0) {
    for (const cat of activeCategories.slice(0, 5)) {
      response += `- ${cat.name}: ${cat.chunkCount} items\n`;
    }
  }

  return {
    content: [{
      type: 'text',
      text: response,
    }],
  };
}

export const memoryToolDefinitions = [
  {
    name: 'search_past_solutions',
    description: 'Search for past solutions to similar problems from ingested chat history and documents.',
    inputSchema: {
      type: 'object',
      properties: {
        problem: {
          type: 'string',
          description: 'Description of the problem to find solutions for',
        },
        topK: {
          type: 'number',
          description: 'Number of solutions to return (default: 5)',
          default: 5,
        },
        minScore: {
          type: 'number',
          description: 'Minimum relevance score (default: 0.3)',
          default: 0.3,
        },
      },
      required: ['problem'],
    },
  },
  {
    name: 'find_similar_issues',
    description: 'Find issues or discussions similar to the current one, including related items through the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: {
          type: 'string',
          description: 'Description of the issue to find similar ones for',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 5)',
          default: 5,
        },
      },
      required: ['issue'],
    },
  },
  {
    name: 'get_project_patterns',
    description: 'Get coding patterns and standards from the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (e.g., authentication, database, api)',
        },
        topK: {
          type: 'number',
          description: 'Number of patterns to return (default: 10)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'recall_decision',
    description: 'Recall past architectural or design decisions about a topic.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic to recall decisions about',
        },
        topK: {
          type: 'number',
          description: 'Number of decisions to return (default: 5)',
          default: 5,
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_category_summary',
    description: 'Get the summary for a knowledge category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name (e.g., authentication, database, testing)',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'ingest_chat_history',
    description: 'Ingest Cursor chat history into the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum conversations to process (default: 10)',
        },
        extract: {
          type: 'boolean',
          description: 'Extract knowledge (solutions, patterns, decisions) using LLM',
          default: false,
        },
        since: {
          type: 'string',
          description: 'Only process conversations since this date (YYYY-MM-DD)',
        },
      },
    },
  },
  {
    name: 'memory_stats',
    description: 'Get statistics about the memory system.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
