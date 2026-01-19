import type { ToolDefinition, ToolExecutor, ToolResult } from './toolRegistry.js';
import { ToolCategory, getToolRegistry } from './toolRegistry.js';
import { loadConfig } from '../services/config.js';
import { createVectorStore } from '../adapters/vector/index.js';
import { createEmbedder } from '../adapters/embeddings/index.js';
import { searchKnowledgeTool } from '../server/tools/search.js';
import { ingestDocumentTool } from '../server/tools/ingest.js';
import { crawlAndIngestTool } from '../server/tools/crawl.js';
import { listSourcesTool } from '../server/tools/list-sources.js';
import {
  searchPastSolutionsTool,
  findSimilarIssuesTool,
  getProjectPatternsTool,
  recallDecisionTool,
  getCategorySummaryTool,
  ingestChatHistoryTool,
  memoryStatsTool,
} from '../server/tools/memory.js';
import { createCursorChatReader } from '../services/cursorChatReader.js';
import { getMemoryMetadataStore } from '../services/memoryMetadataStore.js';
import { logActivity } from '../services/activity-log.js';

async function getDependencies() {
  const config = loadConfig();
  const vectorStore = createVectorStore(config.vectorStore, config);
  const embedder = await createEmbedder(config.embeddings, config);
  return { vectorStore, embedder, config };
}

