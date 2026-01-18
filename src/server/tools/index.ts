import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig } from '../../types/index.js';
import { recursiveQueryTool } from './recursive-query.js';
import { searchKnowledgeTool } from './search.js';
import { ingestDocumentTool } from './ingest.js';
import { crawlAndIngestTool } from './crawl.js';
import { listSourcesTool } from './list-sources.js';

export function registerTools(
  server: Server,
  dependencies: {
    vectorStore: VectorStore;
    embedder: Embedder;
    config: RAGConfig;
  }
): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'recursive_query',
        description: 'Perform recursive multi-hop retrieval across knowledge base. Decomposes complex queries into sub-questions, iteratively retrieves relevant chunks, and synthesizes a comprehensive answer.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The question or query to answer'
            },
            maxIterations: {
              type: 'number',
              description: 'Maximum number of retrieval iterations (default: 5)',
              default: 5
            },
            minConfidence: {
              type: 'number',
              description: 'Minimum confidence threshold to stop iterating (default: 0.7)',
              default: 0.7
            },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter to specific document sources (optional)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'search_knowledge',
        description: 'Direct vector similarity search in the knowledge base. Use for simple queries that don\'t require recursive retrieval.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default: 10)',
              default: 10
            },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter to specific document sources (optional)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'ingest_document',
        description: 'Add a single document to the knowledge base. Accepts URL, file path, or raw text.',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'URL, file path, or text content'
            },
            title: {
              type: 'string',
              description: 'Optional title for the document'
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata to attach to chunks'
            }
          },
          required: ['source']
        }
      },
      {
        name: 'crawl_and_ingest',
        description: 'Crawl a website using Firecrawl and add all pages to the knowledge base.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Starting URL to crawl'
            },
            maxPages: {
              type: 'number',
              description: 'Maximum number of pages to crawl (default: 100)',
              default: 100
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum crawl depth (default: 3)',
              default: 3
            }
          },
          required: ['url']
        }
      },
      {
        name: 'list_sources',
        description: 'List all document sources indexed in the knowledge base.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'recursive_query':
          return await recursiveQueryTool(args as any, dependencies);
        case 'search_knowledge':
          return await searchKnowledgeTool(args as any, dependencies);
        case 'ingest_document':
          return await ingestDocumentTool(args as any, dependencies);
        case 'crawl_and_ingest':
          return await crawlAndIngestTool(args as any, dependencies);
        case 'list_sources':
          return await listSourcesTool(args as any, dependencies);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  });
}
