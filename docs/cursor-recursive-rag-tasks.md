# cursor-recursive-rag Memory Features - Task Breakdown

## Overview

This document provides a Linear-compatible task breakdown for implementing advanced memory features in cursor-recursive-rag. Each task includes estimates and acceptance criteria.

---

## Epic: Phase 1 - Foundation (Enhanced Schema & Temporal Decay)

### CRR-101: Define Enhanced Chunk Interface
**Estimate**: 1 point
**Labels**: foundation, types

Create new TypeScript interfaces for enhanced chunks with temporal tracking, importance, decay scores, and entity tags.

**File**: `src/types/memory.ts`

**Acceptance Criteria**:
- [ ] EnhancedChunk interface defined with all new fields
- [ ] ChunkType enum with all knowledge types
- [ ] EntityTag and EntityType defined
- [ ] Types exported from main index
- [ ] Existing code continues to compile

---

### CRR-102: Create Memory Metadata Store
**Estimate**: 3 points
**Labels**: foundation, database
**Blocks**: CRR-103, CRR-104

Implement SQLite-based metadata store for temporal tracking, relationships, and categories.

**File**: `src/services/memoryMetadataStore.ts`

**Acceptance Criteria**:
- [ ] SQLite database created on first run
- [ ] Tables: chunks_metadata, relationships, access_log, categories, processed_conversations
- [ ] CRUD operations for all tables
- [ ] Indexes created for performance
- [ ] Access recording updates last_accessed_at and access_count

---

### CRR-103: Implement Decay Score Calculator
**Estimate**: 2 points
**Labels**: foundation, algorithm
**Blocked by**: CRR-102

Create decay calculator with configurable half-life, access factors, and importance weighting.

**File**: `src/services/decayCalculator.ts`

**Acceptance Criteria**:
- [ ] Decay scores range 0.0 to 1.0
- [ ] New chunks with high importance start high
- [ ] Frequently accessed chunks maintain high scores
- [ ] Old unused chunks decay toward 0
- [ ] Batch update completes in <5s for 10k chunks
- [ ] Configurable weights and half-life

---

### CRR-104: Integrate Metadata Store with Vector Store
**Estimate**: 3 points
**Labels**: foundation, integration
**Blocked by**: CRR-102, CRR-103

Create EnhancedVectorStore wrapper that combines existing vector store with metadata tracking.

**File**: `src/services/enhancedVectorStore.ts`

**Acceptance Criteria**:
- [ ] All existing tests continue to pass
- [ ] Metadata stored for new chunks
- [ ] Search results include decay scores
- [ ] Access recorded for returned results
- [ ] Re-ranking produces different order than pure similarity

---

## Epic: Phase 2 - Cursor Chat History Integration

### CRR-201: Implement Cursor Database Reader
**Estimate**: 3 points
**Labels**: chat-history, database

Create service to read Cursor's chat history from its SQLite database.

**File**: `src/services/cursorChatReader.ts`

**Acceptance Criteria**:
- [ ] Correctly locates Cursor DB on macOS, Windows, Linux
- [ ] Reads conversations without corrupting database
- [ ] Handles database being locked (read-only mode)
- [ ] Returns empty array if no conversations
- [ ] Supports filtering by date, project, code presence

---

### CRR-202: Create Conversation Processor
**Estimate**: 2 points
**Labels**: chat-history, processing
**Blocked by**: CRR-201

Process raw conversations into structured chunks with embeddings.

**File**: `src/services/conversationProcessor.ts`

**Acceptance Criteria**:
- [ ] Groups messages into logical exchanges
- [ ] Creates embeddings for each chunk
- [ ] Extracts code blocks as separate chunks
- [ ] Calculates reasonable importance scores
- [ ] Extracts basic entities (languages, files)

---

### CRR-203: Implement Chat History Ingestion CLI ✅
**Estimate**: 2 points
**Labels**: chat-history, cli
**Blocked by**: CRR-201, CRR-202
**Status**: COMPLETED

Add CLI commands for chat history ingestion and watching.

**File**: `src/cli/commands/chat.ts`

**Acceptance Criteria**:
- [x] `cursor-rag chat ingest` ingests new conversations
- [x] `cursor-rag chat list` shows available conversations
- [x] `cursor-rag chat watch` runs in background mode
- [x] Already-processed conversations are skipped
- [x] Progress displayed during ingestion
- [x] `cursor-rag chat stats` shows ingestion statistics
- [x] `cursor-rag chat reset` resets processing status

---

## Epic: Phase 3 - Knowledge Extraction Pipeline

### CRR-301: Define Knowledge Extraction Schema ✅
**Estimate**: 1 point
**Labels**: extraction, types
**Status**: COMPLETED

Define TypeScript interfaces for extracted knowledge (solutions, patterns, decisions, etc.).

**File**: `src/types/extractedKnowledge.ts`

**Acceptance Criteria**:
- [x] All types properly defined and exported
- [x] Types support JSON serialisation
- [x] Confidence scores bounded 0-1
- [x] CodeChange interface for before/after

