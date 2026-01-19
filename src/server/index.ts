import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../services/config.js';
import { createVectorStore } from '../adapters/vector/index.js';
import { createEmbedder } from '../adapters/embeddings/index.js';
import { registerTools } from './tools/index.js';
import { ingestSkillsTool } from './tools/skills.js';
import { logActivity } from '../services/activity-log.js';

async function autoIngestSkills(config: any): Promise<void> {
  if (!config.openSkills?.enabled || !config.openSkills?.autoIngestSkills) {
    return;
  }
  
  try {
    const result = await ingestSkillsTool(config);
    if (result.ingested > 0) {
      logActivity('ingest', `Auto-ingested ${result.ingested} skills`, { 
        skills: result.skills 
      });
    }
  } catch (error) {
    // Don't fail startup if auto-ingest fails
    console.error('Auto-ingest skills failed:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function main() {
  // Load configuration from environment or default path
  const configPath = process.env.CURSOR_RAG_CONFIG;
  let config;
  
  try {
    if (configPath) {
      // Temporarily override CONFIG_FILE if provided via env
      const { CONFIG_FILE } = await import('../services/config.js');
      const { readFileSync } = await import('fs');
      const content = readFileSync(configPath, 'utf-8');
      config = JSON.parse(content);
    } else {
      config = loadConfig();
    }
  } catch (error) {
    console.error(`Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
  
  const vectorStore = createVectorStore(config.vectorStore, config);
  const embedder = await createEmbedder(config.embeddings, config);

  // Auto-ingest skills if enabled
  await autoIngestSkills(config);

  const server = new Server(
    {
      name: 'recursive-rag',
      version: '0.1.0'
    },
    {
      capabilities: { tools: {} }
    }
  );

  registerTools(server, { vectorStore, embedder, config });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
