import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RAGConfig } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CONFIG_DIR = join(homedir(), '.cursor-rag');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const CURSOR_MCP_PATH = join(homedir(), '.cursor', 'mcp.json');

export function loadConfig(): RAGConfig {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(`Config file not found: ${CONFIG_FILE}. Run 'cursor-rag setup' first.`);
  }
  
  const content = readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

export function writeConfig(config: RAGConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getServerPath(): string {
  // First check environment variable
  if (process.env.CURSOR_RAG_SERVER_PATH) {
    return process.env.CURSOR_RAG_SERVER_PATH;
  }
  
  // Resolve the actual path from the current module location
  // __dirname is services/, so server/index.js is at ../server/index.js
  const localServerPath = join(__dirname, '../server/index.js');
  
  if (existsSync(localServerPath)) {
    // Use realpath to resolve symlinks (for npm link scenarios)
    try {
      return realpathSync(localServerPath);
    } catch {
      return localServerPath;
    }
  }
  
  // Fallback to package name (for global npm installs)
  return 'cursor-recursive-rag/dist/server/index.js';
}

export async function registerWithCursor(): Promise<void> {
  // Read existing mcp.json or create new
  let mcpConfig: { mcpServers: Record<string, any> } = { mcpServers: {} };
  if (existsSync(CURSOR_MCP_PATH)) {
    const content = readFileSync(CURSOR_MCP_PATH, 'utf-8');
    mcpConfig = JSON.parse(content);
  }
  
  // Ensure mcpServers exists
  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {};
  }
  
  const serverPath = getServerPath();
  
  // Add recursive-rag server
  mcpConfig.mcpServers['recursive-rag'] = {
    command: 'node',
    args: [serverPath],
    env: {
      CURSOR_RAG_CONFIG: CONFIG_FILE
    }
  };
  
  // Write back
  writeFileSync(CURSOR_MCP_PATH, JSON.stringify(mcpConfig, null, 2));
}
