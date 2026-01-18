import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { RAGConfig } from '../types/index.js';
import { loadConfig, writeConfig, CONFIG_FILE } from '../services/config.js';
import { createVectorStore } from '../adapters/vector/index.js';
import { createEmbedder } from '../adapters/embeddings/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DashboardStats {
  vectorStore: string;
  embeddings: string;
  totalChunks: number;
  sources: Array<{ name: string; chunks: number }>;
  proxyEnabled: boolean;
  firecrawlConfigured: boolean;
  lastUpdated: string;
}

interface ActivityLog {
  timestamp: string;
  type: 'ingest' | 'search' | 'crawl' | 'error';
  message: string;
  details?: Record<string, any>;
}

// In-memory activity log (would use a proper store in production)
const activityLog: ActivityLog[] = [];

export function logActivity(type: ActivityLog['type'], message: string, details?: Record<string, any>) {
  activityLog.unshift({
    timestamp: new Date().toISOString(),
    type,
    message,
    details
  });
  // Keep only last 100 entries
  if (activityLog.length > 100) {
    activityLog.pop();
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function getStats(): Promise<DashboardStats> {
  try {
    const config = loadConfig();
    const vectorStore = createVectorStore(config.vectorStore, config);
    
    let totalChunks = 0;
    try {
      totalChunks = await vectorStore.count();
    } catch (e) {
      // Vector store might not be initialized yet
    }

    return {
      vectorStore: config.vectorStore,
      embeddings: config.embeddings,
      totalChunks,
      sources: [], // Would need to implement source tracking
      proxyEnabled: config.proxy?.enabled || false,
      firecrawlConfigured: !!config.apiKeys?.firecrawl,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    return {
      vectorStore: 'unknown',
      embeddings: 'unknown',
      totalChunks: 0,
      sources: [],
      proxyEnabled: false,
      firecrawlConfigured: false,
      lastUpdated: new Date().toISOString()
    };
  }
}

async function handleAPI(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (path === '/api/stats' && req.method === 'GET') {
      const stats = await getStats();
      res.end(JSON.stringify(stats));
      return;
    }

    if (path === '/api/config' && req.method === 'GET') {
      try {
        const config = loadConfig();
        // Don't expose sensitive keys
        const safeConfig = {
          ...config,
          apiKeys: {
            openai: config.apiKeys?.openai ? '***configured***' : null,
            firecrawl: config.apiKeys?.firecrawl ? '***configured***' : null,
            qdrant: config.apiKeys?.qdrant ? { url: config.apiKeys.qdrant.url, apiKey: '***' } : null,
            ollama: config.apiKeys?.ollama
          },
          proxy: config.proxy ? {
            ...config.proxy,
            password: config.proxy.password ? '***' : undefined
          } : null
        };
        res.end(JSON.stringify(safeConfig));
      } catch (e) {
        res.end(JSON.stringify({ error: 'Config not found. Run cursor-rag setup first.' }));
      }
      return;
    }

    if (path === '/api/config' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const updates = JSON.parse(body);
          const currentConfig = loadConfig();
          const newConfig = { ...currentConfig, ...updates };
          writeConfig(newConfig);
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    if (path === '/api/activity' && req.method === 'GET') {
      res.end(JSON.stringify(activityLog));
      return;
    }

    if (path === '/api/search' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { query, topK = 10 } = JSON.parse(body);
          const config = loadConfig();
          const vectorStore = createVectorStore(config.vectorStore, config);
          const embedder = await createEmbedder(config.embeddings, config);
          
          const embedding = await embedder.embed(query);
          const results = await vectorStore.search(embedding, { topK });
          
          logActivity('search', `Searched: "${query}"`, { resultsCount: results.length });
          res.end(JSON.stringify(results));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Search failed' }));
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
  }
}

function serveStatic(res: ServerResponse, filePath: string): void {
  const publicDir = join(__dirname, 'public');
  const fullPath = join(publicDir, filePath === '/' ? 'index.html' : filePath);
  
  if (!existsSync(fullPath)) {
    // Serve index.html for SPA routing
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html');
      res.end(readFileSync(indexPath));
      return;
    }
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const ext = extname(fullPath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.end(readFileSync(fullPath));
}

export function startDashboard(port: number = 3333): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const path = url.pathname;

    // CORS headers for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }

    if (path.startsWith('/api/')) {
      await handleAPI(req, res, path);
    } else {
      serveStatic(res, path);
    }
  });

  server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });
}
