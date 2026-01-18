# cursor-recursive-rag

Recursive RAG MCP server for Cursor IDE with interactive setup wizard. Build a knowledge base from your documentation and codebase, enabling multi-hop retrieval and iterative query refinement.

## Features

- **Recursive Query**: Multi-hop retrieval with query decomposition and iterative refinement
- **Configurable Vector Stores**: ChromaDB (local), Qdrant (local/cloud), Cloudflare Vectorize
- **Configurable Embeddings**: Local (Xenova/transformers.js), OpenAI, Ollama
- **Web Crawling**: Firecrawl integration for documentation ingestion
- **Interactive Setup**: Guided configuration wizard
- **MCP Integration**: Automatic registration with Cursor IDE

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
```

## Installation

### From npm (when published)

```bash
npm install -g cursor-recursive-rag
```

### From source

```bash
git clone git@github.com:garethdaine/cursor-recursive-rag.git
cd cursor-recursive-rag
npm install
npm run build
npm link  # Makes cursor-rag available globally
```

## Setup Wizard

Run `cursor-rag setup` to configure the system. The wizard will:

1. **Select Vector Store**:
   - **ChromaDB (local)**: Zero setup, runs in-process, good for development
   - **Qdrant**: Better performance, supports local Docker or cloud
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

Interactive setup wizard to configure vector store, embeddings, and API keys.

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

## Usage in Cursor

After setup, use in Cursor chat with `@recursive-rag`:

```
@recursive-rag How does authentication work in this project and what's the recommended pattern from the NextAuth docs?

@recursive-rag search_knowledge "server components data fetching patterns"

@recursive-rag crawl_and_ingest url="https://docs.example.com" maxPages=50
```

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
  }
}
```

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
