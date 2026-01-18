# cursor-recursive-rag

[![npm version](https://img.shields.io/npm/v/cursor-recursive-rag.svg)](https://www.npmjs.com/package/cursor-recursive-rag)
[![npm downloads](https://img.shields.io/npm/dm/cursor-recursive-rag.svg)](https://www.npmjs.com/package/cursor-recursive-rag)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

Recursive RAG MCP server for Cursor IDE with interactive setup wizard and web dashboard. Build a knowledge base from your documentation and codebase, enabling multi-hop retrieval and iterative query refinement.

> **Status:** Alpha - Core features working, API may change

## Features

- **Recursive Query**: Multi-hop retrieval with query decomposition and iterative refinement
- **Configurable Vector Stores**: Redis Stack (recommended), Qdrant (local/cloud), ChromaDB, Cloudflare Vectorize
- **Configurable Embeddings**: Local (Xenova/transformers.js), OpenAI, Ollama
- **Web Crawling**: Firecrawl integration for documentation ingestion
- **Rotating Proxy Support**: Optional PacketStream/SmartProxy integration for URL fetching
- **Web Dashboard**: Real-time monitoring, search, and configuration UI (Tailwind CSS)
- **Interactive Setup**: Guided configuration wizard
- **MCP Integration**: Automatic registration with Cursor IDE
- **MCP Gateway Integration**: Connect to [MCP Gateway](https://github.com/abdullah1854/MCPGateway) for 87+ aggregated tools with token optimization
- **OpenSkills Integration**: Auto-discover and ingest skills from [OpenSkills](https://github.com/numman-ali/openskills) for semantic search

## Quick Start

```bash
# Install globally
npm install -g cursor-recursive-rag

# Run interactive setup
cursor-rag setup

# Ingest documentation (with Firecrawl)
cursor-rag ingest https://nextjs.org/docs --crawl --max-pages 200

# Ingest a local directory
cursor-rag ingest ./docs

# Check status
cursor-rag status

# Test search from CLI
cursor-rag search "how to authenticate users"

# Start the web dashboard
cursor-rag dashboard
```

## Installation

### From npm (recommended)

```bash
npm install -g cursor-recursive-rag
```

### From source

```bash
git clone https://github.com/garethdaine/cursor-recursive-rag.git
cd cursor-recursive-rag
npm install
npm run build
npm link  # Makes cursor-rag available globally
```

## Setup Wizard

Run `cursor-rag setup` to configure the system. The wizard will:

1. **Select Vector Store** (Redis recommended):
   - **Redis Stack** (default): Persistent, fast HNSW search, `docker run -p 6379:6379 redis/redis-stack-server`
   - **Qdrant**: Persistent, local Docker or cloud, `docker run -p 6333:6333 qdrant/qdrant`
   - **Memory**: In-process, non-persistent (testing only)
   - **ChromaDB**: Requires separate server, `docker run -p 8000:8000 chromadb/chroma`
   - **Cloudflare Vectorize**: Serverless (not yet implemented)

2. **Select Embedding Model**:
   - **Xenova (local)**: Free, private, ~384 dimensions
   - **Ollama**: Local, configurable models
   - **OpenAI**: High quality, requires API key

3. **API Keys**:
   - OpenAI API key (if using OpenAI embeddings)
   - Firecrawl API key (for web crawling)
   - Qdrant URL/API key (if using Qdrant)
   - Ollama URL/model (if using Ollama)

4. **Auto-register** the MCP server with Cursor IDE

## CLI Commands

### `cursor-rag setup`

Interactive setup wizard to configure vector store, embeddings, proxy, and API keys.

```bash
cursor-rag setup
cursor-rag setup --vector-store chroma --embeddings xenova
```

### `cursor-rag ingest`

Add documents to the knowledge base.

```bash
# Crawl a website (requires Firecrawl API key)
cursor-rag ingest https://docs.example.com --crawl --max-pages 100 --max-depth 3

# Ingest a single URL
cursor-rag ingest https://example.com/page

# Ingest a local file
cursor-rag ingest ./document.md

# Ingest a directory (recursive)
cursor-rag ingest ./docs
```

### `cursor-rag search`

Test search from the command line.

```bash
cursor-rag search "how to set up authentication"
cursor-rag search "database queries" --top-k 10
```

### `cursor-rag status`

Show current configuration and knowledge base statistics.

```bash
cursor-rag status
```

### `cursor-rag dashboard`

Start the web dashboard for monitoring and configuration.

```bash
cursor-rag dashboard
cursor-rag dashboard --port 8080
```

The dashboard provides:
- **Overview**: Total chunks, vector store stats, recent activity
- **Search**: Test queries against your knowledge base
- **Activity Log**: Real-time view of ingestion and search operations
- **Settings**: Configure vector store, embeddings, and proxy settings

## Usage in Cursor

### Option 1: Via `@Docs` (Recommended)

The dashboard serves your knowledge base as browsable documentation that Cursor can index:

1. Start the dashboard: `cursor-rag dashboard`
2. In Cursor, type `@Docs` and select **Add new doc**
3. Enter: `http://localhost:3333/docs`
4. Now use `@Docs cursor-recursive-rag` in your prompts!

### Option 2: Via MCP Tools (Natural Language)

The MCP tools are available to the AI agent in Cursor Chat. Ask questions naturally and the AI will use the appropriate tools:

```
Search my knowledge base for authentication patterns

What sources are indexed in my RAG knowledge base?

Crawl and ingest https://docs.example.com into my knowledge base with a max of 50 pages
```

> **Note:** MCP tools don't use `@` syntax - that's reserved for Cursor's built-in features (`@Codebase`, `@Docs`, `@Files`). MCP tools are called automatically by the AI when relevant to your request.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `recursive_query` | Multi-hop retrieval with query decomposition |
| `search_knowledge` | Direct vector similarity search |
| `ingest_document` | Add a single document (URL, file, or text) |
| `crawl_and_ingest` | Crawl website with Firecrawl and index |
| `list_sources` | List indexed document sources |

## Configuration

Configuration is stored in `~/.cursor-rag/config.json`:

```json
{
  "vectorStore": "chroma",
  "embeddings": "xenova",
  "apiKeys": {
    "firecrawl": "fc-..."
  },
  "proxy": {
    "enabled": true,
    "driver": "packetstream",
    "host": "proxy.packetstream.io",
    "port": 31112,
    "username": "your-username",
    "password": "your-password"
  },
  "dashboard": {
    "enabled": true,
    "port": 3333
  }
}
```

### Proxy Configuration

The optional rotating proxy is used for direct URL fetching (not needed when using Firecrawl, which handles proxying internally). Supported providers:

- **PacketStream**: Residential proxies with country targeting
- **SmartProxy**: Datacenter and residential options

### MCP Gateway Integration

Connect to [MCP Gateway](https://github.com/abdullah1854/MCPGateway) to access 87+ aggregated tools with token optimization:

```json
{
  "mcpGateway": {
    "enabled": true,
    "url": "http://localhost:3010",
    "apiKey": "optional-api-key"
  }
}
```

**MCP Tools exposed:**
- `gateway_search_tools` - Search available tools across all backends
- `gateway_call_tool` - Call any gateway tool with result filtering
- `gateway_execute_skill` - Execute gateway skills
- `gateway_health` - Check gateway status

### OpenSkills Integration

Connect to [OpenSkills](https://github.com/numman-ali/openskills) for universal skills loading:

```json
{
  "openSkills": {
    "enabled": true,
    "autoIngestSkills": true
  }
}
```

**MCP Tools exposed:**
- `list_openskills` - List all installed skills
- `read_openskill` - Read a specific skill's content
- `ingest_openskills` - Ingest all skills into RAG knowledge base
- `search_openskills` - Semantic search across ingested skills

**Skill Discovery Paths (priority order):**
1. `./.agent/skills/` (project universal)
2. `~/.agent/skills/` (global universal)
3. `./.claude/skills/` (project Claude)
4. `~/.claude/skills/` (global Claude)

The MCP server is registered in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "recursive-rag": {
      "command": "node",
      "args": ["cursor-recursive-rag/dist/server/index.js"],
      "env": {
        "CURSOR_RAG_CONFIG": "/Users/you/.cursor-rag/config.json"
      }
    }
  }
}
```

## Architecture

```
cursor-recursive-rag/
├── src/
│   ├── cli/               # CLI commands (setup, ingest, search, status)
│   ├── server/            # MCP server and tool handlers
│   ├── adapters/
│   │   ├── vector/        # Vector store adapters (Chroma, Qdrant, Vectorize)
│   │   └── embeddings/    # Embedding adapters (Xenova, OpenAI, Ollama)
│   ├── services/          # Chunker, query decomposer, config
│   └── types/             # TypeScript type definitions
├── bin/                   # CLI entry point
├── dist/                  # Compiled JavaScript
└── package.json
```

## Requirements

- Node.js >= 20.0.0
- Cursor IDE (for MCP integration)
- Optional: Docker (for Qdrant local)
- Optional: Ollama (for local embeddings)

## API Keys

| Service | Purpose | Get Key |
|---------|---------|---------|
| Firecrawl | Web crawling | https://www.firecrawl.dev |
| OpenAI | Embeddings | https://platform.openai.com |
| Qdrant Cloud | Vector store | https://cloud.qdrant.io |

## Troubleshooting

### "Config file not found"

Run `cursor-rag setup` to create the configuration.

### MCP server not showing in Cursor

1. Check `~/.cursor/mcp.json` has the `recursive-rag` entry
2. Restart Cursor IDE
3. Check the server path is correct

### Firecrawl errors

Ensure your Firecrawl API key is valid and starts with `fc-`.

### ChromaDB permission errors

The local ChromaDB stores data in `~/.cursor-rag/chroma-data`. Ensure this directory is writable.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Link for testing
npm link
```

## License

MIT
