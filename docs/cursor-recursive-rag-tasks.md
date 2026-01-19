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

### CRR-203: Implement Chat History Ingestion CLI
**Estimate**: 2 points
**Labels**: chat-history, cli
**Blocked by**: CRR-201, CRR-202

Add CLI commands for chat history ingestion and watching.

**File**: `src/cli/ingestChats.ts`

**Acceptance Criteria**:
- [ ] `cursor-rag chat ingest` ingests new conversations
- [ ] `cursor-rag chat list` shows available conversations
- [ ] `cursor-rag chat watch` runs in background mode
- [ ] Already-processed conversations are skipped
- [ ] Progress displayed during ingestion

---

## Epic: Phase 3 - Knowledge Extraction Pipeline

### CRR-301: Define Knowledge Extraction Schema
**Estimate**: 1 point
**Labels**: extraction, types

Define TypeScript interfaces for extracted knowledge (solutions, patterns, decisions, etc.).

**File**: `src/types/extractedKnowledge.ts`

**Acceptance Criteria**:
- [ ] All types properly defined and exported
- [ ] Types support JSON serialisation
- [ ] Confidence scores bounded 0-1
- [ ] CodeChange interface for before/after

---

### CRR-302: Implement LLM Knowledge Extractor
**Estimate**: 5 points
**Labels**: extraction, llm
**Blocked by**: CRR-301

Create service that uses LLM to extract structured knowledge from conversations.

**File**: `src/services/knowledgeExtractor.ts`

**Acceptance Criteria**:
- [ ] Extracts solutions with problem/solution pairs
- [ ] Extracts patterns with implementation examples
- [ ] Extracts decisions with reasoning
- [ ] Handles LLM response parsing errors gracefully
- [ ] Batch extraction shows progress
- [ ] Low-confidence items filtered out
- [ ] Configurable extraction settings

---

### CRR-303: Create Knowledge Storage Service
**Estimate**: 3 points
**Labels**: extraction, storage
**Blocked by**: CRR-301, CRR-302, CRR-104

Store extracted knowledge as first-class searchable chunks with relationships.

**File**: `src/services/knowledgeStorage.ts`

**Acceptance Criteria**:
- [ ] Solutions stored with full problem/solution context
- [ ] Patterns include implementation examples
- [ ] Decisions include reasoning and alternatives
- [ ] Relationships created between related items
- [ ] Appropriate importance scores assigned

---

## Epic: Phase 4 - Relationship Graph

### CRR-401: Define Relationship Types
**Estimate**: 1 point
**Labels**: graph, types

Define all relationship types and graph interfaces.

**File**: `src/types/relationships.ts`

**Acceptance Criteria**:
- [ ] All 13 relationship types defined
- [ ] RelationshipType enum exported
- [ ] Relationship interface with strength and metadata
- [ ] GraphTraversalOptions and GraphNode interfaces

---

### CRR-402: Implement Graph Service
**Estimate**: 4 points
**Labels**: graph, service
**Blocked by**: CRR-401, CRR-102

Create graph operations for relationship-based retrieval and contradiction detection.

**File**: `src/services/relationshipGraph.ts`

**Acceptance Criteria**:
- [ ] All relationship types supported
- [ ] Graph traversal respects depth limits
- [ ] Bidirectional relationships create two edges
- [ ] Contradiction detection identifies potential conflicts
- [ ] Traversal filters by type and strength

---

## Epic: Phase 5 - Hierarchical Memory (Categories/Summaries)

### CRR-501: Define Category Structure
**Estimate**: 1 point
**Labels**: categories, types

Define category types and default categories.

**File**: `src/types/categories.ts`

**Acceptance Criteria**:
- [ ] Category interface with summary and stats
- [ ] CategoryItem interface for assignments
- [ ] DEFAULT_CATEGORIES array with 10 categories
- [ ] Types exported

---

### CRR-502: Implement Category Manager
**Estimate**: 5 points
**Labels**: categories, service
**Blocked by**: CRR-501, CRR-302

Create service for category management and summary evolution.

**File**: `src/services/categoryManager.ts`

**Acceptance Criteria**:
- [ ] Default categories created on first run
- [ ] Chunks classified with relevance scores
- [ ] Summaries evolve as new items added
- [ ] Contradictions handled (new info updates summary)
- [ ] Category selection uses LLM for relevance

---

## Epic: Phase 6 - Background Maintenance Jobs

### CRR-601: Implement Maintenance Scheduler
**Estimate**: 4 points
**Labels**: maintenance, background
**Blocked by**: CRR-103, CRR-502

Create scheduled jobs for consolidation, summarisation, and cleanup.

**File**: `src/services/maintenanceScheduler.ts`

**Acceptance Criteria**:
- [ ] Jobs run on schedule (cron syntax)
- [ ] Jobs can be triggered manually
- [ ] Nightly consolidation completes in <5 minutes
- [ ] Weekly summarisation updates all categories
- [ ] Monthly re-index handles large databases
- [ ] Proper error handling and logging

---

### CRR-602: Add Maintenance CLI Commands
**Estimate**: 2 points
**Labels**: maintenance, cli
**Blocked by**: CRR-601

Add CLI commands for maintenance operations.

**File**: `src/cli/maintenance.ts`

**Acceptance Criteria**:
- [ ] `cursor-rag maintenance run <job>` works
- [ ] `cursor-rag maintenance start` runs background
- [ ] `cursor-rag maintenance stats` shows metrics
- [ ] `cursor-rag maintenance cleanup` safely removes data
- [ ] Dry run mode prevents accidental data loss

---

## Epic: Phase 7 - Enhanced Retrieval Scoring

### CRR-701: Implement Hybrid Scorer
**Estimate**: 4 points
**Labels**: retrieval, scoring
**Blocked by**: CRR-402, CRR-502

Create hybrid scoring combining similarity, decay, importance, and graph relationships.

**File**: `src/services/hybridScorer.ts`

**Acceptance Criteria**:
- [ ] Final scores combine all components correctly
- [ ] Graph boost increases scores for related items
- [ ] Type boost favours solutions and patterns
- [ ] Tiered retrieval tries summaries first
- [ ] Recency boost favours recently accessed items
- [ ] Configurable weights

---

### CRR-702: Add New MCP Tools
**Estimate**: 3 points
**Labels**: mcp, tools
**Blocked by**: CRR-701

Add new MCP tools for memory features.

**File**: `src/mcp/memoryTools.ts`

**Acceptance Criteria**:
- [ ] search_past_solutions tool working
- [ ] find_similar_issues tool working
- [ ] get_project_patterns tool working
- [ ] recall_decision tool working
- [ ] get_category_summary tool working
- [ ] ingest_chat_history tool working
- [ ] memory_stats tool working

---

### CRR-703: Create Memory Configuration
**Estimate**: 1 point
**Labels**: config

Define configuration schema and defaults for all memory features.

**File**: `src/config/memoryConfig.ts`

**Acceptance Criteria**:
- [ ] MemoryConfig interface complete
- [ ] DEFAULT_MEMORY_CONFIG with sensible defaults
- [ ] Config validation
- [ ] Environment variable overrides

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
| **Total** | **23** | **66** |

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

**Total estimated time: 7-8 weeks**

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

Phase 8 (RLM) depends on:
- CRR-701 (Hybrid Scorer) for complexity assessment
- CRR-801 (Context Environment) is the foundation for RLM features
```