---

### CRR-302: Implement LLM Knowledge Extractor ✅
**Estimate**: 5 points
**Labels**: extraction, llm
**Blocked by**: CRR-301
**Status**: COMPLETED

Create service that uses LLM to extract structured knowledge from conversations.

**File**: `src/services/knowledgeExtractor.ts`

**Acceptance Criteria**:
- [x] Extracts solutions with problem/solution pairs
- [x] Extracts patterns with implementation examples
- [x] Extracts decisions with reasoning
- [x] Handles LLM response parsing errors gracefully
- [x] Heuristic fallback when LLM unavailable
- [x] Low-confidence items filtered out
- [x] Configurable extraction settings

---

### CRR-303: Create Knowledge Storage Service ✅
**Estimate**: 3 points
**Labels**: extraction, storage
**Blocked by**: CRR-301, CRR-302, CRR-104
**Status**: COMPLETED

Store extracted knowledge as first-class searchable chunks with relationships.

**File**: `src/services/knowledgeStorage.ts`

**Acceptance Criteria**:
- [x] Solutions stored with full problem/solution context
- [x] Patterns include implementation examples
- [x] Decisions include reasoning and alternatives
- [x] Relationships created between related items
- [x] Appropriate importance scores assigned
- [x] Integrated with `cursor-rag chat ingest --extract`

---

## Epic: Phase 4 - Relationship Graph

### CRR-401: Define Relationship Types ✅
**Estimate**: 1 point
**Labels**: graph, types
**Status**: COMPLETED

Define all relationship types and graph interfaces.

**File**: `src/types/relationships.ts`

