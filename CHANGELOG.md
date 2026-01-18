# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-alpha.1] - 2026-01-18

### Added
- **MCP Gateway Integration** - Connect to MCP Gateway for 87+ aggregated tools
  - `gateway_search_tools` - Search available tools across all backends
  - `gateway_call_tool` - Call tools with result filtering
  - `gateway_execute_skill` - Execute gateway skills
  - `gateway_health` - Check gateway status
- **OpenSkills Integration** - Universal skills loader support
  - `list_openskills` - List installed skills
  - `read_openskill` - Read skill content
  - `ingest_openskills` - Ingest skills into RAG knowledge base
  - `search_openskills` - Semantic search across skills
- **Web Dashboard** - Real-time monitoring and configuration UI
  - Overview with stats and activity
  - Search interface for testing queries
  - Activity log for operation tracking
  - Settings configuration panel
- **Rotating Proxy Support** - Optional proxy for URL fetching
  - PacketStream driver
  - SmartProxy driver
  - Country targeting and sticky sessions

## [0.1.0-alpha.1] - 2026-01-18

### Added
- Initial implementation of cursor-recursive-rag
- **Core RAG Features**
  - Recursive multi-hop retrieval with query decomposition
  - Iterative refinement with follow-up question generation
  - Confidence-based stopping criteria
- **MCP Server** with 5 core tools
  - `recursive_query` - Multi-hop retrieval
  - `search_knowledge` - Direct vector search
  - `ingest_document` - Single document ingestion
  - `crawl_and_ingest` - Firecrawl web crawling
  - `list_sources` - List indexed sources
- **Configurable Vector Stores**
  - ChromaDB (local, zero setup)
  - Qdrant (local/cloud)
  - Cloudflare Vectorize (placeholder)
- **Configurable Embedding Models**
  - Xenova/transformers.js (local, free)
  - OpenAI text-embedding-3-small
  - Ollama (local)
- **CLI Tools**
  - `cursor-rag setup` - Interactive configuration wizard
  - `cursor-rag ingest` - Document ingestion
  - `cursor-rag search` - Test search queries
  - `cursor-rag status` - Show configuration and stats
- **Firecrawl Integration** - Web crawling for documentation
- **Auto-registration** with Cursor IDE's MCP config

[Unreleased]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.2.0-alpha.1...HEAD
[0.2.0-alpha.1]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.1.0-alpha.1...v0.2.0-alpha.1
[0.1.0-alpha.1]: https://github.com/garethdaine/cursor-recursive-rag/releases/tag/v0.1.0-alpha.1
