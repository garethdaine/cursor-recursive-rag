# cursor-recursive-rag

[![npm version](https://img.shields.io/npm/v/cursor-recursive-rag.svg)](https://www.npmjs.com/package/cursor-recursive-rag)
[![npm downloads](https://img.shields.io/npm/dm/cursor-recursive-rag.svg)](https://www.npmjs.com/package/cursor-recursive-rag)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

Recursive RAG MCP server for Cursor IDE with interactive setup wizard, web dashboard, and AI-powered rules optimizer. Build a knowledge base from your documentation and codebase, enabling multi-hop retrieval, iterative query refinement, and intelligent rule management.

> **Status:** Beta - Core features stable, actively maintained

## Features

### Core RAG
- **Recursive Query**: Multi-hop retrieval with query decomposition and iterative refinement
- **Configurable Vector Stores**: Redis Stack, Redis 8.x Native, Qdrant, ChromaDB, Cloudflare Vectorize, Memory
- **Configurable Embeddings**: Local (Xenova/transformers.js), OpenAI, Ollama
- **Web Crawling**: Firecrawl integration for documentation ingestion
- **Rotating Proxy Support**: PacketStream/Decodo integration for URL fetching

### Dashboard
- **Web Dashboard**: Real-time monitoring, search, activity logging, and configuration
- **Tools Panel**: 12+ built-in tools with parameter forms and execution history
- **Rules Optimizer**: Analyze, detect duplicates, and optimize Cursor rules
- **Settings**: Configure vector stores, embeddings, proxy, and LLM providers
- **Modal/Toast System**: Modern in-app notifications (no browser alerts)

### Rules Optimizer (NEW)
- **Analyze Rules**: Detect duplicates, conflicts, and outdated patterns
- **LLM-Powered Merging**: Intelligently merge duplicate rules preserving all content
- **Natural Language Rules**: Define custom rules in plain English
- **Folder Browser**: Server-side navigation to select rules folders
- **Pattern Matching**: Version checks, deprecation patterns (works without LLM)
- **Automatic Backups**: Creates backups before applying changes

### Integrations
- **MCP Integration**: Automatic registration with Cursor IDE
- **MCP Gateway**: Connect to 87+ aggregated tools with token optimization
- **OpenSkills**: Auto-discover and ingest skills for semantic search
- **LLM Providers**: OpenAI, Anthropic, DeepSeek, Groq, Ollama, OpenRouter

## Quick Start

```bash
# Install globally
npm install -g cursor-recursive-rag

# Run interactive setup
cursor-rag setup

# Ingest documentation
cursor-rag ingest https://nextjs.org/docs --crawl --max-pages 200

# Start the web dashboard
cursor-rag dashboard

# Analyze Cursor rules
cursor-rag rules analyze ~/.cursor/rules
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
npm link
```

## CLI Commands

### Core Commands

```bash
cursor-rag setup              # Interactive configuration wizard
cursor-rag status             # Show configuration and statistics
cursor-rag dashboard          # Start web dashboard (default: http://localhost:3333)
```

### Ingestion

```bash
cursor-rag ingest https://docs.example.com --crawl --max-pages 100
cursor-rag ingest ./docs                    # Local directory
cursor-rag ingest ./document.md             # Single file
```

### Search

```bash
cursor-rag search "how to authenticate users"
cursor-rag search "database queries" --top-k 10
```

### Chat History

```bash
cursor-rag chat list          # List Cursor conversations
cursor-rag chat ingest        # Ingest chat history into RAG
cursor-rag chat watch         # Watch for new conversations
cursor-rag chat stats         # Show ingestion statistics
```

### Rules Optimizer

```bash
cursor-rag rules list <folder>       # List all rules
cursor-rag rules analyze <folder>    # Analyze without changes
cursor-rag rules duplicates <folder> # Show duplicates only
cursor-rag rules conflicts <folder>  # Show conflicts only
cursor-rag rules outdated <folder>   # Show outdated rules
cursor-rag rules optimize <folder>   # Full optimization (dry-run)
cursor-rag rules merge <folder>      # LLM-powered merge
cursor-rag rules rewrite <folder>    # LLM-powered rewrite
```

### Maintenance

```bash
cursor-rag maintenance run <job>  # Run maintenance job
cursor-rag maintenance start      # Start scheduler
cursor-rag maintenance stats      # Show statistics
cursor-rag maintenance cleanup    # Clean stale data
```

## Web Dashboard

Start with `cursor-rag dashboard` (default: http://localhost:3333)

### Tabs

| Tab | Features |
|-----|----------|
| **Overview** | Stats, connection status, quick actions |
| **Search** | Query knowledge base with results display |
| **MCP Gateway** | Browse 87+ tools from connected backends |
| **OpenSkills** | Browse and search installed skills |
| **Tools** | Execute built-in tools with forms |
| **Activity** | Persistent log of all operations |
| **Settings** | Configure all system options |

### Rules Optimizer (Tools Tab)

The Rules Optimizer panel provides one-click analysis and optimization:

1. **Select Folder**: Browse or enter path to rules folder
2. **Choose Mode**: Dry Run (preview) or Apply Changes
3. **Run Optimizer**: Analyzes duplicates, conflicts, outdated rules
4. **Review Results**: See all issues with severity indicators

**Works with or without LLM**:
- Without LLM: Pattern matching detects issues, reports for manual review
- With LLM: Automatically merges duplicates preserving all content

### Settings Tab

Configure:
- **Vector Store**: Redis Stack, Redis 8.x, Qdrant, ChromaDB, Memory, Vectorize
- **Embeddings**: Xenova (local), OpenAI, Ollama
- **Proxy**: PacketStream, Decodo with credentials
- **Rules Analyzer**: Thresholds, patterns, LLM provider
- **LLM Provider**: OpenAI, Anthropic, DeepSeek, Groq, Ollama, OpenRouter

## Configuration

Configuration stored in `~/.cursor-rag/config.json`:

```json
{
  "vectorStore": "redis-stack",
  "embeddings": "xenova",
  "apiKeys": {
    "firecrawl": "fc-...",
    "redis": { "url": "redis://localhost:6379" }
  },
  "proxy": { "enabled": false },
  "dashboard": { "enabled": true, "port": 3333 },
  "mcpGateway": { "enabled": true, "url": "http://localhost:3010" },
  "openSkills": { "enabled": true, "autoIngestSkills": true }
}
```

### Vector Store Options

| Type | Description | Setup |
|------|-------------|-------|
| `redis-stack` | Redis + RediSearch (Docker) | `docker run -d -p 6379:6379 redis/redis-stack-server` |
| `redis` | Redis 8.x native vectors | `brew install redis` |
| `qdrant` | Qdrant vector database | `docker run -d -p 6333:6333 qdrant/qdrant` |
| `chroma` | ChromaDB | `docker run -d -p 8000:8000 chromadb/chroma` |
| `memory` | In-memory with file persistence | No setup required |
| `vectorize` | Cloudflare Vectorize | Requires Cloudflare account |

### Rules Analyzer Config

Stored in `~/.cursor-rag/rules-config.json`:

```json
{
  "analysis": {
    "duplicateThreshold": 0.7,
    "maxAgeDays": 365,
    "detectConflicts": true,
    "detectOutdated": true,
    "useLLM": false
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini"
  },
  "versionChecks": [],
  "deprecationPatterns": [],
  "naturalRules": []
}
```

## MCP Tools

Available when using Cursor IDE:

| Tool | Description |
|------|-------------|
| `recursive_query` | Multi-hop retrieval with query decomposition |
| `search_knowledge` | Direct vector similarity search |
| `ingest_document` | Add document (URL, file, text) |
| `crawl_and_ingest` | Crawl website and index |
| `list_sources` | List indexed sources |
| `chat_ingest` | Ingest Cursor chat history |
| `chat_list` | List conversations |
| `memory_stats` | Memory system statistics |
| `gateway_*` | MCP Gateway tools |
| `openskills_*` | OpenSkills tools |

## Usage in Cursor

### Via @Docs (Recommended)

1. Start dashboard: `cursor-rag dashboard`
2. In Cursor: `@Docs` → **Add new doc**
3. Enter: `http://localhost:3333/docs`
4. Use: `@Docs cursor-recursive-rag` in prompts

### Via MCP Tools

Ask naturally and the AI will use appropriate tools:

```
Search my knowledge base for authentication patterns
Crawl and ingest https://docs.example.com with max 50 pages
What sources are indexed in my RAG?
```

## Architecture

```
cursor-recursive-rag/
├── src/
│   ├── cli/               # CLI commands
│   ├── server/            # MCP server and tools
│   ├── dashboard/         # Web dashboard
│   ├── adapters/
│   │   ├── vector/        # Vector store adapters
│   │   ├── embeddings/    # Embedding adapters
│   │   └── llm/           # LLM provider adapters
│   ├── services/          # Core services
│   ├── config/            # Configuration schemas
│   └── types/             # TypeScript definitions
├── bin/                   # CLI entry point
└── dist/                  # Compiled JavaScript
```

## Requirements

- Node.js >= 20.0.0
- Cursor IDE (for MCP integration)
- Vector store (Docker or Redis 8.x recommended)
- Optional: Ollama (local embeddings), LLM API key (rules optimization)

## API Keys

| Service | Purpose | Get Key |
|---------|---------|---------|
| Firecrawl | Web crawling | https://www.firecrawl.dev |
| OpenAI | Embeddings/LLM | https://platform.openai.com |
| Anthropic | LLM | https://console.anthropic.com |
| Qdrant Cloud | Vector store | https://cloud.qdrant.io |

## Troubleshooting

### Config file not found
Run `cursor-rag setup` to create configuration.

### MCP server not in Cursor
1. Check `~/.cursor/mcp.json` has `recursive-rag` entry
2. Restart Cursor IDE
3. Verify server path is correct

### Rules optimizer shows 0 rules
Ensure the path is absolute (e.g., `/Users/you/.cursor/rules` not `~/.cursor/rules`)

### LLM not configured error
Either disable "Use LLM for Analysis" in Settings, or configure an LLM provider.

## Development

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript
npm run dev          # Watch mode
npm link             # Link for testing
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