function wrapMcpTool(
  mcpTool: (args: any, deps: any) => Promise<any>
): ToolExecutor {
  return async (params: Record<string, any>): Promise<ToolResult> => {
    try {
      const deps = await getDependencies();
      const result = await mcpTool(params, deps);

      if (result.isError) {
        return {
          success: false,
          error: result.content?.[0]?.text || 'Tool execution failed',
        };
      }

      return {
        success: true,
        data: result.content?.[0]?.text || result,
        message: 'Tool executed successfully',
      };
    } catch (error) {
      logActivity('error', `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  };
}

export const coreToolDefinitions: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [
  {
    definition: {
      name: 'search',
      displayName: 'Search Knowledge Base',
      description: 'Search the RAG knowledge base for relevant documents and information.',
      category: ToolCategory.SEARCH,
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'The search query to find relevant documents',
          required: true,
        },
        {
          name: 'topK',
          type: 'number',
          description: 'Maximum number of results to return',
          required: false,
          default: 10,
        },
        {
          name: 'sources',
          type: 'array',
          description: 'Filter results by specific sources',
          required: false,
          items: { type: 'string' },
        },
      ],
    },
    executor: wrapMcpTool(searchKnowledgeTool),
  },
  {
    definition: {
      name: 'ingest_document',
      displayName: 'Ingest Document',
      description: 'Ingest a document (text, URL, or file path) into the RAG knowledge base.',
      category: ToolCategory.INGEST,
      parameters: [
        {
          name: 'source',
          type: 'string',
          description: 'URL, file path, or raw text content to ingest',
          required: true,
        },
        {
          name: 'title',
          type: 'string',
          description: 'Optional title for the document',
          required: false,
        },
      ],
      isLongRunning: true,
      estimatedDuration: '10-60 seconds',
    },
    executor: wrapMcpTool(ingestDocumentTool),
  },
  {
    definition: {
      name: 'crawl_and_ingest',
      displayName: 'Crawl & Ingest Website',
      description: 'Crawl a website using Firecrawl and ingest all pages into the knowledge base.',
      category: ToolCategory.INGEST,
      parameters: [
        {
          name: 'url',
          type: 'string',
          description: 'The URL of the website to crawl',
          required: true,
        },
        {
          name: 'maxPages',
          type: 'number',
          description: 'Maximum number of pages to crawl',
          required: false,
          default: 100,
        },
        {
          name: 'maxDepth',
          type: 'number',
          description: 'Maximum crawl depth from the starting URL',
          required: false,
          default: 3,
        },
      ],
      isLongRunning: true,
      estimatedDuration: '1-10 minutes',
    },
    executor: wrapMcpTool(crawlAndIngestTool),
  },
  {
    definition: {
      name: 'list_sources',
      displayName: 'List Sources',
      description: 'List all sources (documents, URLs) that have been ingested into the knowledge base.',
      category: ToolCategory.UTILITY,
      parameters: [],
    },
    executor: wrapMcpTool(listSourcesTool),
  },
  {
    definition: {
      name: 'chat_list',
      displayName: 'List Chat Conversations',
      description: 'List available Cursor chat conversations that can be ingested.',
      category: ToolCategory.CHAT,
      parameters: [
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of conversations to list',
          required: false,
          default: 20,
        },
        {
          name: 'hasCode',
          type: 'boolean',
          description: 'Only show conversations containing code blocks',
          required: false,
          default: false,
        },
      ],
    },
    executor: async (params): Promise<ToolResult> => {
      try {
        const reader = createCursorChatReader();

        if (!reader.isDatabaseAvailable()) {
          return {
            success: false,
            error: 'Cursor database not found. Make sure Cursor is installed and has been used.',
          };
        }

        const conversations = reader.listConversations({
          limit: params.limit || 20,
          hasCode: params.hasCode,
        });

        const metadataStore = getMemoryMetadataStore();
        const conversationsList = conversations.map(conv => {
          const isProcessed = metadataStore.isConversationProcessed(conv.id);
          return {
            id: conv.id,
            messageCount: conv.messageCount,
            hasCodeBlocks: conv.hasCodeBlocks,
            createdAt: conv.createdAt?.toISOString() || 'unknown',
            preview: conv.preview.substring(0, 100) + (conv.preview.length > 100 ? '...' : ''),
            processed: isProcessed,
          };
        });

        const processed = conversationsList.filter(c => c.processed).length;
        const unprocessed = conversationsList.length - processed;

        return {
          success: true,
          data: {
            conversations: conversationsList,
            summary: {
              total: conversationsList.length,
              processed,
              unprocessed,
            },
          },
          message: `Found ${conversationsList.length} conversations (${processed} processed, ${unprocessed} pending)`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list conversations',
        };
      }
    },
  },
  {
    definition: {
      name: 'chat_ingest',
      displayName: 'Ingest Chat History',
      description: 'Ingest Cursor chat conversations into the knowledge base with optional knowledge extraction.',
      category: ToolCategory.CHAT,
      parameters: [
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of conversations to process',
          required: false,
          default: 10,
        },
        {
          name: 'extract',
          type: 'boolean',
          description: 'Extract knowledge (solutions, patterns, decisions) using LLM',
          required: false,
          default: false,
        },
        {
          name: 'since',
          type: 'string',
          description: 'Only process conversations since this date (YYYY-MM-DD)',
          required: false,
        },
      ],
      isLongRunning: true,
      estimatedDuration: '30 seconds - 5 minutes',
    },
    executor: wrapMcpTool(ingestChatHistoryTool),
  },
  {
    definition: {
      name: 'memory_stats',
      displayName: 'Memory Statistics',
      description: 'Get detailed statistics about the memory system including chunks, relationships, and categories.',
      category: ToolCategory.MEMORY,
      parameters: [],
    },
    executor: async (): Promise<ToolResult> => {
      try {
        const deps = await getDependencies();
        const result = await memoryStatsTool(deps);
        return {
          success: true,
          data: result.content[0].text,
          message: 'Memory statistics retrieved successfully',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get memory stats',
        };
      }
    },
  },
  {
    definition: {
      name: 'search_past_solutions',
      displayName: 'Search Past Solutions',
      description: 'Search for past solutions to similar problems from ingested chat history.',
      category: ToolCategory.MEMORY,
      parameters: [
        {
          name: 'problem',
          type: 'string',
          description: 'Description of the problem to find solutions for',
          required: true,
        },
        {
          name: 'topK',
          type: 'number',
          description: 'Number of solutions to return',
          required: false,
          default: 5,
        },
        {
          name: 'minScore',
          type: 'number',
          description: 'Minimum relevance score (0-1)',
          required: false,
          default: 0.3,
        },
      ],
    },
    executor: wrapMcpTool(searchPastSolutionsTool),
  },
  {
    definition: {
      name: 'find_similar_issues',
      displayName: 'Find Similar Issues',
      description: 'Find issues or discussions similar to the current one.',
      category: ToolCategory.MEMORY,
      parameters: [
        {
          name: 'issue',
          type: 'string',
          description: 'Description of the issue to find similar ones for',
          required: true,
        },
        {
          name: 'topK',
          type: 'number',
          description: 'Number of results to return',
          required: false,
          default: 5,
        },
      ],
    },
    executor: wrapMcpTool(findSimilarIssuesTool),
  },
  {
    definition: {
      name: 'get_project_patterns',
      displayName: 'Get Project Patterns',
      description: 'Retrieve coding patterns and standards from the knowledge base.',
      category: ToolCategory.MEMORY,
      parameters: [
        {
          name: 'category',
          type: 'string',
          description: 'Filter by category (e.g., authentication, database, api)',
          required: false,
        },
        {
          name: 'topK',
          type: 'number',
          description: 'Number of patterns to return',
          required: false,
          default: 10,
        },
      ],
    },
    executor: wrapMcpTool(getProjectPatternsTool),
  },
  {
    definition: {
      name: 'recall_decision',
      displayName: 'Recall Decision',
      description: 'Recall past architectural or design decisions about a topic.',
      category: ToolCategory.MEMORY,
      parameters: [
        {
          name: 'topic',
          type: 'string',
          description: 'Topic to recall decisions about',
          required: true,
        },
        {
          name: 'topK',
          type: 'number',
          description: 'Number of decisions to return',
          required: false,
          default: 5,
        },
      ],
    },
    executor: wrapMcpTool(recallDecisionTool),
  },
  {
    definition: {
      name: 'get_category_summary',
      displayName: 'Get Category Summary',
      description: 'Get the summary for a knowledge category.',
      category: ToolCategory.MEMORY,
      parameters: [
        {
          name: 'category',
          type: 'string',
          description: 'Category name (e.g., authentication, database, testing)',
          required: true,
        },
      ],
    },
    executor: wrapMcpTool(getCategorySummaryTool),
  },
];

/**
 * Register all core tools with the registry
 */
export function registerCoreTools(): void {
  const registry = getToolRegistry();

  for (const tool of coreToolDefinitions) {
    if (!registry.hasTool(tool.definition.name)) {
      registry.register(tool.definition, tool.executor);
    }
  }
}

/**
 * Get the count of registered core tools
 */
export function getCoreToolCount(): number {
  return coreToolDefinitions.length;
}
