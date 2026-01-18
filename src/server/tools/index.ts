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
import { gatewaySearchToolsTool, gatewayCallToolTool, gatewayExecuteSkillTool, gatewayHealthTool } from './gateway.js';
import { listOpenSkillsTool, readOpenSkillTool, ingestSkillsTool, searchSkillsTool } from './skills.js';

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
      },
      // MCP Gateway integration tools (optional)
      {
        name: 'gateway_search_tools',
        description: 'Search available tools in MCP Gateway. Requires mcpGateway integration to be enabled.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for tools'
            },
            backend: {
              type: 'string',
              description: 'Filter to specific backend (optional)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'gateway_call_tool',
        description: 'Call a tool through MCP Gateway with result filtering. Requires mcpGateway integration to be enabled.',
        inputSchema: {
          type: 'object',
          properties: {
            toolName: {
              type: 'string',
              description: 'Name of the gateway tool to call'
            },
            args: {
              type: 'object',
              description: 'Arguments to pass to the tool'
            },
            maxRows: {
              type: 'number',
              description: 'Limit result rows (optional)'
            },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description: 'Select specific fields (optional)'
            }
          },
          required: ['toolName', 'args']
        }
      },
      {
        name: 'gateway_execute_skill',
        description: 'Execute a skill from MCP Gateway. Requires mcpGateway integration to be enabled.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill to execute'
            },
            inputs: {
              type: 'object',
              description: 'Inputs for the skill (optional)'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'gateway_health',
        description: 'Check MCP Gateway health and status.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      // OpenSkills integration tools (optional)
      {
        name: 'list_openskills',
        description: 'List all installed OpenSkills. Requires openSkills integration to be enabled.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'read_openskill',
        description: 'Read a specific OpenSkill by name. Requires openSkills integration to be enabled.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill to read'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'ingest_openskills',
        description: 'Ingest all installed OpenSkills into the RAG knowledge base for semantic search.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'search_openskills',
        description: 'Semantic search across ingested OpenSkills.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            topK: {
              type: 'number',
              description: 'Number of results (default: 5)',
              default: 5
            }
          },
          required: ['query']
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
        // MCP Gateway tools
        case 'gateway_search_tools':
          const gatewaySearchResult = await gatewaySearchToolsTool(dependencies.config, args as any);
          return { content: [{ type: 'text', text: JSON.stringify(gatewaySearchResult, null, 2) }] };
        case 'gateway_call_tool':
          const gatewayCallResult = await gatewayCallToolTool(dependencies.config, args as any);
          return { content: [{ type: 'text', text: JSON.stringify(gatewayCallResult, null, 2) }] };
        case 'gateway_execute_skill':
          const gatewaySkillResult = await gatewayExecuteSkillTool(dependencies.config, args as any);
          return { content: [{ type: 'text', text: JSON.stringify(gatewaySkillResult, null, 2) }] };
        case 'gateway_health':
          const healthResult = await gatewayHealthTool(dependencies.config);
          return { content: [{ type: 'text', text: JSON.stringify(healthResult, null, 2) }] };
        // OpenSkills tools
        case 'list_openskills':
          const skillsList = await listOpenSkillsTool(dependencies.config);
          return { content: [{ type: 'text', text: JSON.stringify(skillsList, null, 2) }] };
        case 'read_openskill':
          const skillContent = await readOpenSkillTool(dependencies.config, args as any);
          return { content: [{ type: 'text', text: JSON.stringify(skillContent, null, 2) }] };
        case 'ingest_openskills':
          const ingestResult = await ingestSkillsTool(dependencies.config);
          return { content: [{ type: 'text', text: JSON.stringify(ingestResult, null, 2) }] };
        case 'search_openskills':
          const searchResult = await searchSkillsTool(dependencies.config, args as any);
          return { content: [{ type: 'text', text: JSON.stringify(searchResult, null, 2) }] };
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
