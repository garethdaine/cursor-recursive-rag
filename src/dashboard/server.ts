import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { RAGConfig } from '../types/index.js';
import { loadConfig, writeConfig, CONFIG_FILE } from '../services/config.js';
import { createVectorStore } from '../adapters/vector/index.js';
import { createEmbedder } from '../adapters/embeddings/index.js';
import { createOpenSkillsClient } from '../integrations/openskills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DashboardStats {
  vectorStore: string;
  embeddings: string;
  totalChunks: number;
  sources: Array<{ name: string; chunks: number }>;
  proxyEnabled: boolean;
  firecrawlConfigured: boolean;
  mcpGatewayEnabled: boolean;
  mcpGatewayUrl: string | null;
  openSkillsEnabled: boolean;
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
      mcpGatewayEnabled: config.mcpGateway?.enabled || false,
      mcpGatewayUrl: config.mcpGateway?.url || null,
      openSkillsEnabled: config.openSkills?.enabled || false,
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
      mcpGatewayEnabled: false,
      mcpGatewayUrl: null,
      openSkillsEnabled: false,
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

    if (path === '/api/skills' && req.method === 'GET') {
      try {
        const config = loadConfig();
        const skillsClient = createOpenSkillsClient(config);
        
        if (!skillsClient.isEnabled()) {
          res.end(JSON.stringify({ skills: [], enabled: false }));
          return;
        }
        
        const skills = skillsClient.discoverSkills();
        res.end(JSON.stringify({ 
          skills: skills.map(s => ({
            name: s.name,
            description: s.description,
            location: s.location
          })),
          enabled: true
        }));
      } catch (e) {
        res.end(JSON.stringify({ skills: [], error: e instanceof Error ? e.message : 'Failed to load skills' }));
      }
      return;
    }

    // Serve knowledge base as browsable docs for Cursor @Docs integration
    if (path === '/api/docs' && req.method === 'GET') {
      try {
        const config = loadConfig();
        const vectorStore = createVectorStore(config.vectorStore, config);
        const embedder = await createEmbedder(config.embeddings, config);
        
        // Get a sample to extract sources
        const sampleEmbedding = await embedder.embed('documentation guide');
        const results = await vectorStore.search(sampleEmbedding, { topK: 1000 });
        
        // Group by source
        const sourceMap = new Map<string, Array<{ content: string; score: number }>>();
        for (const result of results) {
          const source = result.metadata?.source || 'unknown';
          if (!sourceMap.has(source)) {
            sourceMap.set(source, []);
          }
          sourceMap.get(source)!.push({ content: result.content, score: result.score });
        }
        
        // Return as JSON for the docs index
        const docs = Array.from(sourceMap.entries()).map(([source, chunks]) => ({
          source,
          chunkCount: chunks.length,
          preview: chunks[0]?.content.substring(0, 200) + '...'
        }));
        
        res.end(JSON.stringify({ docs, totalSources: docs.length }));
      } catch (e) {
        res.end(JSON.stringify({ docs: [], error: e instanceof Error ? e.message : 'Failed to load docs' }));
      }
      return;
    }

    // Proxy requests to MCP Gateway to avoid CORS
    if (path.startsWith('/api/gateway/') && req.method === 'GET') {
      try {
        const config = loadConfig();
        const gatewayUrl = config.mcpGateway?.url || 'http://localhost:3010';
        // Preserve query string when proxying
        const fullUrl = new URL(req.url || '', `http://${req.headers.host}`);
        const gatewayPath = fullUrl.pathname.replace('/api/gateway', '');
        const queryString = fullUrl.search; // includes the '?' if present
        
        const gatewayRes = await fetch(`${gatewayUrl}${gatewayPath}${queryString}`);
        const data = await gatewayRes.json();
        res.end(JSON.stringify(data));
      } catch (e) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Gateway request failed' }));
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
  }
}