**Acceptance Criteria**:
- [x] All 19 relationship types defined (extended from spec's 13)
- [x] RelationshipType enum exported (unified with memory.ts)
- [x] Relationship interface with strength and metadata
- [x] GraphTraversalOptions and GraphNode interfaces
- [x] Helper functions: isBidirectional, getReverseType, getRelationshipsByCategory
- [x] Relationship categories: semantic, causal, temporal, conflict, preference, structural

---

### CRR-402: Implement Graph Service ✅
**Estimate**: 4 points
**Labels**: graph, service
**Blocked by**: CRR-401, CRR-102
**Status**: COMPLETED

Create graph operations for relationship-based retrieval and contradiction detection.

**File**: `src/services/relationshipGraph.ts`

**Acceptance Criteria**:
- [x] All relationship types supported
- [x] Graph traversal respects depth limits (BFS with configurable maxDepth)
- [x] Bidirectional relationships create two edges
- [x] Contradiction detection identifies potential conflicts
- [x] Traversal filters by type and strength
- [x] Additional features: cluster detection, supersession chains, graph stats

---

## Epic: Phase 5 - Hierarchical Memory (Categories/Summaries)

### CRR-501: Define Category Structure ✅
**Estimate**: 1 point
**Labels**: categories, types
**Status**: COMPLETED

Define category types and default categories.

**File**: `src/types/categories.ts`

**Acceptance Criteria**:
- [x] Category interface with summary and stats (ExtendedCategory, CategoryWithStats)
- [x] CategoryItem interface for assignments (re-exported from memory.ts)
- [x] DEFAULT_CATEGORIES array with 10 categories
- [x] Types exported
- [x] Helper functions: findCategoriesByTags, scoreCategoryMatch, getDefaultCategoryNames

---

### CRR-502: Implement Category Manager ✅
**Estimate**: 5 points
**Labels**: categories, service
**Blocked by**: CRR-501, CRR-302
**Status**: COMPLETED

Create service for category management and summary evolution.

**File**: `src/services/categoryManager.ts`

**Acceptance Criteria**:
- [x] Default categories created on first run (initialize method)
- [x] Chunks classified with relevance scores (heuristic + LLM modes)
- [x] Summaries evolve as new items added (evolveSummary method)
- [x] Contradictions handled (LLM detects updates/changes)
- [x] Category selection uses LLM for relevance (selectRelevantCategories)
- [x] Additional: keyword matching, tag extraction, custom category creation

---

## Epic: Phase 6 - Background Maintenance Jobs

### CRR-601: Implement Maintenance Scheduler ✅
**Estimate**: 4 points
**Labels**: maintenance, background
**Blocked by**: CRR-103, CRR-502

Create scheduled jobs for consolidation, summarisation, and cleanup.

**File**: `src/services/maintenanceScheduler.ts`

**Acceptance Criteria**:
- [x] Jobs run on schedule (setInterval-based scheduling with proper cron-like timing)
- [x] Jobs can be triggered manually (runJob method with 5 job types)
- [x] Nightly consolidation completes in <5 minutes (decay, duplicates, hot items, archival)
- [x] Weekly summarisation updates all categories (evolveSummary for each category)
- [x] Monthly re-index handles large databases (graph analysis, old item archival, vacuum)
- [x] Proper error handling and logging (MaintenanceJobResult with metrics and errors)

---

### CRR-602: Add Maintenance CLI Commands ✅
**Estimate**: 2 points
**Labels**: maintenance, cli
**Blocked by**: CRR-601

Add CLI commands for maintenance operations.

**File**: `src/cli/commands/maintenance.ts`

**Acceptance Criteria**:
- [x] `cursor-rag maintenance run <job>` works (decay, consolidate, summarize, reindex, cleanup)
- [x] `cursor-rag maintenance start` runs background (with proper scheduling and graceful shutdown)
- [x] `cursor-rag maintenance stats` shows metrics (memory, graph, scheduler, categories)
- [x] `cursor-rag maintenance cleanup` safely removes data (with --confirm flag)
- [x] Dry run mode prevents accidental data loss (--dry-run flag for cleanup)

---

## Epic: Phase 7 - Enhanced Retrieval Scoring

### CRR-701: Implement Hybrid Scorer ✅
**Estimate**: 4 points
**Labels**: retrieval, scoring
**Blocked by**: CRR-402, CRR-502

Create hybrid scoring combining similarity, decay, importance, and graph relationships.

**File**: `src/services/hybridScorer.ts`

**Acceptance Criteria**:
- [x] Final scores combine all components correctly (weighted combination of 6 factors)
- [x] Graph boost increases scores for related items (via getGraphContext traversal)
- [x] Type boost favours solutions and patterns (configurable typeBoosts map)
- [x] Tiered retrieval tries summaries first (tieredRetrieval method)
- [x] Recency boost favours recently accessed items (calculateRecencyScore with half-life)
- [x] Configurable weights (ScoringConfig with DEFAULT_SCORING_CONFIG)

---

### CRR-702: Add New MCP Tools ✅
**Estimate**: 3 points
**Labels**: mcp, tools
**Blocked by**: CRR-701

Add new MCP tools for memory features.

**File**: `src/server/tools/memory.ts`

**Acceptance Criteria**:
- [x] search_past_solutions tool working (searches solution chunks with hybrid scoring)
- [x] find_similar_issues tool working (includes graph traversal for related items)
- [x] get_project_patterns tool working (filters by category, sorted by importance)
- [x] recall_decision tool working (searches decision/standard chunks)
- [x] get_category_summary tool working (returns category summary and metadata)
- [x] ingest_chat_history tool working (with optional knowledge extraction)
- [x] memory_stats tool working (comprehensive stats output)

---

### CRR-703: Create Memory Configuration ✅
**Estimate**: 1 point
**Labels**: config

Define configuration schema and defaults for all memory features.

**File**: `src/config/memoryConfig.ts`

**Acceptance Criteria**:
- [x] MemoryConfig interface complete (Zod schema with 7 config sections)
- [x] DEFAULT_MEMORY_CONFIG with sensible defaults (all sections have defaults)
- [x] Config validation (validateMemoryConfig function with weight sum check)
- [x] Environment variable overrides (getMemoryConfigWithEnvOverrides function)

---

## Epic: Phase 8 - RLM-Style Recursive Retrieval

*Based on the Recursive Language Models paper (Zhang et al., 2024)*

### CRR-801: Implement Context Environment
**Estimate**: 5 points
**Labels**: rlm, retrieval, core

Create sandboxed environment for RLM-style context processing with cost tracking and budget enforcement.

**File**: `src/services/contextEnvironment.ts`

**Acceptance Criteria**:
- [ ] Context can be loaded as environment variables
- [ ] State description gives LLM overview without full content
- [ ] Peek allows selective viewing of chunks
- [ ] Filter supports regex patterns
- [ ] Sub-queries track cost and enforce budget
- [ ] Async batch queries work with concurrency limit
- [ ] Termination conditions enforced (iterations, cost, sub-calls)

---

### CRR-802: Implement Recursive Retrieval Controller
**Estimate**: 5 points
**Labels**: rlm, retrieval, core
**Blocked by**: CRR-801, CRR-701

Orchestrate iterative retrieval with complexity assessment and action parsing.

**File**: `src/services/recursiveRetrieval.ts`

**Acceptance Criteria**:
- [ ] Simple queries use direct retrieval
- [ ] Complex queries trigger recursive processing
- [ ] Complexity assessment considers context size and query type
- [ ] Actions are parsed and executed correctly
- [ ] Cost tracked across iterations
- [ ] Early termination on budget/iteration limits

---

### CRR-803: Implement Smart Chunking Strategies
**Estimate**: 3 points
**Labels**: rlm, chunking
**Blocked by**: CRR-801

Implement multiple chunking strategies based on RLM paper patterns.

**File**: `src/services/smartChunker.ts`

**Acceptance Criteria**:
- [ ] Uniform chunking by count/size
- [ ] Semantic chunking groups similar content (k-means)
- [ ] Keyword-based chunking filters by patterns
- [ ] Structural chunking groups by source file
- [ ] Adaptive chunking chooses strategy based on content/query

---

### CRR-804: Implement Anti-Pattern Mitigations
**Estimate**: 3 points
**Labels**: rlm, safety
**Blocked by**: CRR-801, CRR-802

Implement safeguards from RLM paper's Negative Results section.

**File**: `src/services/rlmSafeguards.ts`

**Acceptance Criteria**:
- [ ] Model-specific configurations (not one-size-fits-all)
- [ ] Capability detection for code execution ability
- [ ] Token budget management (reserve for answers)
- [ ] Multi-signal termination detection (not just tags)
- [ ] Sub-call throttling and caching
- [ ] Circuit breaker for runaway trajectories
- [ ] Model prior-based pre-filtering

---

## Epic: Phase 9 - Dashboard Tools UI

*Interactive tool execution from the web dashboard*

### CRR-901: Define Tool Registry Interface
**Estimate**: 2 points
**Labels**: dashboard, tools, types

Create a registry system for exposing RAG tools to the dashboard UI.

**File**: `src/dashboard/toolRegistry.ts`

**Acceptance Criteria**:
- [ ] ToolDefinition interface with name, description, parameters schema
- [ ] ToolParameter interface with type, required, default, validation
- [ ] ToolResult interface with success/error states
- [ ] Registry supports dynamic tool registration
- [ ] JSON Schema generation for parameter forms

---

### CRR-902: Implement Dashboard Tools API
**Estimate**: 3 points
**Labels**: dashboard, api
**Blocked by**: CRR-901

Add API endpoints for tool discovery and execution.

**File**: `src/dashboard/server.ts`

**Acceptance Criteria**:
- [ ] `GET /api/tools` returns list of available tools with schemas
- [ ] `POST /api/tools/:name/execute` runs a tool with parameters
- [ ] `GET /api/tools/:name/status/:jobId` for long-running tools
- [ ] Proper error handling and validation
- [ ] Rate limiting to prevent abuse

---

### CRR-903: Create Tools UI Panel
**Estimate**: 4 points
**Labels**: dashboard, ui
**Blocked by**: CRR-902

Build interactive tools section in the dashboard.

**File**: `src/dashboard/public/index.html`

**Acceptance Criteria**:
- [ ] New "Tools" tab in dashboard navigation
- [ ] Tool cards with name, description, and "Run" button
- [ ] Dynamic form generation from parameter schemas
- [ ] Real-time execution status and progress
- [ ] Result display with syntax highlighting for code/JSON
- [ ] Execution history with re-run capability
- [ ] Tool categories/filtering (search, ingest, maintenance, etc.)

---

### CRR-904: Register Core Tools
**Estimate**: 2 points
**Labels**: dashboard, tools
**Blocked by**: CRR-901, CRR-902

Register existing RAG tools with the dashboard registry.

**File**: `src/dashboard/coreTools.ts`

**Acceptance Criteria**:
- [ ] `search` - Search knowledge base with query
- [ ] `ingest_document` - Ingest text/URL into RAG
- [ ] `crawl_and_ingest` - Crawl website and ingest
- [ ] `chat_ingest` - Ingest Cursor chat history
- [ ] `chat_list` - List available conversations
- [ ] `memory_stats` - Show memory statistics
- [ ] `list_sources` - List ingested sources
- [ ] All tools have proper parameter validation

---

## Epic: Phase 10 - Cursor Rules Optimizer

*Intelligent cleanup and optimization of Cursor rules and AGENTS.md files*

### CRR-1000: Implement LLM Provider System (Strategy Pattern)
**Estimate**: 5 points
**Labels**: llm, infrastructure, core
**Priority**: HIGH - Required by CRR-1004 and other LLM-dependent features

Create a flexible LLM provider system using the strategy pattern that supports multiple backends.

**Files**: `src/types/llmProvider.ts`, `src/adapters/llm/index.ts`, `src/adapters/llm/*.ts`

**Acceptance Criteria**:
- [ ] LLMProvider interface with chat/complete methods
- [ ] LLMProviderConfig type with provider-specific options
- [ ] LLMResponse type with content, usage stats, model info

**Provider Implementations**:
- [ ] **CursorProvider**: Hook into Cursor's AI via MCP tool calls (if available)
- [ ] **OpenAIProvider**: OpenAI API (GPT-4o, GPT-4o-mini, o1, etc.)
- [ ] **AnthropicProvider**: Claude API (claude-3.5-sonnet, opus, haiku)
- [ ] **DeepSeekProvider**: DeepSeek API (deepseek-chat, deepseek-coder)
- [ ] **GroqProvider**: Groq API (llama, mixtral models)
- [ ] **OllamaProvider**: Local Ollama models
- [ ] **OpenRouterProvider**: OpenRouter for unified API access

**Configuration**:
- [ ] Environment variable support (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- [ ] Config file support (~/.cursor-rag/llm-config.json)
- [ ] CLI flag for provider selection (`--llm-provider openai`)
- [ ] Auto-detection: Try Cursor MCP → env vars → config file → fallback to Ollama

**Features**:
- [ ] Retry logic with exponential backoff
- [ ] Rate limiting per provider
- [ ] Cost tracking per request
- [ ] Streaming support where available
- [ ] Model capability detection (context length, vision, JSON mode)
- [ ] Fallback chain (if primary fails, try next)

**Cursor AI Integration**:
- [ ] Detect if running within Cursor IDE
- [ ] Use MCP protocol to request completions from Cursor's AI
- [ ] Graceful fallback if Cursor AI unavailable
- [ ] Respect Cursor's rate limits and usage quotas

---

### CRR-1001: Define Rules Analysis Types
**Estimate**: 2 points
**Labels**: rules, types

Define types for rule parsing, analysis, and optimization.

**File**: `src/types/rulesOptimizer.ts`

**Acceptance Criteria**:
- [ ] RuleFile interface (path, content, format: mdc/md/txt)
- [ ] ParsedRule interface (id, title, content, tags, dependencies)
- [ ] RuleCluster interface for grouping related rules
- [ ] OptimizationReport interface with before/after metrics
- [ ] DuplicateMatch interface with similarity score
- [ ] MergeCandidate interface for rule combinations

---

### CRR-1002: Implement Rules Parser
**Estimate**: 3 points
**Labels**: rules, parser
**Blocked by**: CRR-1001

Parse various rule file formats into structured representation.

**File**: `src/services/rulesParser.ts`

**Acceptance Criteria**:
- [ ] Parse `.mdc` files (Cursor rules format)
- [ ] Parse `AGENTS.md` files
- [ ] Parse `.cursorrules` legacy format
- [ ] Extract rule metadata (globs, descriptions, always-apply flags)
- [ ] Handle nested rule structures
- [ ] Preserve original formatting for non-modified rules

---

### CRR-1003: Implement Duplicate Detector
**Estimate**: 4 points
**Labels**: rules, analysis
**Blocked by**: CRR-1002

Detect duplicate and near-duplicate rules using semantic similarity.

**File**: `src/services/rulesDuplicateDetector.ts`

**Acceptance Criteria**:
- [ ] Exact duplicate detection (content hash)
- [ ] Semantic similarity using embeddings (configurable threshold)
- [ ] Detect rules that are subsets of others
- [ ] Identify contradicting rules
- [ ] Group related rules by topic/technology
- [ ] Generate similarity matrix for rule set

---

### CRR-1004: Implement Rules Merger
**Estimate**: 5 points
**Labels**: rules, llm
**Blocked by**: CRR-1000, CRR-1003

Use LLM to intelligently merge and consolidate related rules.

**File**: `src/services/rulesMerger.ts`

**Acceptance Criteria**:
- [ ] Uses LLMProvider system (CRR-1000) for AI operations
- [ ] Merge duplicate rules preserving all unique information
- [ ] Combine related rules into comprehensive single rules
- [ ] Rewrite verbose rules to be more concise
- [ ] Preserve critical details while reducing token count
- [ ] Maintain rule intent and effectiveness
- [ ] Support dry-run mode with preview
- [ ] Configurable aggressiveness (conservative/balanced/aggressive)

---

### CRR-1005: Implement Rules Optimizer Service
**Estimate**: 4 points
**Labels**: rules, service
**Blocked by**: CRR-1002, CRR-1003, CRR-1004

Orchestrate the full optimization pipeline.

**File**: `src/services/rulesOptimizer.ts`

**Acceptance Criteria**:
- [ ] Scan folder for all rule files recursively
- [ ] Parse and analyze all rules
- [ ] Detect duplicates and redundancies
- [ ] Generate optimization plan
- [ ] Execute merges and rewrites
- [ ] Calculate token savings (before/after)
- [ ] Generate detailed optimization report
- [ ] Backup original files before modification

---

### CRR-1006: Add Rules Optimizer CLI
**Estimate**: 2 points
**Labels**: rules, cli
**Blocked by**: CRR-1005

Add CLI commands for rules optimization.

**File**: `src/cli/commands/rules.ts`

**Acceptance Criteria**:
- [ ] `cursor-rag rules analyze <folder>` - Analyze rules without changes
- [ ] `cursor-rag rules optimize <folder>` - Run full optimization
- [ ] `cursor-rag rules duplicates <folder>` - Show duplicates only
- [ ] `--dry-run` flag for preview mode
- [ ] `--aggressive` flag for maximum compression
- [ ] `--backup` flag to create backups (default: true)
- [ ] `--output <folder>` to write optimized rules to new location
- [ ] `--llm-provider <provider>` flag to select LLM backend
- [ ] Progress display and summary statistics

---

### CRR-1007: Add Rules Optimizer to Dashboard
**Estimate**: 3 points
**Labels**: rules, dashboard
**Blocked by**: CRR-1005, CRR-903

Add rules optimization UI to dashboard tools.

**File**: `src/dashboard/public/index.html`, `src/dashboard/coreTools.ts`

**Acceptance Criteria**:
- [ ] "Rules Optimizer" tool card in Tools section
- [ ] Folder path input with validation
- [ ] Analysis results display with duplicate highlighting
- [ ] Before/after comparison view
- [ ] Token count savings visualization
- [ ] LLM provider selection dropdown
- [ ] One-click optimize with confirmation
- [ ] Download optimized rules as zip

---

## Epic: Phase 11 - Comprehensive Test Suite

*Unit, integration, and E2E tests for the entire system*

### CRR-1101: Test Infrastructure Setup
**Estimate**: 3 points
**Labels**: testing, infrastructure

Set up testing framework, configuration, and CI integration.

**Files**: `vitest.config.ts`, `package.json`, `tests/setup.ts`

**Acceptance Criteria**:
- [ ] Vitest configured with TypeScript support
- [ ] Test scripts in package.json (`test`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`)
- [ ] Coverage thresholds configured (minimum 70%)
- [ ] Test setup file with common mocks and utilities
- [ ] SQLite in-memory database for test isolation
- [ ] Mock embeddings adapter for fast tests
- [ ] GitHub Actions CI workflow for automated testing

---

### CRR-1102: Unit Tests - Core Types & Utilities
**Estimate**: 2 points
**Labels**: testing, unit
**Blocked by**: CRR-1101

Test type guards, enums, and utility functions.

**Files**: `tests/unit/types/*.test.ts`, `tests/unit/utils/*.test.ts`

**Acceptance Criteria**:
- [ ] `memory.ts` types and enums tested
- [ ] `relationships.ts` helper functions tested (isBidirectional, getReverseType, getRelationshipsByCategory)
- [ ] `extractedKnowledge.ts` type validation tested
- [ ] Chunker utility functions tested
- [ ] Config parsing and validation tested

---

### CRR-1103: Unit Tests - Services (Phase 1-2)
**Estimate**: 4 points
**Labels**: testing, unit
**Blocked by**: CRR-1101

Test foundation and chat history services.

**Files**: `tests/unit/services/*.test.ts`

**Acceptance Criteria**:
- [ ] `MemoryMetadataStore` CRUD operations tested
- [ ] `MemoryMetadataStore` relationship operations tested
- [ ] `MemoryMetadataStore` category operations tested
- [ ] `DecayCalculator` scoring logic tested
- [ ] `DecayCalculator` edge cases (new chunks, old chunks, high access)
- [ ] `EnhancedVectorStore` wrapper tested with mock vector store
- [ ] `CursorChatReader` path detection tested (mock filesystem)
- [ ] `ConversationProcessor` chunking and entity extraction tested

---

### CRR-1104: Unit Tests - Services (Phase 3-4)
**Estimate**: 4 points
**Labels**: testing, unit
**Blocked by**: CRR-1101

Test knowledge extraction and relationship graph services.

**Files**: `tests/unit/services/*.test.ts`

**Acceptance Criteria**:
- [ ] `KnowledgeExtractor` heuristic extraction tested
- [ ] `KnowledgeExtractor` LLM extraction tested (mocked LLM)
- [ ] `KnowledgeExtractor` confidence filtering tested
- [ ] `KnowledgeStorage` storage operations tested
- [ ] `KnowledgeStorage` relationship creation tested
- [ ] `RelationshipGraph` traversal tested (depth limits, type filtering)
- [ ] `RelationshipGraph` bidirectional relationships tested
- [ ] `RelationshipGraph` contradiction detection tested
- [ ] `RelationshipGraph` cluster finding tested

---

### CRR-1105: Unit Tests - Adapters
**Estimate**: 3 points
**Labels**: testing, unit
**Blocked by**: CRR-1101

Test vector store and embedding adapters.

**Files**: `tests/unit/adapters/*.test.ts`

**Acceptance Criteria**:
- [ ] Memory vector store tested (add, search, delete)
- [ ] Xenova embeddings tested (mocked transformer)
- [ ] OpenAI embeddings tested (mocked API)
- [ ] Ollama embeddings tested (mocked API)
- [ ] Adapter factory functions tested
- [ ] Error handling for adapter failures tested

---

### CRR-1106: Integration Tests - Vector Store + Metadata
**Estimate**: 4 points
**Labels**: testing, integration
**Blocked by**: CRR-1103, CRR-1105

Test interactions between vector store and metadata store.

**Files**: `tests/integration/vector-metadata.test.ts`

**Acceptance Criteria**:
- [ ] EnhancedVectorStore upsert stores in both stores
- [ ] Search results enriched with metadata correctly
- [ ] Access recording updates decay scores
- [ ] Re-ranking with decay scores produces different order
- [ ] Archived chunks filtered from search results
- [ ] Relationship data included in search results

---

### CRR-1107: Integration Tests - Knowledge Pipeline
**Estimate**: 4 points
**Labels**: testing, integration
**Blocked by**: CRR-1104

Test the full knowledge extraction and storage pipeline.

**Files**: `tests/integration/knowledge-pipeline.test.ts`

**Acceptance Criteria**:
- [ ] Conversation → extraction → storage flow tested
- [ ] Solutions stored with correct chunk types
- [ ] Patterns stored with implementation examples
- [ ] Decisions stored with reasoning
- [ ] Relationships created between related knowledge
- [ ] Duplicate conversations not re-processed
- [ ] Entity extraction from conversations tested

---

### CRR-1108: Integration Tests - CLI Commands
**Estimate**: 3 points
**Labels**: testing, integration
**Blocked by**: CRR-1103, CRR-1104

Test CLI commands end-to-end.

**Files**: `tests/integration/cli/*.test.ts`

**Acceptance Criteria**:
- [ ] `cursor-rag ingest` command tested
- [ ] `cursor-rag search` command tested
- [ ] `cursor-rag status` command tested
- [ ] `cursor-rag chat list` command tested
- [ ] `cursor-rag chat ingest` command tested
- [ ] `cursor-rag chat stats` command tested
- [ ] Error handling for invalid inputs tested
- [ ] Help output validated

---

### CRR-1109: Integration Tests - MCP Server & Tools
**Estimate**: 4 points
**Labels**: testing, integration
**Blocked by**: CRR-1106

Test MCP server protocol and tool execution.

**Files**: `tests/integration/mcp/*.test.ts`

**Acceptance Criteria**:
- [ ] MCP server initializes correctly
- [ ] Tool listing returns all available tools
- [ ] `search` tool returns relevant results
- [ ] `ingest` tool processes documents
- [ ] `crawl` tool handles URLs
- [ ] `recursive_query` tool performs multi-hop retrieval
- [ ] `list_sources` tool returns ingested sources
- [ ] Error responses follow MCP protocol

---

### CRR-1110: E2E Tests - Dashboard UI
**Estimate**: 5 points
**Labels**: testing, e2e
**Blocked by**: CRR-1101

Test dashboard web interface with Playwright.

**Files**: `tests/e2e/dashboard/*.test.ts`

**Acceptance Criteria**:
- [ ] Dashboard loads without errors
- [ ] Search form submits and displays results
- [ ] Activity log displays recent operations
- [ ] Statistics cards show correct data
- [ ] Sources list displays ingested documents
- [ ] Navigation between tabs works
- [ ] Dark/light mode toggle works (if implemented)
- [ ] Responsive layout on mobile viewport
- [ ] Error states displayed correctly

---

### CRR-1111: E2E Tests - Full User Flows
**Estimate**: 5 points
**Labels**: testing, e2e
**Blocked by**: CRR-1108, CRR-1109, CRR-1110

Test complete user workflows from ingestion to retrieval.

**Files**: `tests/e2e/flows/*.test.ts`

**Acceptance Criteria**:
- [ ] Flow: Ingest URL → Search → View results
- [ ] Flow: Ingest file → Search → Verify content
- [ ] Flow: Chat ingest → Search past solutions
- [ ] Flow: MCP search from simulated Cursor request
- [ ] Flow: Dashboard search → Click result → View details
- [ ] Performance: Search returns in <500ms for 1000 chunks
- [ ] Performance: Ingest 100 documents in <30s

---

### CRR-1112: Test Fixtures & Factories
**Estimate**: 2 points
**Labels**: testing, infrastructure
**Blocked by**: CRR-1101

Create reusable test fixtures and data factories.

**Files**: `tests/fixtures/*.ts`, `tests/factories/*.ts`

**Acceptance Criteria**:
- [ ] Sample conversations fixture (various formats)
- [ ] Sample documents fixture (markdown, code, mixed)
- [ ] EnhancedChunk factory with sensible defaults
- [ ] Conversation factory with customizable messages
- [ ] Relationship factory for graph tests
- [ ] Category factory for hierarchy tests
- [ ] Mock vector store with predictable search results
- [ ] Mock LLM with configurable responses

---

### CRR-1113: Test Documentation & Coverage Report
**Estimate**: 1 point
**Labels**: testing, documentation
**Blocked by**: CRR-1102 through CRR-1112

Document testing strategy and generate coverage reports.

**Files**: `docs/TESTING.md`, `coverage/`

**Acceptance Criteria**:
- [ ] TESTING.md with testing strategy overview
- [ ] Instructions for running different test suites
- [ ] Coverage report generation configured
- [ ] Coverage badges in README
- [ ] Test naming conventions documented
- [ ] Mock usage guidelines documented

---

## Summary

| Epic | Tasks | Total Points |
|------|-------|--------------|
| Phase 1: Foundation | 4 | 9 |
| Phase 2: Chat History | 3 | 7 |
| Phase 3: Knowledge Extraction | 3 | 9 |
| Phase 4: Relationship Graph | 2 | 5 |
| Phase 5: Hierarchical Memory | 2 | 6 |
| Phase 6: Maintenance | 2 | 6 |
| Phase 7: Enhanced Retrieval | 3 | 8 |
| Phase 8: RLM Recursive Retrieval | 4 | 16 |
| Phase 9: Dashboard Tools UI | 4 | 11 |
| Phase 10: Rules Optimizer | 8 | 28 |
| Phase 11: Test Suite | 13 | 44 |
| **Total** | **48** | **149** |

---

## Suggested Sprint Planning

### Sprint 1 (Week 1-2): Foundation + Chat History
- CRR-101, CRR-102, CRR-103, CRR-104
- CRR-201, CRR-202, CRR-203
- **Points**: 16

### Sprint 2 (Week 3-4): Knowledge Extraction + Graph
- CRR-301, CRR-302, CRR-303
- CRR-401, CRR-402
- **Points**: 14

### Sprint 3 (Week 5-6): Categories + Maintenance + Retrieval
- CRR-501, CRR-502
- CRR-601, CRR-602
- CRR-701, CRR-702, CRR-703
- **Points**: 20

### Sprint 4 (Week 7-8): RLM Recursive Retrieval
- CRR-801, CRR-802, CRR-803, CRR-804
- **Points**: 16

### Sprint 5 (Week 9-10): Dashboard Tools + LLM Provider + Rules Start
- CRR-901, CRR-902, CRR-903, CRR-904
- CRR-1000 (LLM Provider System - enables Phase 10 LLM features)
- CRR-1001, CRR-1002
- **Points**: 23

### Sprint 6 (Week 11-12): Rules Optimizer Completion
- CRR-1003, CRR-1004, CRR-1005, CRR-1006, CRR-1007
- **Points**: 19

**Total estimated time: 11-12 weeks**

---

## Dependencies Graph

```
CRR-101 ──┬── CRR-102 ──┬── CRR-103 ──┬── CRR-104
          │             │             │
          │             └── CRR-402 ──┘
          │
          └── CRR-301 ──── CRR-302 ──── CRR-303 ──┐
                                                   │
CRR-201 ──── CRR-202 ──── CRR-203                 │
                                                   │
CRR-401 ──── CRR-402 ─────────────────────────────┤
                                                   │
CRR-501 ──── CRR-502 ─────────────────────────────┤
                                                   │
CRR-601 ──── CRR-602                              │
                                                   │
          ┌───────────────────────────────────────┘
          │
CRR-701 ──┼── CRR-702
          │
CRR-703 ──┴── CRR-801 ──┬── CRR-802 ──┬── CRR-803
                        │             │
                        └─────────────┴── CRR-804

Phase 9: Dashboard Tools (can run in parallel)
CRR-901 ──── CRR-902 ──── CRR-903
                    └──── CRR-904

Phase 10: Rules Optimizer (can run in parallel)
CRR-1000 (LLM Provider) ──┐
                          ├──── CRR-1004 (Rules Merger - needs LLM)
CRR-1001 ──── CRR-1002 ──── CRR-1003 ──┘
                                  └──── CRR-1005 ──── CRR-1006
                                              └──── CRR-1007 (requires CRR-903)

LLM Provider Priority Order (CRR-1000):
1. Cursor AI (via MCP) → if running in Cursor IDE
2. Environment vars → OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
3. Config file → ~/.cursor-rag/llm-config.json
4. Ollama → local fallback (free, no API key)

Phase 11: Test Suite (can run in parallel, tests existing features)
CRR-1101 (Infrastructure) ──┬── CRR-1102 (Types/Utils)
                            ├── CRR-1103 (Services 1-2) ──┬── CRR-1106 (Integration: Vector+Meta)
                            ├── CRR-1104 (Services 3-4) ──┴── CRR-1107 (Integration: Knowledge)
                            ├── CRR-1105 (Adapters) ──────┘
                            ├── CRR-1108 (Integration: CLI)
                            ├── CRR-1109 (Integration: MCP)
                            ├── CRR-1110 (E2E: Dashboard)
                            └── CRR-1112 (Fixtures)
                                    │
CRR-1106 + CRR-1107 + CRR-1108 + CRR-1109 + CRR-1110 ──── CRR-1111 (E2E: Flows)
                                    │
All tests (CRR-1102 through CRR-1112) ──── CRR-1113 (Documentation)

Notes:
- Phase 8 (RLM) depends on CRR-701 (Hybrid Scorer)
- Phase 9 (Dashboard Tools) is independent, can start anytime
- Phase 10 (Rules Optimizer) is independent, can start anytime
- Phase 11 (Test Suite) is independent, can start anytime - tests existing code
- CRR-1000 (LLM Provider) enables all LLM-dependent features across the system
- CRR-1004 depends on CRR-1000 + CRR-1003 for LLM-powered merging
- CRR-1007 depends on CRR-903 (Tools UI Panel) for dashboard integration
- CRR-1101 (Test Infrastructure) should be done first in Phase 11
```
