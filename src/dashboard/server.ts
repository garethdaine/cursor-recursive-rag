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
import { logActivity as sharedLogActivity, getActivityLog } from '../services/activity-log.js';
import { getToolRegistry, ToolCategory, JobStatus } from './toolRegistry.js';
import { registerCoreTools } from './coreTools.js';
import { 
  loadRulesConfig, 
  saveRulesConfig, 
  validatePattern,
  testPattern,
  EXAMPLE_PATTERNS,
  RulesAnalyzerConfigSchema,
} from '../config/rulesConfig.js';

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

export function logActivity(type: 'ingest' | 'search' | 'crawl' | 'error' | 'query', message: string, details?: Record<string, any>) {
  sharedLogActivity(type, message, details);
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
      const activities = getActivityLog();
      res.end(JSON.stringify(activities));
      return;
    }

    if (path === '/api/health' && req.method === 'GET') {
      const config = loadConfig();
      const status = {
        vectorStore: { type: config.vectorStore, status: 'unknown' as string, error: null as string | null, count: 0 },
        embeddings: { type: config.embeddings, status: 'unknown' as string, error: null as string | null }
      };

      // Test vector store connection
      try {
        const vectorStore = createVectorStore(config.vectorStore, config);
        const count = await vectorStore.count();
        status.vectorStore.status = 'connected';
        status.vectorStore.count = count;
        if ((vectorStore as any).disconnect) {
          await (vectorStore as any).disconnect();
        }
      } catch (e) {
        status.vectorStore.status = 'error';
        status.vectorStore.error = e instanceof Error ? e.message : 'Connection failed';
      }

      // Test embeddings
      try {
        const embedder = await createEmbedder(config.embeddings, config);
        await embedder.embed('test');
        status.embeddings.status = 'connected';
      } catch (e) {
        status.embeddings.status = 'error';
        status.embeddings.error = e instanceof Error ? e.message : 'Embeddings failed';
      }

      res.end(JSON.stringify(status));
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

    // Tools API endpoints
    if (path === '/api/tools' && req.method === 'GET') {
      const registry = getToolRegistry();
      const tools = registry.getTools();
      const categoriesWithCounts = registry.getCategoriesWithCounts();
      
      res.end(JSON.stringify({
        tools: tools.map(t => ({
          ...t,
          schema: registry.getParameterSchema(t.name),
        })),
        categories: Object.entries(categoriesWithCounts).map(([name, count]) => ({
          name,
          count,
        })),
        totalTools: tools.length,
      }));
      return;
    }

    // Get tools by category
    const toolsByCategoryMatch = path.match(/^\/api\/tools\/category\/([^/]+)$/);
    if (toolsByCategoryMatch && req.method === 'GET') {
      const category = toolsByCategoryMatch[1] as ToolCategory;
      const registry = getToolRegistry();
      const tools = registry.getToolsByCategory(category);
      
      res.end(JSON.stringify({
        category,
        tools: tools.map(t => ({
          ...t,
          schema: registry.getParameterSchema(t.name),
        })),
      }));
      return;
    }

    // Get single tool with schema
    const toolDetailMatch = path.match(/^\/api\/tools\/([^/]+)$/);
    if (toolDetailMatch && req.method === 'GET') {
      const toolName = toolDetailMatch[1];
      const registry = getToolRegistry();
      const tool = registry.getTool(toolName);
      
      if (!tool) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Tool '${toolName}' not found` }));
        return;
      }
      
      res.end(JSON.stringify({
        ...tool,
        schema: registry.getParameterSchema(toolName),
      }));
      return;
    }

    // Execute tool
    const toolExecuteMatch = path.match(/^\/api\/tools\/([^/]+)\/execute$/);
    if (toolExecuteMatch && req.method === 'POST') {
      const toolName = toolExecuteMatch[1];
      const registry = getToolRegistry();
      
      if (!registry.hasTool(toolName)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Tool '${toolName}' not found` }));
        return;
      }
      
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const params = body ? JSON.parse(body) : {};
          const tool = registry.getTool(toolName);
          
          // For long-running tools, execute async and return job ID
          if (tool?.isLongRunning) {
            const jobId = registry.executeAsync(toolName, params);
            res.end(JSON.stringify({
              async: true,
              jobId,
              message: `Tool '${toolName}' started. Check status at /api/tools/${toolName}/status/${jobId}`,
            }));
            return;
          }
          
          // Execute synchronously
          const result = await registry.execute(toolName, params);
          logActivity('query', `Tool executed: ${toolName}`, { params, success: result.success });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Invalid request' }));
        }
      });
      return;
    }

    // Get job status
    const jobStatusMatch = path.match(/^\/api\/tools\/([^/]+)\/status\/([^/]+)$/);
    if (jobStatusMatch && req.method === 'GET') {
      const [, toolName, jobId] = jobStatusMatch;
      const registry = getToolRegistry();
      const job = registry.getJob(jobId);
      
      if (!job) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Job '${jobId}' not found` }));
        return;
      }
      
      res.end(JSON.stringify({
        id: job.id,
        toolName: job.toolName,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progressMessage,
        startedAt: job.startedAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        result: job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED ? job.result : undefined,
      }));
      return;
    }

    // Get recent jobs
    if (path === '/api/tools/jobs' && req.method === 'GET') {
      const registry = getToolRegistry();
      const jobs = registry.getRecentJobs(20);
      
      res.end(JSON.stringify({
        jobs: jobs.map(j => ({
          id: j.id,
          toolName: j.toolName,
          status: j.status,
          startedAt: j.startedAt.toISOString(),
          completedAt: j.completedAt?.toISOString(),
          success: j.result?.success,
        })),
      }));
      return;
    }

    // =========================================
    // Rules Analyzer Configuration API
    // =========================================

    // Get rules config
    if (path === '/api/rules/config' && req.method === 'GET') {
      try {
        const config = loadRulesConfig();
        res.end(JSON.stringify({
          config,
          examples: EXAMPLE_PATTERNS,
        }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to load config' }));
      }
      return;
    }

    // Save rules config
    if (path === '/api/rules/config' && req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const validated = RulesAnalyzerConfigSchema.parse(data);
          saveRulesConfig(validated);
          logActivity('query', 'Rules analyzer config updated');
          res.end(JSON.stringify({ success: true, config: validated }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ 
            error: e instanceof Error ? e.message : 'Invalid config',
            details: e instanceof Error && 'issues' in e ? (e as any).issues : undefined,
          }));
        }
      });
      return;
    }

    // Validate a regex pattern
    if (path === '/api/rules/validate-pattern' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { pattern } = JSON.parse(body);
          const result = validatePattern(pattern);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ valid: false, error: 'Invalid request' }));
        }
      });
      return;
    }

    // Test a pattern against sample content
    if (path === '/api/rules/test-pattern' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { pattern, content } = JSON.parse(body);
          const result = testPattern(pattern, content);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ matches: false, error: 'Invalid request' }));
        }
      });
      return;
    }

    // Get example patterns (templates)
    if (path === '/api/rules/examples' && req.method === 'GET') {
      res.end(JSON.stringify(EXAMPLE_PATTERNS));
      return;
    }

    // Add a version check pattern
    if (path === '/api/rules/config/version-checks' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const newCheck = JSON.parse(body);
          const config = loadRulesConfig();
          
          // Validate the pattern
          const validation = validatePattern(newCheck.pattern);
          if (!validation.valid) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: `Invalid pattern: ${validation.error}` }));
            return;
          }
          
          config.versionChecks.push({
            ...newCheck,
            enabled: newCheck.enabled ?? true,
          });
          saveRulesConfig(config);
          
          res.end(JSON.stringify({ success: true, config }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Invalid request' }));
        }
      });
      return;
    }

    // Add a deprecation pattern
    if (path === '/api/rules/config/deprecation-patterns' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const newPattern = JSON.parse(body);
          const config = loadRulesConfig();
          
          // Validate the pattern
          const validation = validatePattern(newPattern.pattern);
          if (!validation.valid) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: `Invalid pattern: ${validation.error}` }));
            return;
          }
          
          config.deprecationPatterns.push({
            ...newPattern,
            enabled: newPattern.enabled ?? true,
          });
          saveRulesConfig(config);
          
          res.end(JSON.stringify({ success: true, config }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Invalid request' }));
        }
      });
      return;
    }

    // Delete a version check or deprecation pattern by index
    const deletePatternMatch = path.match(/^\/api\/rules\/config\/(version-checks|deprecation-patterns)\/(\d+)$/);
    if (deletePatternMatch && req.method === 'DELETE') {
      const [, patternType, indexStr] = deletePatternMatch;
      const index = parseInt(indexStr, 10);
      
      try {
        const config = loadRulesConfig();
        const array = patternType === 'version-checks' 
          ? config.versionChecks 
          : config.deprecationPatterns;
        
        if (index < 0 || index >= array.length) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Pattern not found' }));
          return;
        }
        
        array.splice(index, 1);
        saveRulesConfig(config);
        
        res.end(JSON.stringify({ success: true, config }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to delete' }));
      }
      return;
    }

    // Toggle pattern enabled/disabled
    const togglePatternMatch = path.match(/^\/api\/rules\/config\/(version-checks|deprecation-patterns)\/(\d+)\/toggle$/);
    if (togglePatternMatch && req.method === 'POST') {
      const [, patternType, indexStr] = togglePatternMatch;
      const index = parseInt(indexStr, 10);
      
      try {
        const config = loadRulesConfig();
        const array = patternType === 'version-checks' 
          ? config.versionChecks 
          : config.deprecationPatterns;
        
        if (index < 0 || index >= array.length) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Pattern not found' }));
          return;
        }
        
        array[index].enabled = !array[index].enabled;
        saveRulesConfig(config);
        
        res.end(JSON.stringify({ success: true, enabled: array[index].enabled, config }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to toggle' }));
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
  // Register core tools when dashboard starts
  registerCoreTools();
  
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
