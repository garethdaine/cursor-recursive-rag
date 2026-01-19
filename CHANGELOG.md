# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-01-19

First beta release with stable core features and comprehensive rules optimizer.

### Added

#### Phase 10: Cursor Rules Optimizer
- **LLM Provider System** (Strategy Pattern)
  - Support for OpenAI, Anthropic, DeepSeek, Groq, Ollama, OpenRouter
  - Retry logic, rate limiting, cost tracking, streaming support
  - Model capability detection and token counting
  - Configurable via dashboard Settings tab

- **Rules Parser Service**
  - Parse `.mdc`, `.md`, `AGENTS.md`, `.cursorrules` files
  - YAML frontmatter extraction
  - Token counting with tiktoken
  - Content hashing for deduplication

- **Rules Analyzer Service**
  - Duplicate detection (exact, near-exact, semantic)
  - Conflict detection between rules
  - Outdated pattern detection (configurable)
  - Version check patterns (user-defined)
  - Deprecation patterns (user-defined)

- **Rules Merger Service** (LLM-powered)
  - Intelligent merging preserving all content
  - Concise rewriting reducing token count
  - Dry-run mode with preview
  - Automatic backup creation

- **Rules CLI Commands**
  - `rules list <folder>` - List all rules with tokens
  - `rules analyze <folder>` - Full analysis with JSON output
  - `rules duplicates/conflicts/outdated <folder>` - Filtered views
  - `rules optimize <folder>` - Full optimization
  - `rules merge <folder>` - LLM-powered merging
  - `rules rewrite <folder>` - LLM-powered rewriting

- **Dashboard Rules Optimizer UI**
  - Rules Optimizer panel in Tools tab
  - Server-side folder browser with navigation
  - One-click analyze with progress indicators
  - Results display with severity badges
  - Dry run and apply modes
  - Works with or without LLM configured

- **Natural Language Rules**
  - Define rules in plain English
  - LLM interprets during analysis
  - Configurable severity levels

#### Dashboard Enhancements
- **Modal/Toast System** - Replaced all browser alerts with in-app modals
- **LLM Configuration UI** - Provider selection, API key input, model listing
- **Folder Browser** - Server-side navigation with quick access buttons
- **Rules Analyzer Settings** - Version checks, deprecation patterns, thresholds

#### Memory System (Phases 1-8)
- Enhanced chunk interface with temporal tracking
- Memory metadata store (SQLite)
- Decay score calculator
- Smart chunker with semantic boundaries
- Knowledge extractor with entity detection
- Category manager with auto-tagging
- Relationship graph for entity connections
- Hierarchical memory summarization
- Recursive retrieval (RLM-style)
- Hybrid scoring with multiple signals

#### Dashboard Tools (Phase 9)
- Tool registry with 12+ built-in tools
- Parameter forms with validation
- Execution history tracking
- Long-running job support
- Category filtering

### Changed
- **Status**: Upgraded from Alpha to Beta
- Dashboard now uses in-app modals instead of browser alerts
- Rules optimizer works without LLM (pattern matching mode)
- Improved folder path handling with absolute paths

### Fixed
- Extra closing brace causing dashboard JavaScript error
- Folder picker now returns full absolute paths
- LLM timeout increased to 120 seconds for large prompts

## [0.2.0-alpha.3] - 2026-01-19

### Added
- Rules CLI commands (list, analyze, duplicates, conflicts, outdated, optimize)
- Rules parser and analyzer services
- LLM provider system with strategy pattern

## [0.2.0-alpha.2] - 2026-01-19

### Added
- **Redis Stack Support** - Full RediSearch-based vector adapter for Docker
- **Redis 8.x Native Support** - Native VADD/VSIM commands for Homebrew Redis
- **Persistent Activity Logging** - Shared between MCP server and dashboard

### Changed
- Default vector store changed to `redis-stack`

### Fixed
- Activity log now properly shared between MCP server and dashboard

## [0.2.0-alpha.1] - 2026-01-18

### Added
- **MCP Gateway Integration** - Connect to 87+ aggregated tools
- **OpenSkills Integration** - Universal skills loader support
- **Web Dashboard** - Real-time monitoring and configuration
- **Rotating Proxy Support** - PacketStream and SmartProxy drivers

## [0.1.0-alpha.1] - 2026-01-18

### Added
- Initial implementation
- Core RAG with recursive multi-hop retrieval
- MCP Server with 5 core tools
- Configurable vector stores (ChromaDB, Qdrant, Vectorize)
- Configurable embeddings (Xenova, OpenAI, Ollama)
- CLI tools (setup, ingest, search, status)
- Firecrawl integration for web crawling
- Auto-registration with Cursor IDE

[Unreleased]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.2.0-alpha.3...v0.2.0
[0.2.0-alpha.3]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.2.0-alpha.2...v0.2.0-alpha.3
[0.2.0-alpha.2]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.2.0-alpha.1...v0.2.0-alpha.2
[0.2.0-alpha.1]: https://github.com/garethdaine/cursor-recursive-rag/compare/v0.1.0-alpha.1...v0.2.0-alpha.1
[0.1.0-alpha.1]: https://github.com/garethdaine/cursor-recursive-rag/releases/tag/v0.1.0-alpha.1