async function serveDocsPage(req: IncomingMessage, res: ServerResponse, path: string, port: number): Promise<void> {
  res.setHeader('Content-Type', 'text/html');
  
  try {
    const config = loadConfig();
    const vectorStore = createVectorStore(config.vectorStore, config);
    const embedder = await createEmbedder(config.embeddings, config);
    
    if (path === '/docs' || path === '/docs/') {
      // Index page - list all sources
      const sampleEmbedding = await embedder.embed('documentation');
      const results = await vectorStore.search(sampleEmbedding, { topK: 1000 });
      
      const sourceMap = new Map<string, number>();
      for (const result of results) {
        const source = result.metadata?.source || 'unknown';
        sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
      }
      
      const sourceLinks = Array.from(sourceMap.entries())
        .map(([source, count]) => {
          const encodedSource = encodeURIComponent(source);
          return `<li><a href="/docs/source/${encodedSource}">${escapeHtml(source)}</a> (${count} chunks)</li>`;
        })
        .join('\n');
      
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Knowledge Base - cursor-recursive-rag</title>
  <meta name="description" content="Indexed documentation and knowledge base for RAG retrieval">
</head>
<body>
  <h1>Knowledge Base Index</h1>
  <p>This knowledge base contains ${results.length} chunks from ${sourceMap.size} sources.</p>
  <h2>Sources</h2>
  <ul>
    ${sourceLinks || '<li>No sources indexed yet. Use <code>cursor-rag ingest</code> to add documents.</li>'}
  </ul>
  <hr>
  <p><a href="/docs/search">Search the knowledge base</a></p>
</body>
</html>`);
      return;
    }
    
    if (path.startsWith('/docs/source/')) {
      // Show chunks from a specific source
      const encodedSource = path.replace('/docs/source/', '');
      const source = decodeURIComponent(encodedSource);
      
      const embedding = await embedder.embed(source);
      const results = await vectorStore.search(embedding, { topK: 500 });
      const sourceChunks = results.filter(r => r.metadata?.source === source);
      
      const chunkHtml = sourceChunks
        .map((chunk, idx) => `
          <article>
            <h3>Chunk ${idx + 1}</h3>
            <pre>${escapeHtml(chunk.content)}</pre>
          </article>
        `)
        .join('\n');
      
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(source)} - Knowledge Base</title>
  <meta name="description" content="Documentation from ${escapeHtml(source)}">
</head>
<body>
  <h1>${escapeHtml(source)}</h1>
  <p><a href="/docs">← Back to index</a></p>
  <p>${sourceChunks.length} chunks from this source</p>
  ${chunkHtml}
</body>
</html>`);
      return;
    }
    
    if (path === '/docs/search') {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const query = url.searchParams.get('q') || '';
      
      let resultsHtml = '';
      if (query) {
        const embedding = await embedder.embed(query);
        const results = await vectorStore.search(embedding, { topK: 20 });
        
        resultsHtml = results
          .map((r, idx) => `
            <article>
              <h3>${idx + 1}. Score: ${r.score.toFixed(4)}</h3>
              <p><strong>Source:</strong> ${escapeHtml(r.metadata?.source || 'unknown')}</p>
              <pre>${escapeHtml(r.content)}</pre>
            </article>
          `)
          .join('\n');
      }
      
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Search - Knowledge Base</title>
</head>
<body>
  <h1>Search Knowledge Base</h1>
  <p><a href="/docs">← Back to index</a></p>
  <form method="get" action="/docs/search">
    <input type="text" name="q" value="${escapeHtml(query)}" placeholder="Search..." style="width: 300px">
    <button type="submit">Search</button>
  </form>
  ${query ? `<h2>Results for "${escapeHtml(query)}"</h2>${resultsHtml}` : ''}
</body>
</html>`);
      return;
    }
    
    res.statusCode = 404;
    res.end('<html><body><h1>Not Found</h1><p><a href="/docs">Back to docs</a></p></body></html>');
  } catch (error) {
    res.statusCode = 500;
    res.end(`<html><body><h1>Error</h1><p>${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</p></body></html>`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    } else if (path === '/docs' || path.startsWith('/docs/')) {
      // Serve knowledge base as HTML for Cursor @Docs crawling
      await serveDocsPage(req, res, path, port);
    } else {
      serveStatic(res, path);
    }
  });

  server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });
}
