# cursor-recursive-rag: Advanced Memory System Specification

## Executive Summary

This specification defines the architecture and implementation tasks for building an advanced memory system directly into cursor-recursive-rag. The goal is to transform the existing multi-hop RAG system into an intelligent, evolving knowledge base that:

1. **Learns from Cursor chat history** - Extracts solutions, patterns, decisions, and standards from past development sessions
2. **Implements temporal decay** - Prioritises recent, frequently-accessed knowledge while gracefully retiring stale content
3. **Supports relationship graphs** - Enables multi-hop reasoning through typed relationships between knowledge entities
4. **Provides hierarchical memory** - Organises knowledge into Resources → Items → Categories for efficient retrieval
5. **Handles contradictions** - Detects and resolves conflicting information automatically

---

## Research Foundation: Recursive Language Models

This specification incorporates key insights from the Recursive Language Models (RLM) paper (Zhang et al., 2024), which demonstrates that LLMs can process inputs **two orders of magnitude beyond their context windows** by treating prompts as external environment objects rather than feeding them directly into the neural network.

### Core RLM Insight

> "The key insight is that long prompts should not be fed into the neural network directly but should instead be treated as part of the environment that the LLM can symbolically interact with."

The RLM approach exposes the prompt as a variable in a REPL environment, allowing the model to:
- **Peek into** and **decompose** the prompt programmatically
- **Recursively invoke itself** over snippets
- **Build up answers** through variable storage
- **Filter context** using code (regex, keyword searches) based on model priors

### Key Findings Relevant to This Project

| Finding | Implication for cursor-recursive-rag |
|---------|-------------------------------------|
| RLMs scale to 10M+ tokens | Our chat history + docs can exceed context windows |
| REPL environment enables long input handling | We should treat retrieved context as environment variables |
| Recursive sub-calling helps information-dense tasks | Multi-hop retrieval should support recursive decomposition |
| Performance degrades with complexity AND length | Need complexity-aware chunking strategies |
| Costs are high-variance due to trajectory length | Need early termination and cost budgets |

### Negative Results to Avoid (From RLM Paper)

The paper's Appendix A provides critical anti-patterns we must avoid:

1. **Same prompt across all models is problematic** - Different models need tuned prompts; Qwen3-Coder needed extra warnings about excessive sub-calls
2. **Models without coding capabilities struggle** - Our recursive retrieval must work with non-coding models too
3. **Thinking models run out of output tokens** - Budget output tokens carefully for reasoning models
4. **Synchronous calls are slow** - Implement async sub-calls from the start
5. **Final answer detection is brittle** - Need robust termination conditions, not just tag-based detection

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Foundation - Enhanced Schema & Temporal Decay](#phase-1-foundation)
3. [Phase 2: Cursor Chat History Integration](#phase-2-chat-history)
4. [Phase 3: Knowledge Extraction Pipeline](#phase-3-knowledge-extraction)
5. [Phase 4: Relationship Graph](#phase-4-relationship-graph)
6. [Phase 5: Hierarchical Memory (Categories/Summaries)](#phase-5-hierarchical-memory)
7. [Phase 6: Background Maintenance Jobs](#phase-6-maintenance)
8. [Phase 7: Enhanced Retrieval Scoring](#phase-7-retrieval)
9. [Phase 8: RLM-Style Recursive Retrieval](#phase-8-rlm-retrieval)
10. [Database Schema](#database-schema)
11. [MCP Tool Definitions](#mcp-tools)
12. [Configuration Schema](#configuration)
13. [Anti-Patterns and Negative Results](#anti-patterns)
14. [Testing Strategy](#testing)

---

## Architecture Overview

### Current State

```
┌─────────────────────────────────────────────────────────────┐
│                  cursor-recursive-rag (current)              │
├─────────────────────────────────────────────────────────────┤
│  Ingestion: URLs, files, directories                        │
│  Storage: Vector store (Redis/Qdrant/Chroma/Cloudflare)     │
│  Retrieval: Multi-hop with query decomposition              │
│  Interface: MCP server for Cursor IDE                       │
└─────────────────────────────────────────────────────────────┘
```

### Target State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    cursor-recursive-rag (enhanced)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INGESTION LAYER                                                            │
│  ├── URLs/Files/Directories (existing)                                      │
│  ├── Cursor Chat History (NEW)                                              │
│  │   └── SQLite reader → Conversation processor → Knowledge extractor       │
│  └── Manual knowledge entries (NEW)                                         │
│                                                                              │
│  STORAGE LAYER                                                               │
│  ├── Vector Store (existing, enhanced schema)                               │
│  │   └── + timestamps, access tracking, importance, decay scores            │
│  ├── Relationship Graph (NEW)                                               │
│  │   └── SQLite/Redis graph with typed edges                                │
│  └── Category Summaries (NEW)                                               │
│      └── Evolving markdown summaries per topic                              │
│                                                                              │
│  RETRIEVAL LAYER                                                             │
│  ├── Multi-hop retrieval (existing)                                         │
│  ├── Hybrid scoring: similarity + time decay + importance (NEW)             │
│  ├── Graph traversal for related knowledge (NEW)                            │
│  └── Tiered retrieval: summaries → items → raw (NEW)                        │
│                                                                              │
│  MAINTENANCE LAYER (NEW)                                                     │
│  ├── Nightly consolidation                                                  │
│  ├── Weekly summarisation                                                   │
│  ├── Monthly re-indexing                                                    │
│  └── Contradiction detection & resolution                                   │
│                                                                              │
│  MCP INTERFACE                                                               │
│  ├── Existing tools (search, recall, etc.)                                  │
│  └── NEW: search_past_solutions, find_similar_issues, get_project_patterns  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Vector Store | Existing (Redis Stack/Qdrant/Chroma) | Already implemented |
| Relationship Graph | SQLite (embedded) | No external dependencies, ACID compliant |
| Chat History Access | SQLite reader | Direct access to Cursor's state.vscdb |
| Knowledge Extraction | LLM (configurable) | Structured extraction from conversations |
| Background Jobs | node-cron or custom scheduler | Lightweight, no external deps |
| Category Summaries | Markdown files or SQLite | Simple, human-readable |

---

## Phase 1: Foundation - Enhanced Schema & Temporal Decay {#phase-1-foundation}

### Overview

Enhance the existing chunk schema to support temporal tracking, access patterns, and decay scoring. This is the foundation for all subsequent features.

### Tasks

#### Task 1.1: Define Enhanced Chunk Interface

**File**: `src/types/memory.ts` (new file)

```typescript
/**
 * Enhanced chunk interface with temporal and importance tracking
 */
export interface EnhancedChunk {
  // Existing fields
  id: string;
  content: string;
  embedding: number[];
  source: string;
  metadata: Record<string, unknown>;
  
  // NEW: Temporal tracking
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
  accessCount: number;
  
  // NEW: Importance & decay
  importance: number;        // 0.0 - 1.0, default 0.5
  decayScore: number;        // Calculated: combines age, access, importance
  isArchived: boolean;       // Soft delete for low-relevance items
  
  // NEW: Type classification
  chunkType: ChunkType;
  
  // NEW: Relationships (IDs of related chunks)
  relatedChunkIds: string[];
  
  // NEW: Entity tags
  entities: EntityTag[];
  
  // NEW: Source tracking for chat-derived knowledge
  sourceConversationId?: string;
  sourceMessageIndex?: number;
}

export enum ChunkType {
  DOCUMENTATION = 'documentation',
  CODE = 'code',
  SOLUTION = 'solution',          // Problem + solution from chat
  PATTERN = 'pattern',            // Reusable code pattern
  DECISION = 'decision',          // Architectural decision
  STANDARD = 'standard',          // Coding standard/guideline
  PREFERENCE = 'preference',      // User preference
  CATEGORY_SUMMARY = 'category_summary',  // High-level summary
}

export interface EntityTag {
  type: EntityType;
  value: string;
  confidence: number;
}

export enum EntityType {
  TOOL = 'tool',              // e.g., "postgresql", "redis"
  LANGUAGE = 'language',      // e.g., "typescript", "php"
  FRAMEWORK = 'framework',    // e.g., "laravel", "vue"
  CONCEPT = 'concept',        // e.g., "authentication", "caching"
  PROJECT = 'project',        // e.g., "tvd-platform"
  PERSON = 'person',          // e.g., team member names
  FILE = 'file',              // e.g., specific file paths
  COMPONENT = 'component',    // e.g., "auth-service"
}
```

**Acceptance Criteria**:
- [ ] Type definitions compile without errors
- [ ] All existing code continues to work (backward compatible)
- [ ] Types are exported from main index

---

#### Task 1.2: Create Memory Metadata Store

**File**: `src/services/memoryMetadataStore.ts` (new file)

Create a SQLite-based metadata store that tracks temporal information separately from the vector store. This allows any vector store backend to gain memory capabilities.

```typescript
/**
 * SQLite-based metadata store for memory tracking
 * 
 * This store maintains temporal metadata, access patterns, and relationships
 * independently of the vector store, allowing any vector backend to gain
 * memory capabilities.
 */
export class MemoryMetadataStore {
  private db: Database;
  
  constructor(dbPath: string) {
    // Initialize SQLite database
  }
  
  async initialize(): Promise<void> {
    // Create tables: chunks_metadata, relationships, access_log, categories
  }
  
  // Chunk metadata operations
  async upsertChunkMetadata(chunk: EnhancedChunk): Promise<void>;
  async getChunkMetadata(chunkId: string): Promise<ChunkMetadata | null>;
  async recordAccess(chunkId: string): Promise<void>;
  async updateDecayScores(): Promise<void>;
  async archiveStaleChunks(threshold: number): Promise<string[]>;
  
  // Relationship operations
  async addRelationship(from: string, to: string, type: RelationshipType, strength?: number): Promise<void>;
  async getRelatedChunks(chunkId: string, type?: RelationshipType): Promise<RelatedChunk[]>;
  async findContradictions(chunkId: string): Promise<Contradiction[]>;
  
  // Category operations
  async upsertCategory(category: Category): Promise<void>;
  async getCategory(name: string): Promise<Category | null>;
  async listCategories(): Promise<Category[]>;
  
  // Analytics
  async getAccessStats(since?: Date): Promise<AccessStats>;
  async getDecayReport(): Promise<DecayReport>;
}
```

**SQL Schema** (to be created in `initialize()`):

```sql
-- Chunk metadata (extends vector store data)
CREATE TABLE IF NOT EXISTS chunks_metadata (
  chunk_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  chunk_type TEXT NOT NULL DEFAULT 'documentation',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at DATETIME,
  access_count INTEGER DEFAULT 0,
  importance REAL DEFAULT 0.5,
  decay_score REAL DEFAULT 1.0,
  is_archived BOOLEAN DEFAULT FALSE,
  source_conversation_id TEXT,
  source_message_index INTEGER,
  entities_json TEXT  -- JSON array of EntityTag
);

-- Relationships between chunks
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_chunk_id TEXT NOT NULL,
  to_chunk_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  UNIQUE(from_chunk_id, to_chunk_id, relationship_type),
  FOREIGN KEY (from_chunk_id) REFERENCES chunks_metadata(chunk_id),
  FOREIGN KEY (to_chunk_id) REFERENCES chunks_metadata(chunk_id)
);

-- Access log for analytics
CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id TEXT NOT NULL,
  accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  query_context TEXT,
  FOREIGN KEY (chunk_id) REFERENCES chunks_metadata(chunk_id)
);

-- Category summaries
CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  description TEXT,
  summary_markdown TEXT,
  chunk_count INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  parent_category TEXT,
  FOREIGN KEY (parent_category) REFERENCES categories(name)
);

-- Processed conversations (to avoid re-processing)
CREATE TABLE IF NOT EXISTS processed_conversations (
  conversation_id TEXT PRIMARY KEY,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  chunks_created INTEGER DEFAULT 0,
  knowledge_extracted_json TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chunks_decay ON chunks_metadata(decay_score);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks_metadata(chunk_type);
CREATE INDEX IF NOT EXISTS idx_chunks_archived ON chunks_metadata(is_archived);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_chunk_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_chunk_id);
CREATE INDEX IF NOT EXISTS idx_access_log_chunk ON access_log(chunk_id);
```

**Acceptance Criteria**:
- [ ] SQLite database is created on first run
- [ ] All CRUD operations work correctly
- [ ] Access logging updates last_accessed_at and access_count
- [ ] Indexes are created for performance-critical queries

---

#### Task 1.3: Implement Decay Score Calculator

**File**: `src/services/decayCalculator.ts` (new file)

```typescript
/**
 * Calculates decay scores for chunks based on multiple factors
 * 
 * Formula: decayScore = (ageFactor * 0.3) + (accessFactor * 0.3) + (importanceFactor * 0.4)
 * 
 * Where:
 * - ageFactor = 1.0 / (1.0 + (ageDays / halfLifeDays))
 * - accessFactor = min(1.0, accessCount / expectedAccesses) * recencyBoost
 * - importanceFactor = chunk.importance
 */
export class DecayCalculator {
  private config: DecayConfig;
  
  constructor(config?: Partial<DecayConfig>) {
    this.config = {
      halfLifeDays: 60,           // Age at which decay is 50%
      expectedAccessesPerMonth: 5, // Expected access frequency
      recencyBoostDays: 7,        // Boost for recently accessed
      recencyBoostMultiplier: 1.5,
      weights: {
        age: 0.3,
        access: 0.3,
        importance: 0.4,
      },
      ...config,
    };
  }
  
  calculateDecayScore(chunk: ChunkMetadata, now: Date = new Date()): number {
    const ageFactor = this.calculateAgeFactor(chunk.createdAt, now);
    const accessFactor = this.calculateAccessFactor(chunk, now);
    const importanceFactor = chunk.importance;
    
    return (
      ageFactor * this.config.weights.age +
      accessFactor * this.config.weights.access +
      importanceFactor * this.config.weights.importance
    );
  }
  
  private calculateAgeFactor(createdAt: Date, now: Date): number {
    const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return 1.0 / (1.0 + (ageDays / this.config.halfLifeDays));
  }
  
  private calculateAccessFactor(chunk: ChunkMetadata, now: Date): number {
    const baseAccessScore = Math.min(1.0, chunk.accessCount / this.config.expectedAccessesPerMonth);
    
    // Apply recency boost if accessed recently
    if (chunk.lastAccessedAt) {
      const daysSinceAccess = (now.getTime() - chunk.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAccess <= this.config.recencyBoostDays) {
        return Math.min(1.0, baseAccessScore * this.config.recencyBoostMultiplier);
      }
    }
    
    return baseAccessScore;
  }
  
  // Batch update all decay scores
  async updateAllDecayScores(store: MemoryMetadataStore): Promise<UpdateResult> {
    // Implementation: fetch all non-archived chunks, recalculate scores, batch update
  }
  
  // Get chunks below threshold for potential archival
  getArchivalCandidates(chunks: ChunkMetadata[], threshold: number = 0.2): ChunkMetadata[] {
    return chunks.filter(c => c.decayScore < threshold && !c.isArchived);
  }
}

export interface DecayConfig {
  halfLifeDays: number;
  expectedAccessesPerMonth: number;
  recencyBoostDays: number;
  recencyBoostMultiplier: number;
  weights: {
    age: number;
    access: number;
    importance: number;
  };
}
```

**Acceptance Criteria**:
- [ ] Decay scores range from 0.0 to 1.0
- [ ] New chunks with high importance start with high scores
- [ ] Frequently accessed chunks maintain high scores
- [ ] Old, unused chunks decay toward 0
- [ ] Batch update completes in reasonable time (<5s for 10k chunks)

---

#### Task 1.4: Integrate Metadata Store with Existing Vector Store

**File**: `src/services/enhancedVectorStore.ts` (new file)

Create a wrapper that combines the existing vector store with the new metadata store:

```typescript
/**
 * Enhanced vector store that wraps existing implementation with memory capabilities
 */
export class EnhancedVectorStore {
  private vectorStore: VectorStore;  // Existing implementation
  private metadataStore: MemoryMetadataStore;
  private decayCalculator: DecayCalculator;
  
  constructor(
    vectorStore: VectorStore,
    metadataStore: MemoryMetadataStore,
    decayConfig?: Partial<DecayConfig>
  ) {
    this.vectorStore = vectorStore;
    this.metadataStore = metadataStore;
    this.decayCalculator = new DecayCalculator(decayConfig);
  }
  
  // Enhanced upsert: stores in both vector store and metadata store
  async upsert(chunks: EnhancedChunk[]): Promise<void> {
    // 1. Upsert to vector store (existing behavior)
    await this.vectorStore.upsert(chunks);
    
    // 2. Upsert metadata
    for (const chunk of chunks) {
      await this.metadataStore.upsertChunkMetadata(chunk);
    }
  }
  
  // Enhanced search: combines vector similarity with decay scoring
  async search(query: string, options: EnhancedSearchOptions): Promise<EnhancedSearchResult[]> {
    // 1. Get candidates from vector store
    const candidates = await this.vectorStore.search(query, {
      topK: options.topK * 2,  // Over-fetch to allow for re-ranking
      ...options,
    });
    
    // 2. Enrich with metadata
    const enriched = await this.enrichWithMetadata(candidates);
    
    // 3. Re-rank with enhanced scoring
    const ranked = this.rerank(enriched, options);
    
    // 4. Record access for returned results
    await this.recordAccess(ranked.slice(0, options.topK), query);
    
    return ranked.slice(0, options.topK);
  }
  
  private rerank(results: EnhancedSearchResult[], options: EnhancedSearchOptions): EnhancedSearchResult[] {
    return results
      .map(r => ({
        ...r,
        finalScore: this.calculateFinalScore(r, options),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }
  
  private calculateFinalScore(result: EnhancedSearchResult, options: EnhancedSearchOptions): number {
    const weights = options.scoreWeights ?? {
      similarity: 0.5,
      decay: 0.3,
      importance: 0.2,
    };
    
    return (
      result.similarityScore * weights.similarity +
      result.metadata.decayScore * weights.decay +
      result.metadata.importance * weights.importance
    );
  }
  
  private async recordAccess(results: EnhancedSearchResult[], queryContext: string): Promise<void> {
    for (const result of results) {
      await this.metadataStore.recordAccess(result.id);
    }
  }
}

export interface EnhancedSearchOptions {
  topK: number;
  filter?: Record<string, unknown>;
  includeArchived?: boolean;
  chunkTypes?: ChunkType[];
  minDecayScore?: number;
  scoreWeights?: {
    similarity: number;
    decay: number;
    importance: number;
  };
}
```

**Acceptance Criteria**:
- [ ] All existing tests continue to pass
- [ ] Metadata is correctly stored for new chunks
- [ ] Search results include decay scores
- [ ] Access is recorded for returned results
- [ ] Re-ranking produces different order than pure similarity

---

## Phase 2: Cursor Chat History Integration {#phase-2-chat-history}

### Overview

Implement the ability to read and process Cursor IDE chat history directly from its SQLite database.

### Tasks

#### Task 2.1: Implement Cursor Database Reader

**File**: `src/services/cursorChatReader.ts` (new file)

```typescript
import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';

/**
 * Reads chat history directly from Cursor's SQLite database
 */
export class CursorChatReader {
  private dbPath: string;
  
  constructor(customPath?: string) {
    this.dbPath = customPath ?? this.getDefaultDbPath();
  }
  
  private getDefaultDbPath(): string {
    const platform = os.platform();
    const home = os.homedir();
    
    switch (platform) {
      case 'darwin':
        return path.join(home, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
      case 'win32':
        return path.join(process.env.APPDATA ?? home, 'Cursor/User/globalStorage/state.vscdb');
      case 'linux':
        return path.join(home, '.config/Cursor/User/globalStorage/state.vscdb');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
  
  /**
   * List all conversations with metadata
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    const db = new Database(this.dbPath, { readonly: true });
    
    try {
      // Cursor stores chat data in ItemTable with specific keys
      const row = db.prepare(`
        SELECT value FROM ItemTable 
        WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'
      `).get() as { value: string } | undefined;
      
      if (!row) return [];
      
      const chatData = JSON.parse(row.value);
      return this.parseConversations(chatData, options);
    } finally {
      db.close();
    }
  }
  
  /**
   * Get full conversation content
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversations = await this.listConversations();
    return conversations.find(c => c.id === conversationId) ?? null;
  }
  
  /**
   * Search conversations by content
   */
  async searchConversations(query: string, options?: SearchOptions): Promise<ConversationSummary[]> {
    const conversations = await this.listConversations();
    const queryLower = query.toLowerCase();
    
    return conversations.filter(c => {
      const contentMatch = c.messages.some(m => 
        m.content.toLowerCase().includes(queryLower)
      );
      const hasCode = options?.hasCode ? c.messages.some(m => m.codeBlocks.length > 0) : true;
      
      return contentMatch && hasCode;
    });
  }
  
  private parseConversations(chatData: any, options?: ListConversationsOptions): ConversationSummary[] {
    // Parse Cursor's chat data format
    // This will need adjustment based on actual Cursor data structure
    const conversations: ConversationSummary[] = [];
    
    // Cursor stores conversations in a specific format
    // Implementation depends on actual structure
    
    return conversations;
  }
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  hasCodeBlocks: boolean;
  project?: string;
  languages: string[];
  preview: string;
  messages: Message[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeBlocks: CodeBlock[];
  filesReferenced: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

export interface ListConversationsOptions {
  limit?: number;
  since?: Date;
  hasCode?: boolean;
  project?: string;
}

export interface SearchOptions {
  maxResults?: number;
  hasCode?: boolean;
}

export interface Conversation extends ConversationSummary {
  fullContent: string;
}
```

**Acceptance Criteria**:
- [ ] Correctly locates Cursor database on macOS, Windows, Linux
- [ ] Reads conversation data without corrupting database
- [ ] Handles database being locked by Cursor (read-only mode)
- [ ] Returns empty array if no conversations found
- [ ] Supports filtering by date, project, code presence

---

#### Task 2.2: Create Conversation Processor

**File**: `src/services/conversationProcessor.ts` (new file)

```typescript
/**
 * Processes raw conversations into structured chunks
 */
export class ConversationProcessor {
  private embeddings: EmbeddingsService;
  
  constructor(embeddings: EmbeddingsService) {
    this.embeddings = embeddings;
  }
  
  /**
   * Process a conversation into chunks for storage
   */
  async processConversation(conversation: Conversation): Promise<ProcessedConversation> {
    const chunks: EnhancedChunk[] = [];
    
    // 1. Create chunks for each message exchange (user question + assistant response)
    const exchanges = this.groupIntoExchanges(conversation.messages);
    
    for (const exchange of exchanges) {
      const chunk = await this.createExchangeChunk(exchange, conversation);
      chunks.push(chunk);
    }
    
    // 2. Create separate chunks for code blocks with context
    for (const message of conversation.messages) {
      for (const codeBlock of message.codeBlocks) {
        const chunk = await this.createCodeChunk(codeBlock, message, conversation);
        chunks.push(chunk);
      }
    }
    
    // 3. Extract entities from the conversation
    const entities = await this.extractEntities(conversation);
    
    return {
      conversationId: conversation.id,
      chunks,
      entities,
      metadata: {
        project: conversation.project,
        languages: conversation.languages,
        filesReferenced: this.getAllFilesReferenced(conversation),
      },
    };
  }
  
  private groupIntoExchanges(messages: Message[]): Exchange[] {
    const exchanges: Exchange[] = [];
    let currentExchange: Exchange | null = null;
    
    for (const message of messages) {
      if (message.role === 'user') {
        if (currentExchange) {
          exchanges.push(currentExchange);
        }
        currentExchange = { userMessage: message, assistantMessages: [] };
      } else if (currentExchange) {
        currentExchange.assistantMessages.push(message);
      }
    }
    
    if (currentExchange) {
      exchanges.push(currentExchange);
    }
    
    return exchanges;
  }
  
  private async createExchangeChunk(exchange: Exchange, conversation: Conversation): Promise<EnhancedChunk> {
    const content = this.formatExchange(exchange);
    const embedding = await this.embeddings.embed(content);
    
    return {
      id: `chat-${conversation.id}-${exchange.userMessage.timestamp.getTime()}`,
      content,
      embedding,
      source: `cursor-chat:${conversation.id}`,
      metadata: {
        exchangeTimestamp: exchange.userMessage.timestamp,
        hasCode: exchange.assistantMessages.some(m => m.codeBlocks.length > 0),
      },
      createdAt: exchange.userMessage.timestamp,
      updatedAt: exchange.userMessage.timestamp,
      lastAccessedAt: null,
      accessCount: 0,
      importance: this.calculateExchangeImportance(exchange),
      decayScore: 1.0,
      isArchived: false,
      chunkType: ChunkType.SOLUTION,
      relatedChunkIds: [],
      entities: [],
      sourceConversationId: conversation.id,
    };
  }
  
  private formatExchange(exchange: Exchange): string {
    const parts = [
      `## User Question\n${exchange.userMessage.content}`,
      `## Assistant Response\n${exchange.assistantMessages.map(m => m.content).join('\n\n')}`,
    ];
    
    if (exchange.assistantMessages.some(m => m.codeBlocks.length > 0)) {
      const codeBlocks = exchange.assistantMessages.flatMap(m => m.codeBlocks);
      parts.push(`## Code\n${codeBlocks.map(cb => `\`\`\`${cb.language}\n${cb.code}\n\`\`\``).join('\n\n')}`);
    }
    
    return parts.join('\n\n');
  }
  
  private calculateExchangeImportance(exchange: Exchange): number {
    let importance = 0.5;
    
    // Boost for code-containing responses
    if (exchange.assistantMessages.some(m => m.codeBlocks.length > 0)) {
      importance += 0.2;
    }
    
    // Boost for longer, detailed responses
    const totalLength = exchange.assistantMessages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalLength > 2000) importance += 0.1;
    
    // Boost for file modifications
    if (exchange.assistantMessages.some(m => m.filesReferenced.length > 0)) {
      importance += 0.1;
    }
    
    return Math.min(1.0, importance);
  }
  
  private async extractEntities(conversation: Conversation): Promise<EntityTag[]> {
    // Basic entity extraction - can be enhanced with LLM
    const entities: EntityTag[] = [];
    const content = conversation.messages.map(m => m.content).join(' ');
    
    // Extract languages from code blocks
    for (const lang of conversation.languages) {
      entities.push({
        type: EntityType.LANGUAGE,
        value: lang,
        confidence: 1.0,
      });
    }
    
    // Extract file references
    const filePattern = /(?:file|path|\.(?:ts|js|php|vue|css|html|json|md))[\s:]+([^\s,]+)/gi;
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      entities.push({
        type: EntityType.FILE,
        value: match[1],
        confidence: 0.7,
      });
    }
    
    return entities;
  }
}

interface Exchange {
  userMessage: Message;
  assistantMessages: Message[];
}

interface ProcessedConversation {
  conversationId: string;
  chunks: EnhancedChunk[];
  entities: EntityTag[];
  metadata: {
    project?: string;
    languages: string[];
    filesReferenced: string[];
  };
}
```

**Acceptance Criteria**:
- [ ] Groups messages into logical exchanges
- [ ] Creates embeddings for each chunk
- [ ] Extracts code blocks as separate chunks
- [ ] Calculates reasonable importance scores
- [ ] Extracts basic entities (languages, files)

---

#### Task 2.3: Implement Chat History Ingestion CLI

**File**: `src/cli/ingestChats.ts` (new file)

Add new CLI commands for chat history ingestion:

```typescript
/**
 * CLI commands for ingesting Cursor chat history
 */
export function registerChatCommands(program: Command) {
  const chatCommand = program
    .command('chat')
    .description('Manage Cursor chat history ingestion');
  
  // Ingest all chats
  chatCommand
    .command('ingest')
    .description('Ingest Cursor chat history into the knowledge base')
    .option('-s, --since <date>', 'Only ingest chats since this date (ISO format)')
    .option('-p, --project <name>', 'Only ingest chats for a specific project')
    .option('--has-code', 'Only ingest chats containing code blocks')
    .option('-l, --limit <number>', 'Maximum number of conversations to ingest', parseInt)
    .option('--dry-run', 'Show what would be ingested without actually ingesting')
    .action(async (options) => {
      const reader = new CursorChatReader();
      const processor = new ConversationProcessor(getEmbeddings());
      const store = getEnhancedVectorStore();
      const metadataStore = getMetadataStore();
      
      console.log('Reading Cursor chat history...');
      const conversations = await reader.listConversations({
        since: options.since ? new Date(options.since) : undefined,
        hasCode: options.hasCode,
        project: options.project,
        limit: options.limit,
      });
      
      console.log(`Found ${conversations.length} conversations`);
      
      // Filter out already processed
      const unprocessed = await filterUnprocessed(conversations, metadataStore);
      console.log(`${unprocessed.length} new conversations to process`);
      
      if (options.dryRun) {
        for (const conv of unprocessed) {
          console.log(`  - ${conv.title} (${conv.messageCount} messages)`);
        }
        return;
      }
      
      // Process and ingest
      let totalChunks = 0;
      for (const conv of unprocessed) {
        const processed = await processor.processConversation(conv);
        await store.upsert(processed.chunks);
        await metadataStore.markConversationProcessed(conv.id, processed.chunks.length);
        totalChunks += processed.chunks.length;
        console.log(`  ✓ ${conv.title}: ${processed.chunks.length} chunks`);
      }
      
      console.log(`\nIngested ${totalChunks} chunks from ${unprocessed.length} conversations`);
    });
  
  // List chats
  chatCommand
    .command('list')
    .description('List available Cursor conversations')
    .option('-l, --limit <number>', 'Maximum number to show', parseInt, 20)
    .option('--processed', 'Only show processed conversations')
    .option('--unprocessed', 'Only show unprocessed conversations')
    .action(async (options) => {
      // Implementation
    });
  
  // Watch for new chats
  chatCommand
    .command('watch')
    .description('Watch for new conversations and ingest automatically')
    .option('-i, --interval <minutes>', 'Check interval in minutes', parseInt, 5)
    .action(async (options) => {
      console.log(`Watching for new conversations every ${options.interval} minutes...`);
      
      const ingestNew = async () => {
        // Run ingest for conversations since last check
      };
      
      setInterval(ingestNew, options.interval * 60 * 1000);
      await ingestNew(); // Run immediately
    });
}
```

**Acceptance Criteria**:
- [ ] `cursor-rag chat ingest` ingests all new conversations
- [ ] `cursor-rag chat list` shows available conversations
- [ ] `cursor-rag chat watch` runs in background mode
- [ ] Already-processed conversations are skipped
- [ ] Progress is displayed during ingestion

---

## Phase 3: Knowledge Extraction Pipeline {#phase-3-knowledge-extraction}

### Overview

Use LLM to extract structured knowledge (solutions, patterns, decisions, standards) from conversations.

### Tasks

#### Task 3.1: Define Knowledge Extraction Schema

**File**: `src/types/extractedKnowledge.ts` (new file)

```typescript
/**
 * Structured knowledge extracted from conversations
 */
export interface ExtractedKnowledge {
  conversationId: string;
  extractedAt: Date;
  
  // Problem/solution pairs
  solutions: Solution[];
  
  // Reusable code patterns
  patterns: Pattern[];
  
  // Architectural/technical decisions
  decisions: Decision[];
  
  // Coding standards/guidelines
  standards: Standard[];
  
  // User preferences/corrections
  preferences: Preference[];
  
  // Entities mentioned
  entities: ExtractedEntity[];
}

export interface Solution {
  id: string;
  problem: string;           // Description of the problem
  errorMessage?: string;     // Specific error if applicable
  solution: string;          // How it was solved
  codeChanges: CodeChange[]; // Code that was added/modified
  filesAffected: string[];   // Files that were changed
  tags: string[];            // Auto-generated tags
  confidence: number;        // How confident the extraction is
}

export interface Pattern {
  id: string;
  name: string;              // Pattern name (e.g., "Repository Pattern")
  description: string;       // What the pattern does
  useCase: string;           // When to use it
  implementation: string;    // Code example
  language: string;
  relatedPatterns: string[]; // IDs of related patterns
  tags: string[];
  confidence: number;
}

export interface Decision {
  id: string;
  topic: string;             // What was decided about
  decision: string;          // The actual decision
  reasoning: string;         // Why this decision was made
  alternatives?: string[];   // Other options considered
  tradeoffs?: string[];      // Known tradeoffs
  context: string;           // Surrounding context
  tags: string[];
  confidence: number;
}

export interface Standard {
  id: string;
  category: string;          // e.g., "naming", "structure", "testing"
  rule: string;              // The standard/guideline
  examples: string[];        // Examples of following the standard
  counterExamples?: string[];// Examples of violations
  rationale?: string;        // Why this standard exists
  tags: string[];
  confidence: number;
}

export interface Preference {
  id: string;
  aspect: string;            // What aspect (e.g., "indentation", "approach")
  preference: string;        // The preferred way
  correction?: string;       // What was corrected
  context: string;           // When this applies
  confidence: number;
}

export interface ExtractedEntity {
  type: EntityType;
  name: string;
  description?: string;
  relationships: EntityRelationship[];
}

export interface EntityRelationship {
  targetEntity: string;
  relationshipType: string;
  strength: number;
}

export interface CodeChange {
  filename?: string;
  language: string;
  before?: string;
  after: string;
  explanation?: string;
}
```

**Acceptance Criteria**:
- [ ] All types are properly defined and exported
- [ ] Types support serialisation to JSON
- [ ] Confidence scores are bounded 0-1

---

#### Task 3.2: Implement LLM Knowledge Extractor

**File**: `src/services/knowledgeExtractor.ts` (new file)

```typescript
/**
 * Uses LLM to extract structured knowledge from conversations
 */
export class KnowledgeExtractor {
  private llm: LLMService;
  private config: ExtractionConfig;
  
  constructor(llm: LLMService, config?: Partial<ExtractionConfig>) {
    this.llm = llm;
    this.config = {
      extractSolutions: true,
      extractPatterns: true,
      extractDecisions: true,
      extractStandards: true,
      extractPreferences: true,
      minConfidence: 0.6,
      ...config,
    };
  }
  
  /**
   * Extract all knowledge from a conversation
   */
  async extract(conversation: Conversation): Promise<ExtractedKnowledge> {
    const fullContent = this.formatConversationForLLM(conversation);
    
    const prompt = `
You are a knowledge extraction specialist. Analyse this Cursor IDE conversation and extract structured knowledge.

## Conversation
${fullContent}

## Instructions
Extract the following types of knowledge. Only extract items you are confident about (confidence > 0.6).

### 1. Solutions
Problems that were solved. Include:
- Clear description of the problem
- Error messages if any
- The solution that worked
- Code changes made
- Files affected

### 2. Patterns
Reusable code patterns or approaches used. Include:
- Pattern name
- What it does
- When to use it
- Example implementation

### 3. Decisions
Technical or architectural decisions made. Include:
- What was decided
- The reasoning
- Alternatives considered
- Tradeoffs

### 4. Standards
Coding standards or guidelines established. Include:
- The rule/guideline
- Examples
- Rationale

### 5. Preferences
User preferences or corrections. Include:
- What aspect
- The preferred approach
- What was corrected

## Output Format
Return a JSON object matching this schema:
{
  "solutions": [...],
  "patterns": [...],
  "decisions": [...],
  "standards": [...],
  "preferences": [...],
  "entities": [...]
}

Only include items where you have enough information to be useful. Empty arrays are fine.
`;

    const response = await this.llm.invoke(prompt, {
      responseFormat: 'json',
      temperature: 0.3, // Low temperature for consistent extraction
    });
    
    const extracted = this.parseResponse(response);
    return this.filterByConfidence(extracted);
  }
  
  /**
   * Extract only solutions (for quick processing)
   */
  async extractSolutions(conversation: Conversation): Promise<Solution[]> {
    // Focused extraction prompt for just solutions
  }
  
  /**
   * Batch extract from multiple conversations
   */
  async batchExtract(conversations: Conversation[], options?: BatchOptions): Promise<ExtractedKnowledge[]> {
    const results: ExtractedKnowledge[] = [];
    
    for (const conv of conversations) {
      try {
        const extracted = await this.extract(conv);
        results.push(extracted);
        
        if (options?.onProgress) {
          options.onProgress(results.length, conversations.length);
        }
      } catch (error) {
        console.error(`Failed to extract from ${conv.id}:`, error);
        if (!options?.continueOnError) throw error;
      }
    }
    
    return results;
  }
  
  private formatConversationForLLM(conversation: Conversation): string {
    return conversation.messages
      .map(m => `**${m.role.toUpperCase()}**:\n${m.content}`)
      .join('\n\n---\n\n');
  }
  
  private parseResponse(response: string): ExtractedKnowledge {
    // Parse JSON response, handling common issues
    try {
      return JSON.parse(response);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      throw new Error('Failed to parse LLM response as JSON');
    }
  }
  
  private filterByConfidence(knowledge: ExtractedKnowledge): ExtractedKnowledge {
    const minConf = this.config.minConfidence;
    
    return {
      ...knowledge,
      solutions: knowledge.solutions.filter(s => s.confidence >= minConf),
      patterns: knowledge.patterns.filter(p => p.confidence >= minConf),
      decisions: knowledge.decisions.filter(d => d.confidence >= minConf),
      standards: knowledge.standards.filter(s => s.confidence >= minConf),
      preferences: knowledge.preferences.filter(p => p.confidence >= minConf),
    };
  }
}

interface ExtractionConfig {
  extractSolutions: boolean;
  extractPatterns: boolean;
  extractDecisions: boolean;
  extractStandards: boolean;
  extractPreferences: boolean;
  minConfidence: number;
}

interface BatchOptions {
  continueOnError?: boolean;
  onProgress?: (completed: number, total: number) => void;
}
```

**Acceptance Criteria**:
- [ ] Extracts solutions with problem/solution pairs
- [ ] Extracts patterns with implementation examples
- [ ] Extracts decisions with reasoning
- [ ] Handles LLM response parsing errors gracefully
- [ ] Batch extraction shows progress
- [ ] Low-confidence items are filtered out

---

#### Task 3.3: Create Knowledge Storage Service

**File**: `src/services/knowledgeStorage.ts` (new file)

Store extracted knowledge as first-class chunks:

```typescript
/**
 * Stores extracted knowledge as searchable chunks
 */
export class KnowledgeStorage {
  private vectorStore: EnhancedVectorStore;
  private metadataStore: MemoryMetadataStore;
  private embeddings: EmbeddingsService;
  
  /**
   * Store extracted knowledge from a conversation
   */
  async storeKnowledge(knowledge: ExtractedKnowledge): Promise<StoreResult> {
    const chunks: EnhancedChunk[] = [];
    
    // Store solutions
    for (const solution of knowledge.solutions) {
      const chunk = await this.createSolutionChunk(solution, knowledge.conversationId);
      chunks.push(chunk);
    }
    
    // Store patterns
    for (const pattern of knowledge.patterns) {
      const chunk = await this.createPatternChunk(pattern, knowledge.conversationId);
      chunks.push(chunk);
    }
    
    // Store decisions
    for (const decision of knowledge.decisions) {
      const chunk = await this.createDecisionChunk(decision, knowledge.conversationId);
      chunks.push(chunk);
    }
    
    // Store standards
    for (const standard of knowledge.standards) {
      const chunk = await this.createStandardChunk(standard, knowledge.conversationId);
      chunks.push(chunk);
    }
    
    // Upsert all chunks
    await this.vectorStore.upsert(chunks);
    
    // Create relationships between related items
    await this.createRelationships(knowledge);
    
    return {
      chunksCreated: chunks.length,
      solutionsStored: knowledge.solutions.length,
      patternsStored: knowledge.patterns.length,
      decisionsStored: knowledge.decisions.length,
      standardsStored: knowledge.standards.length,
    };
  }
  
  private async createSolutionChunk(solution: Solution, conversationId: string): Promise<EnhancedChunk> {
    const content = this.formatSolution(solution);
    const embedding = await this.embeddings.embed(content);
    
    return {
      id: `solution-${solution.id}`,
      content,
      embedding,
      source: `extracted:${conversationId}`,
      metadata: {
        solutionId: solution.id,
        errorMessage: solution.errorMessage,
        filesAffected: solution.filesAffected,
        tags: solution.tags,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: null,
      accessCount: 0,
      importance: 0.8, // High importance for solutions
      decayScore: 1.0,
      isArchived: false,
      chunkType: ChunkType.SOLUTION,
      relatedChunkIds: [],
      entities: solution.tags.map(t => ({
        type: EntityType.CONCEPT,
        value: t,
        confidence: 0.7,
      })),
      sourceConversationId: conversationId,
    };
  }
  
  private formatSolution(solution: Solution): string {
    const parts = [
      `# Problem\n${solution.problem}`,
    ];
    
    if (solution.errorMessage) {
      parts.push(`## Error\n\`\`\`\n${solution.errorMessage}\n\`\`\``);
    }
    
    parts.push(`# Solution\n${solution.solution}`);
    
    if (solution.codeChanges.length > 0) {
      const codeSection = solution.codeChanges
        .map(cc => {
          let code = `### ${cc.filename ?? 'Code'}\n`;
          if (cc.before) {
            code += `Before:\n\`\`\`${cc.language}\n${cc.before}\n\`\`\`\n`;
          }
          code += `After:\n\`\`\`${cc.language}\n${cc.after}\n\`\`\``;
          if (cc.explanation) {
            code += `\n${cc.explanation}`;
          }
          return code;
        })
        .join('\n\n');
      parts.push(`# Code Changes\n${codeSection}`);
    }
    
    if (solution.filesAffected.length > 0) {
      parts.push(`# Files\n${solution.filesAffected.join(', ')}`);
    }
    
    return parts.join('\n\n');
  }
  
  // Similar methods for patterns, decisions, standards...
  
  private async createRelationships(knowledge: ExtractedKnowledge): Promise<void> {
    // Link patterns that reference each other
    for (const pattern of knowledge.patterns) {
      for (const relatedId of pattern.relatedPatterns) {
        await this.metadataStore.addRelationship(
          `pattern-${pattern.id}`,
          `pattern-${relatedId}`,
          RelationshipType.RELATES_TO,
          0.7
        );
      }
    }
    
    // Link solutions to patterns they use
    // Link decisions to their outcomes
    // etc.
  }
}

interface StoreResult {
  chunksCreated: number;
  solutionsStored: number;
  patternsStored: number;
  decisionsStored: number;
  standardsStored: number;
}
```

**Acceptance Criteria**:
- [ ] Solutions are stored with full problem/solution context
- [ ] Patterns include implementation examples
- [ ] Decisions include reasoning and alternatives
- [ ] Relationships are created between related items
- [ ] All chunks have appropriate importance scores

---

## Phase 4: Relationship Graph {#phase-4-relationship-graph}

### Overview

Implement typed relationships between chunks for multi-hop reasoning.

### Tasks

#### Task 4.1: Define Relationship Types

**File**: `src/types/relationships.ts` (new file)

```typescript
/**
 * Typed relationships between knowledge chunks
 */
export enum RelationshipType {
  // Semantic relationships
  RELATES_TO = 'RELATES_TO',           // General relationship
  SIMILAR_TO = 'SIMILAR_TO',           // Semantically similar
  
  // Causal relationships
  LEADS_TO = 'LEADS_TO',               // A causes/leads to B
  DERIVED_FROM = 'DERIVED_FROM',       // B is derived from A
  SOLVES = 'SOLVES',                   // Solution solves problem
  
  // Temporal relationships
  SUPERSEDES = 'SUPERSEDES',           // A replaces B (B is outdated)
  OCCURRED_BEFORE = 'OCCURRED_BEFORE', // Temporal ordering
  EVOLVED_INTO = 'EVOLVED_INTO',       // A evolved into B
  
  // Conflict relationships
  CONTRADICTS = 'CONTRADICTS',         // A and B conflict
  INVALIDATED_BY = 'INVALIDATED_BY',   // A is invalidated by B
  
  // Preference relationships
  PREFERS_OVER = 'PREFERS_OVER',       // User prefers A over B
  
  // Structural relationships
  PART_OF = 'PART_OF',                 // A is part of B
  DEPENDS_ON = 'DEPENDS_ON',           // A depends on B
  IMPLEMENTS = 'IMPLEMENTS',           // A implements B (e.g., pattern)
  EXEMPLIFIES = 'EXEMPLIFIES',         // A is an example of B
}

export interface Relationship {
  id: string;
  fromChunkId: string;
  toChunkId: string;
  type: RelationshipType;
  strength: number;           // 0.0 - 1.0
  createdAt: Date;
  metadata: Record<string, unknown>;
  
  // Bidirectional flag - if true, relationship works both ways
  bidirectional: boolean;
}

export interface GraphTraversalOptions {
  maxDepth: number;
  relationshipTypes?: RelationshipType[];
  minStrength?: number;
  excludeArchived?: boolean;
}

export interface GraphNode {
  chunkId: string;
  depth: number;
  path: string[];             // IDs of chunks in path from start
  relationshipType: RelationshipType;
  strength: number;
}
```

---

#### Task 4.2: Implement Graph Service

**File**: `src/services/relationshipGraph.ts` (new file)

```typescript
/**
 * Graph operations for relationship-based retrieval
 */
export class RelationshipGraph {
  private metadataStore: MemoryMetadataStore;
  
  constructor(metadataStore: MemoryMetadataStore) {
    this.metadataStore = metadataStore;
  }
  
  /**
   * Add a relationship between two chunks
   */
  async addRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType,
    options?: {
      strength?: number;
      bidirectional?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.metadataStore.addRelationship(fromId, toId, type, options?.strength ?? 0.5);
    
    if (options?.bidirectional) {
      // Add reverse relationship
      const reverseType = this.getReverseRelationshipType(type);
      await this.metadataStore.addRelationship(toId, fromId, reverseType, options?.strength ?? 0.5);
    }
  }
  
  /**
   * Traverse graph from a starting chunk
   */
  async traverse(startChunkId: string, options: GraphTraversalOptions): Promise<GraphNode[]> {
    const visited = new Set<string>();
    const results: GraphNode[] = [];
    
    const queue: Array<{ chunkId: string; depth: number; path: string[] }> = [
      { chunkId: startChunkId, depth: 0, path: [] }
    ];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current.chunkId) || current.depth > options.maxDepth) {
        continue;
      }
      
      visited.add(current.chunkId);
      
      // Get relationships from this node
      const relationships = await this.metadataStore.getRelatedChunks(
        current.chunkId,
        options.relationshipTypes?.[0] // TODO: support multiple types
      );
      
      for (const rel of relationships) {
        if (options.minStrength && rel.strength < options.minStrength) {
          continue;
        }
        
        if (options.excludeArchived) {
          const metadata = await this.metadataStore.getChunkMetadata(rel.toChunkId);
          if (metadata?.isArchived) continue;
        }
        
        results.push({
          chunkId: rel.toChunkId,
          depth: current.depth + 1,
          path: [...current.path, current.chunkId],
          relationshipType: rel.type,
          strength: rel.strength,
        });
        
        queue.push({
          chunkId: rel.toChunkId,
          depth: current.depth + 1,
          path: [...current.path, current.chunkId],
        });
      }
    }
    
    return results;
  }
  
  /**
   * Find contradictions for a chunk
   */
  async findContradictions(chunkId: string): Promise<Contradiction[]> {
    const contradicting = await this.metadataStore.getRelatedChunks(
      chunkId,
      RelationshipType.CONTRADICTS
    );
    
    const invalidatedBy = await this.metadataStore.getRelatedChunks(
      chunkId,
      RelationshipType.INVALIDATED_BY
    );
    
    return [
      ...contradicting.map(r => ({
        chunkId: r.toChunkId,
        type: 'contradiction' as const,
        strength: r.strength,
      })),
      ...invalidatedBy.map(r => ({
        chunkId: r.toChunkId,
        type: 'invalidation' as const,
        strength: r.strength,
      })),
    ];
  }
  
  /**
   * Automatically detect potential contradictions
   */
  async detectContradictions(newChunk: EnhancedChunk): Promise<PotentialContradiction[]> {
    // Find semantically similar chunks
    const similar = await this.metadataStore.findSimilarByContent(
      newChunk.id,
      0.85 // High similarity threshold
    );
    
    const potentialContradictions: PotentialContradiction[] = [];
    
    for (const candidate of similar) {
      // Check if they have conflicting timestamps (newer vs older)
      // Check if they have different conclusions about the same topic
      // This could use LLM for sophisticated contradiction detection
      
      if (this.mightContradict(newChunk, candidate)) {
        potentialContradictions.push({
          existingChunkId: candidate.id,
          newChunkId: newChunk.id,
          similarity: candidate.similarity,
          reason: 'High semantic similarity with different content',
        });
      }
    }
    
    return potentialContradictions;
  }
  
  private getReverseRelationshipType(type: RelationshipType): RelationshipType {
    const reverseMap: Record<RelationshipType, RelationshipType> = {
      [RelationshipType.LEADS_TO]: RelationshipType.DERIVED_FROM,
      [RelationshipType.DERIVED_FROM]: RelationshipType.LEADS_TO,
      [RelationshipType.SUPERSEDES]: RelationshipType.SUPERSEDES, // Inverse doesn't make sense
      [RelationshipType.PART_OF]: RelationshipType.PART_OF, // Inverse is "contains"
      // ... etc
      [RelationshipType.RELATES_TO]: RelationshipType.RELATES_TO,
      [RelationshipType.SIMILAR_TO]: RelationshipType.SIMILAR_TO,
      [RelationshipType.SOLVES]: RelationshipType.SOLVES,
      [RelationshipType.OCCURRED_BEFORE]: RelationshipType.OCCURRED_BEFORE,
      [RelationshipType.EVOLVED_INTO]: RelationshipType.DERIVED_FROM,
      [RelationshipType.CONTRADICTS]: RelationshipType.CONTRADICTS,
      [RelationshipType.INVALIDATED_BY]: RelationshipType.INVALIDATED_BY,
      [RelationshipType.PREFERS_OVER]: RelationshipType.PREFERS_OVER,
      [RelationshipType.DEPENDS_ON]: RelationshipType.DEPENDS_ON,
      [RelationshipType.IMPLEMENTS]: RelationshipType.EXEMPLIFIES,
      [RelationshipType.EXEMPLIFIES]: RelationshipType.IMPLEMENTS,
    };
    
    return reverseMap[type] ?? type;
  }
  
  private mightContradict(chunk1: EnhancedChunk, chunk2: any): boolean {
    // Simple heuristic - can be enhanced with LLM
    // If both are solutions/decisions and one is much newer, might supersede
    if (
      (chunk1.chunkType === ChunkType.SOLUTION || chunk1.chunkType === ChunkType.DECISION) &&
      (chunk2.chunkType === ChunkType.SOLUTION || chunk2.chunkType === ChunkType.DECISION)
    ) {
      const timeDiff = Math.abs(
        chunk1.createdAt.getTime() - new Date(chunk2.createdAt).getTime()
      );
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      
      return daysDiff > 7; // If more than a week apart, might conflict
    }
    
    return false;
  }
}

interface Contradiction {
  chunkId: string;
  type: 'contradiction' | 'invalidation';
  strength: number;
}

interface PotentialContradiction {
  existingChunkId: string;
  newChunkId: string;
  similarity: number;
  reason: string;
}
```

**Acceptance Criteria**:
- [ ] All 13 relationship types are supported
- [ ] Graph traversal respects depth limits
- [ ] Bidirectional relationships create two edges
- [ ] Contradiction detection identifies potential conflicts
- [ ] Traversal filters by relationship type and strength

---

## Phase 5: Hierarchical Memory (Categories/Summaries) {#phase-5-hierarchical-memory}

### Overview

Implement the 3-layer memory hierarchy: Resources → Items → Categories.

### Tasks

#### Task 5.1: Define Category Structure

**File**: `src/types/categories.ts` (new file)

```typescript
/**
 * Category for grouping related knowledge
 */
export interface Category {
  name: string;                    // Unique identifier (e.g., "authentication")
  displayName: string;             // Human-readable name
  description: string;             // What this category covers
  parentCategory?: string;         // For hierarchical categories
  
  // Evolving summary
  summary: string;                 // Markdown summary of all items in category
  summaryUpdatedAt: Date;
  
  // Statistics
  itemCount: number;
  lastItemAddedAt: Date;
  
  // Auto-generated tags for this category
  tags: string[];
}

export interface CategoryItem {
  chunkId: string;
  category: string;
  addedAt: Date;
  relevanceScore: number;         // How well it fits the category
}

/**
 * Predefined categories for common knowledge types
 */
export const DEFAULT_CATEGORIES: Partial<Category>[] = [
  {
    name: 'authentication',
    displayName: 'Authentication',
    description: 'Login, sessions, JWT, OAuth, security',
    tags: ['auth', 'security', 'login', 'jwt', 'oauth'],
  },
  {
    name: 'database',
    displayName: 'Database',
    description: 'Queries, migrations, models, relationships',
    tags: ['sql', 'database', 'query', 'migration', 'model'],
  },
  {
    name: 'api',
    displayName: 'API',
    description: 'REST, GraphQL, endpoints, requests, responses',
    tags: ['api', 'rest', 'graphql', 'endpoint', 'http'],
  },
  {
    name: 'testing',
    displayName: 'Testing',
    description: 'Unit tests, integration tests, mocking, fixtures',
    tags: ['test', 'testing', 'mock', 'fixture', 'assertion'],
  },
  {
    name: 'frontend',
    displayName: 'Frontend',
    description: 'UI components, styling, state management',
    tags: ['ui', 'component', 'style', 'css', 'state'],
  },
  {
    name: 'devops',
    displayName: 'DevOps',
    description: 'Deployment, CI/CD, Docker, infrastructure',
    tags: ['deploy', 'docker', 'ci', 'cd', 'infrastructure'],
  },
  {
    name: 'architecture',
    displayName: 'Architecture',
    description: 'Design patterns, system design, decisions',
    tags: ['pattern', 'architecture', 'design', 'structure'],
  },
  {
    name: 'performance',
    displayName: 'Performance',
    description: 'Optimisation, caching, profiling',
    tags: ['performance', 'optimisation', 'cache', 'speed'],
  },
  {
    name: 'debugging',
    displayName: 'Debugging',
    description: 'Error resolution, troubleshooting, fixes',
    tags: ['bug', 'error', 'fix', 'debug', 'issue'],
  },
  {
    name: 'standards',
    displayName: 'Standards',
    description: 'Coding standards, conventions, best practices',
    tags: ['standard', 'convention', 'practice', 'guideline'],
  },
];
```

---

#### Task 5.2: Implement Category Manager

**File**: `src/services/categoryManager.ts` (new file)

```typescript
/**
 * Manages category organisation and summary evolution
 */
export class CategoryManager {
  private metadataStore: MemoryMetadataStore;
  private llm: LLMService;
  
  constructor(metadataStore: MemoryMetadataStore, llm: LLMService) {
    this.metadataStore = metadataStore;
    this.llm = llm;
  }
  
  /**
   * Initialise default categories
   */
  async initialise(): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await this.metadataStore.getCategory(cat.name!);
      if (!existing) {
        await this.metadataStore.upsertCategory({
          ...cat,
          summary: '',
          summaryUpdatedAt: new Date(),
          itemCount: 0,
          lastItemAddedAt: new Date(),
        } as Category);
      }
    }
  }
  
  /**
   * Classify a chunk into categories
   */
  async classifyChunk(chunk: EnhancedChunk): Promise<CategoryClassification[]> {
    const categories = await this.metadataStore.listCategories();
    
    // Use LLM to classify
    const prompt = `
Classify this knowledge item into one or more categories.

## Item
${chunk.content}

## Available Categories
${categories.map(c => `- ${c.name}: ${c.description}`).join('\n')}

## Instructions
Return a JSON array of classifications:
[
  { "category": "category_name", "relevanceScore": 0.0-1.0, "reason": "why" },
  ...
]

Only include categories with relevanceScore > 0.5.
`;

    const response = await this.llm.invoke(prompt, { responseFormat: 'json' });
    return JSON.parse(response);
  }
  
  /**
   * Add a chunk to a category and update summary
   */
  async addToCategory(chunkId: string, categoryName: string, relevanceScore: number): Promise<void> {
    // Add to category_items table
    await this.metadataStore.addChunkToCategory(chunkId, categoryName, relevanceScore);
    
    // Update category statistics
    const category = await this.metadataStore.getCategory(categoryName);
    if (category) {
      await this.metadataStore.upsertCategory({
        ...category,
        itemCount: category.itemCount + 1,
        lastItemAddedAt: new Date(),
      });
    }
  }
  
  /**
   * Evolve a category's summary with new items
   */
  async evolveSummary(categoryName: string): Promise<void> {
    const category = await this.metadataStore.getCategory(categoryName);
    if (!category) return;
    
    // Get recent items in this category
    const recentItems = await this.metadataStore.getCategoryItems(categoryName, {
      limit: 20,
      since: category.summaryUpdatedAt,
    });
    
    if (recentItems.length === 0) return;
    
    // Get chunk content for new items
    const itemContents = await Promise.all(
      recentItems.map(item => this.metadataStore.getChunkContent(item.chunkId))
    );
    
    const prompt = `
You are a Memory Synchronisation Specialist.

## Category: ${category.displayName}
${category.description}

## Current Summary
${category.summary || 'No existing summary.'}

## New Items to Integrate
${itemContents.map((content, i) => `### Item ${i + 1}\n${content}`).join('\n\n')}

## Instructions
1. Update the summary to incorporate new information
2. If new items conflict with existing summary, update to reflect the latest state
3. Keep the summary concise but comprehensive
4. Use markdown formatting
5. Focus on actionable knowledge, patterns, and decisions

Return ONLY the updated summary markdown.
`;

    const newSummary = await this.llm.invoke(prompt);
    
    await this.metadataStore.upsertCategory({
      ...category,
      summary: newSummary,
      summaryUpdatedAt: new Date(),
    });
  }
  
  /**
   * Get category summary for retrieval
   */
  async getCategorySummary(categoryName: string): Promise<string | null> {
    const category = await this.metadataStore.getCategory(categoryName);
    return category?.summary ?? null;
  }
  
  /**
   * Determine which categories might answer a query
   */
  async selectRelevantCategories(query: string): Promise<string[]> {
    const categories = await this.metadataStore.listCategories();
    
    const prompt = `
Query: ${query}

Available Categories:
${categories.map(c => `- ${c.name}: ${c.description} (${c.itemCount} items)`).join('\n')}

Return a JSON array of category names most likely to contain the answer.
Only include categories that are clearly relevant.
`;

    const response = await this.llm.invoke(prompt, { responseFormat: 'json' });
    return JSON.parse(response);
  }
}

interface CategoryClassification {
  category: string;
  relevanceScore: number;
  reason: string;
}
```

**Acceptance Criteria**:
- [ ] Default categories are created on first run
- [ ] Chunks are classified with relevance scores
- [ ] Summaries evolve as new items are added
- [ ] Contradictions are handled (new info updates summary)
- [ ] Category selection uses LLM for relevance

---

## Phase 6: Background Maintenance Jobs {#phase-6-maintenance}

### Overview

Implement scheduled jobs for consolidation, summarisation, and cleanup.

### Tasks

#### Task 6.1: Implement Maintenance Scheduler

**File**: `src/services/maintenanceScheduler.ts` (new file)

```typescript
import * as cron from 'node-cron';

/**
 * Schedules and runs background maintenance jobs
 */
export class MaintenanceScheduler {
  private metadataStore: MemoryMetadataStore;
  private decayCalculator: DecayCalculator;
  private categoryManager: CategoryManager;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  
  constructor(
    metadataStore: MemoryMetadataStore,
    decayCalculator: DecayCalculator,
    categoryManager: CategoryManager
  ) {
    this.metadataStore = metadataStore;
    this.decayCalculator = decayCalculator;
    this.categoryManager = categoryManager;
  }
  
  /**
   * Start all scheduled jobs
   */
  start(): void {
    // Nightly consolidation - 3 AM
    this.jobs.set('nightly', cron.schedule('0 3 * * *', () => {
      this.runNightlyConsolidation().catch(console.error);
    }));
    
    // Weekly summarisation - Sunday 4 AM
    this.jobs.set('weekly', cron.schedule('0 4 * * 0', () => {
      this.runWeeklySummarisation().catch(console.error);
    }));
    
    // Monthly re-indexing - 1st of month, 5 AM
    this.jobs.set('monthly', cron.schedule('0 5 1 * *', () => {
      this.runMonthlyReindex().catch(console.error);
    }));
    
    // Hourly decay score update
    this.jobs.set('hourly', cron.schedule('0 * * * *', () => {
      this.decayCalculator.updateAllDecayScores(this.metadataStore).catch(console.error);
    }));
    
    console.log('Maintenance scheduler started');
  }
  
  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }
  
  /**
   * Run a specific job immediately (for testing/manual trigger)
   */
  async runJob(jobName: 'nightly' | 'weekly' | 'monthly'): Promise<void> {
    switch (jobName) {
      case 'nightly':
        await this.runNightlyConsolidation();
        break;
      case 'weekly':
        await this.runWeeklySummarisation();
        break;
      case 'monthly':
        await this.runMonthlyReindex();
        break;
    }
  }
  
  /**
   * Nightly: Consolidate duplicates, update decay scores, promote hot items
   */
  private async runNightlyConsolidation(): Promise<void> {
    console.log('Running nightly consolidation...');
    const startTime = Date.now();
    
    // 1. Update all decay scores
    const decayResult = await this.decayCalculator.updateAllDecayScores(this.metadataStore);
    console.log(`  Updated ${decayResult.updated} decay scores`);
    
    // 2. Find and merge duplicates
    const duplicates = await this.findDuplicates();
    for (const group of duplicates) {
      await this.mergeDuplicates(group);
    }
    console.log(`  Merged ${duplicates.length} duplicate groups`);
    
    // 3. Promote frequently accessed items
    const hotItems = await this.metadataStore.getHotItems(24); // Last 24 hours
    for (const item of hotItems) {
      await this.metadataStore.increaseImportance(item.chunkId, 0.05);
    }
    console.log(`  Promoted ${hotItems.length} hot items`);
    
    // 4. Archive stale items
    const archiveCandidates = await this.metadataStore.getArchiveCandidates(0.2);
    for (const chunk of archiveCandidates) {
      await this.metadataStore.archiveChunk(chunk.chunkId);
    }
    console.log(`  Archived ${archiveCandidates.length} stale items`);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Nightly consolidation completed in ${duration.toFixed(1)}s`);
  }
  
  /**
   * Weekly: Update category summaries, compress old items
   */
  private async runWeeklySummarisation(): Promise<void> {
    console.log('Running weekly summarisation...');
    const startTime = Date.now();
    
    // 1. Update all category summaries
    const categories = await this.metadataStore.listCategories();
    for (const category of categories) {
      await this.categoryManager.evolveSummary(category.name);
    }
    console.log(`  Updated ${categories.length} category summaries`);
    
    // 2. Compress old, rarely accessed items
    const oldItems = await this.metadataStore.getOldItems(30); // > 30 days
    for (const item of oldItems) {
      if (item.accessCount < 3) {
        // Could compress content or move to cold storage
        await this.metadataStore.markForCompression(item.chunkId);
      }
    }
    console.log(`  Marked items for compression`);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Weekly summarisation completed in ${duration.toFixed(1)}s`);
  }
  
  /**
   * Monthly: Re-index embeddings, rebuild graph edges, deep cleanup
   */
  private async runMonthlyReindex(): Promise<void> {
    console.log('Running monthly re-index...');
    const startTime = Date.now();
    
    // 1. Identify stale embeddings (from old embedding model)
    // This would be relevant if embedding model changes
    
    // 2. Re-weight graph edges based on actual usage
    const edgeStats = await this.metadataStore.getRelationshipUsageStats();
    for (const stat of edgeStats) {
      if (stat.timesTraversed === 0) {
        // Weaken unused edges
        await this.metadataStore.updateRelationshipStrength(
          stat.relationshipId,
          stat.strength * 0.8
        );
      } else {
        // Strengthen frequently used edges
        await this.metadataStore.updateRelationshipStrength(
          stat.relationshipId,
          Math.min(1.0, stat.strength * 1.1)
        );
      }
    }
    console.log(`  Re-weighted ${edgeStats.length} relationship edges`);
    
    // 3. Archive very old, never-accessed items
    const veryOld = await this.metadataStore.getOldItems(180); // > 6 months
    for (const item of veryOld) {
      if (item.accessCount === 0) {
        await this.metadataStore.archiveChunk(item.chunkId);
      }
    }
    console.log(`  Archived very old items`);
    
    // 4. Vacuum database
    await this.metadataStore.vacuum();
    console.log(`  Database vacuumed`);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Monthly re-index completed in ${duration.toFixed(1)}s`);
  }
  
  private async findDuplicates(): Promise<DuplicateGroup[]> {
    // Use vector similarity to find near-duplicates
    // Group chunks with > 0.95 similarity
    return [];
  }
  
  private async mergeDuplicates(group: DuplicateGroup): Promise<void> {
    // Keep the most recent/highest importance chunk
    // Merge metadata from others
    // Create SUPERSEDES relationships
    // Archive the duplicates
  }
}

interface DuplicateGroup {
  primaryChunkId: string;
  duplicateChunkIds: string[];
  similarity: number;
}
```

**Acceptance Criteria**:
- [ ] Jobs run on schedule (cron syntax works)
- [ ] Jobs can be triggered manually
- [ ] Nightly consolidation completes in < 5 minutes
- [ ] Weekly summarisation updates all categories
- [ ] Monthly re-index handles large databases
- [ ] All jobs have proper error handling and logging

---

#### Task 6.2: Add CLI Commands for Maintenance

**File**: `src/cli/maintenance.ts` (new file)

```typescript
/**
 * CLI commands for maintenance operations
 */
export function registerMaintenanceCommands(program: Command) {
  const maintenanceCommand = program
    .command('maintenance')
    .description('Memory system maintenance operations');
  
  // Run specific job
  maintenanceCommand
    .command('run <job>')
    .description('Run a maintenance job (nightly, weekly, monthly)')
    .action(async (job: string) => {
      const scheduler = getMaintenanceScheduler();
      
      if (!['nightly', 'weekly', 'monthly'].includes(job)) {
        console.error(`Unknown job: ${job}. Use: nightly, weekly, or monthly`);
        process.exit(1);
      }
      
      console.log(`Running ${job} maintenance...`);
      await scheduler.runJob(job as any);
      console.log('Done!');
    });
  
  // Start background scheduler
  maintenanceCommand
    .command('start')
    .description('Start the background maintenance scheduler')
    .action(async () => {
      const scheduler = getMaintenanceScheduler();
      scheduler.start();
      console.log('Maintenance scheduler running. Press Ctrl+C to stop.');
      
      // Keep process alive
      process.on('SIGINT', () => {
        scheduler.stop();
        process.exit(0);
      });
    });
  
  // Show statistics
  maintenanceCommand
    .command('stats')
    .description('Show memory system statistics')
    .action(async () => {
      const store = getMetadataStore();
      const stats = await store.getStats();
      
      console.log('\n📊 Memory System Statistics\n');
      console.log(`Total chunks: ${stats.totalChunks}`);
      console.log(`Active chunks: ${stats.activeChunks}`);
      console.log(`Archived chunks: ${stats.archivedChunks}`);
      console.log(`Categories: ${stats.categoryCount}`);
      console.log(`Relationships: ${stats.relationshipCount}`);
      console.log(`\nBy type:`);
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`  ${type}: ${count}`);
      }
      console.log(`\nDecay distribution:`);
      console.log(`  High (>0.7): ${stats.decayDistribution.high}`);
      console.log(`  Medium (0.3-0.7): ${stats.decayDistribution.medium}`);
      console.log(`  Low (<0.3): ${stats.decayDistribution.low}`);
    });
  
  // Cleanup
  maintenanceCommand
    .command('cleanup')
    .description('Remove archived items and compact database')
    .option('--dry-run', 'Show what would be removed without removing')
    .option('--older-than <days>', 'Only remove items archived more than N days ago', parseInt)
    .action(async (options) => {
      const store = getMetadataStore();
      
      const candidates = await store.getCleanupCandidates({
        olderThan: options.olderThan ?? 30,
      });
      
      console.log(`Found ${candidates.length} items to clean up`);
      
      if (options.dryRun) {
        for (const item of candidates.slice(0, 20)) {
          console.log(`  - ${item.chunkId} (archived ${item.archivedAt})`);
        }
        if (candidates.length > 20) {
          console.log(`  ... and ${candidates.length - 20} more`);
        }
        return;
      }
      
      await store.cleanupArchived(candidates.map(c => c.chunkId));
      await store.vacuum();
      console.log('Cleanup complete!');
    });
}
```

**Acceptance Criteria**:
- [ ] `cursor-rag maintenance run nightly` works
- [ ] `cursor-rag maintenance start` runs in background
- [ ] `cursor-rag maintenance stats` shows useful metrics
- [ ] `cursor-rag maintenance cleanup` safely removes old data
- [ ] Dry run mode prevents accidental data loss

---

## Phase 7: Enhanced Retrieval Scoring {#phase-7-retrieval}

### Overview

Implement hybrid scoring that combines vector similarity with temporal decay, importance, and graph relationships.

### Tasks

#### Task 7.1: Implement Hybrid Scorer

**File**: `src/services/hybridScorer.ts` (new file)

```typescript
/**
 * Combines multiple signals for final retrieval ranking
 */
export class HybridScorer {
  private config: ScoringConfig;
  private graph: RelationshipGraph;
  
  constructor(graph: RelationshipGraph, config?: Partial<ScoringConfig>) {
    this.graph = graph;
    this.config = {
      weights: {
        similarity: 0.35,
        decay: 0.20,
        importance: 0.15,
        recency: 0.10,
        graphBoost: 0.10,
        typeBoost: 0.10,
      },
      typeBoosts: {
        [ChunkType.SOLUTION]: 1.2,
        [ChunkType.PATTERN]: 1.15,
        [ChunkType.DECISION]: 1.1,
        [ChunkType.STANDARD]: 1.05,
        [ChunkType.DOCUMENTATION]: 1.0,
        [ChunkType.CODE]: 1.0,
        [ChunkType.PREFERENCE]: 0.9,
        [ChunkType.CATEGORY_SUMMARY]: 1.3, // Summaries are very useful
      },
      ...config,
    };
  }
  
  /**
   * Score and rank search results
   */
  async scoreResults(
    results: SearchResult[],
    query: string,
    context?: ScoringContext
  ): Promise<ScoredResult[]> {
    const scored: ScoredResult[] = [];
    
    // Get graph context if we have seed chunks
    const graphContext = context?.seedChunkIds
      ? await this.getGraphContext(context.seedChunkIds)
      : new Map<string, number>();
    
    for (const result of results) {
      const scores = {
        similarity: result.score,
        decay: result.metadata.decayScore,
        importance: result.metadata.importance,
        recency: this.calculateRecencyScore(result.metadata.lastAccessedAt),
        graphBoost: graphContext.get(result.id) ?? 0,
        typeBoost: this.config.typeBoosts[result.metadata.chunkType] ?? 1.0,
      };
      
      const finalScore = this.calculateFinalScore(scores);
      
      scored.push({
        ...result,
        scores,
        finalScore,
      });
    }
    
    // Sort by final score
    scored.sort((a, b) => b.finalScore - a.finalScore);
    
    return scored;
  }
  
  /**
   * Tiered retrieval: summaries first, then items if needed
   */
  async tieredRetrieval(
    query: string,
    vectorStore: EnhancedVectorStore,
    categoryManager: CategoryManager
  ): Promise<TieredResult> {
    // Stage 1: Select relevant categories
    const relevantCategories = await categoryManager.selectRelevantCategories(query);
    
    // Stage 2: Get category summaries
    const summaries: CategorySummary[] = [];
    for (const catName of relevantCategories) {
      const summary = await categoryManager.getCategorySummary(catName);
      if (summary) {
        summaries.push({ category: catName, summary });
      }
    }
    
    // Stage 3: Check if summaries are sufficient
    const sufficientFromSummaries = await this.checkSufficiency(query, summaries);
    
    if (sufficientFromSummaries.sufficient) {
      return {
        tier: 'summary',
        results: summaries,
        message: 'Answered from category summaries',
      };
    }
    
    // Stage 4: Drill down into specific items
    const items = await vectorStore.search(query, {
      topK: 10,
      chunkTypes: [ChunkType.SOLUTION, ChunkType.PATTERN, ChunkType.DECISION],
      filter: {
        category: { $in: relevantCategories },
      },
    });
    
    const scored = await this.scoreResults(items, query);
    
    return {
      tier: 'item',
      results: scored,
      categorySummaries: summaries,
      message: 'Retrieved specific items',
    };
  }
  
  private calculateFinalScore(scores: ScoreComponents): number {
    const w = this.config.weights;
    
    return (
      scores.similarity * w.similarity +
      scores.decay * w.decay +
      scores.importance * w.importance +
      scores.recency * w.recency +
      scores.graphBoost * w.graphBoost +
      (scores.typeBoost - 1.0) * w.typeBoost // Normalise type boost around 0
    );
  }
  
  private calculateRecencyScore(lastAccessed: Date | null): number {
    if (!lastAccessed) return 0;
    
    const daysSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    return 1.0 / (1.0 + (daysSinceAccess / 7)); // 7-day half-life
  }
  
  private async getGraphContext(seedChunkIds: string[]): Promise<Map<string, number>> {
    const boost = new Map<string, number>();
    
    for (const seedId of seedChunkIds) {
      const related = await this.graph.traverse(seedId, {
        maxDepth: 2,
        minStrength: 0.3,
      });
      
      for (const node of related) {
        const existingBoost = boost.get(node.chunkId) ?? 0;
        // Boost decreases with depth
        const depthFactor = 1.0 / (1.0 + node.depth);
        const newBoost = node.strength * depthFactor;
        boost.set(node.chunkId, Math.max(existingBoost, newBoost));
      }
    }
    
    return boost;
  }
  
  private async checkSufficiency(
    query: string,
    summaries: CategorySummary[]
  ): Promise<{ sufficient: boolean; reason: string }> {
    // Use LLM to determine if summaries answer the query
    // For now, simple heuristic: if summaries exist and query is general
    
    if (summaries.length === 0) {
      return { sufficient: false, reason: 'No relevant summaries' };
    }
    
    // Could use LLM here for sophisticated check
    const queryLower = query.toLowerCase();
    const isSpecific = queryLower.includes('how') || 
                       queryLower.includes('error') ||
                       queryLower.includes('fix') ||
                       queryLower.includes('specific');
    
    if (isSpecific) {
      return { sufficient: false, reason: 'Query requires specific details' };
    }
    
    return { sufficient: true, reason: 'Summaries appear sufficient' };
  }
}

interface ScoringConfig {
  weights: {
    similarity: number;
    decay: number;
    importance: number;
    recency: number;
    graphBoost: number;
    typeBoost: number;
  };
  typeBoosts: Record<ChunkType, number>;
}

interface ScoringContext {
  seedChunkIds?: string[];       // Chunks to boost related items
  preferredTypes?: ChunkType[];  // Boost certain types
  project?: string;              // Boost project-specific items
}

interface ScoreComponents {
  similarity: number;
  decay: number;
  importance: number;
  recency: number;
  graphBoost: number;
  typeBoost: number;
}

interface ScoredResult extends SearchResult {
  scores: ScoreComponents;
  finalScore: number;
}

interface TieredResult {
  tier: 'summary' | 'item';
  results: any[];
  categorySummaries?: CategorySummary[];
  message: string;
}

interface CategorySummary {
  category: string;
  summary: string;
}
```

**Acceptance Criteria**:
- [ ] Final scores combine all components correctly
- [ ] Graph boost increases scores for related items
- [ ] Type boost favours solutions and patterns
- [ ] Tiered retrieval tries summaries first
- [ ] Recency boost favours recently accessed items

---

## Phase 8: RLM-Style Recursive Retrieval {#phase-8-rlm-retrieval}

### Overview

Implement Recursive Language Model patterns for handling queries that require processing large amounts of context. Based on the RLM paper findings, this phase treats retrieved context as environment variables that the LLM can programmatically interact with, decompose, and recursively process.

### Key Concepts from RLM Research

1. **Context as Environment Variable**: Instead of stuffing all retrieved chunks into the prompt, load them as variables the model can selectively examine
2. **Programmatic Filtering**: Allow the model to filter context using code (regex, keyword searches) before semantic analysis
3. **Recursive Sub-calls**: Enable the model to invoke itself on smaller chunks when processing information-dense content
4. **Variable-based Answer Building**: Build up answers in variables across multiple iterations
5. **Cost Budgets**: Prevent runaway costs with explicit budgets and early termination

### Tasks

#### Task 8.1: Implement Context Environment

**File**: `src/services/contextEnvironment.ts` (new file)

Create a sandboxed environment where retrieved context is stored as variables:

```typescript
/**
 * Context Environment for RLM-style retrieval
 * 
 * Treats retrieved context as environment variables that can be
 * programmatically examined, filtered, and decomposed.
 */
export class ContextEnvironment {
  private variables: Map<string, ContextVariable> = new Map();
  private executionLog: ExecutionStep[] = [];
  private costTracker: CostTracker;
  private config: EnvironmentConfig;
  
  constructor(config?: Partial<EnvironmentConfig>) {
    this.config = {
      maxIterations: 20,
      maxSubCalls: 50,
      costBudget: 1.0,  // USD
      timeoutMs: 120000, // 2 minutes
      enableAsyncSubCalls: true,
      ...config,
    };
    this.costTracker = new CostTracker(this.config.costBudget);
  }
  
  /**
   * Load context chunks as environment variables
   */
  loadContext(chunks: EnhancedChunk[], variableName: string = 'context'): void {
    const contextVar: ContextVariable = {
      name: variableName,
      type: 'chunks',
      value: chunks,
      metadata: {
        totalLength: chunks.reduce((sum, c) => sum + c.content.length, 0),
        chunkCount: chunks.length,
        chunkLengths: chunks.map(c => c.content.length),
      },
    };
    
    this.variables.set(variableName, contextVar);
    
    this.log({
      type: 'load_context',
      variableName,
      metadata: contextVar.metadata,
    });
  }
  
  /**
   * Get environment state description for LLM
   * (Tells the model what's available without showing all content)
   */
  getStateDescription(): string {
    const vars = Array.from(this.variables.entries()).map(([name, v]) => {
      if (v.type === 'chunks') {
        return `- \`${name}\`: ${v.metadata.chunkCount} chunks, ${v.metadata.totalLength} total chars`;
      }
      return `- \`${name}\`: ${typeof v.value}`;
    });
    
    return `## Environment State
Variables:
${vars.join('\n')}

Available operations:
- \`peek(varName, start?, end?)\` - View portion of a variable
- \`filter(varName, pattern)\` - Filter chunks by regex pattern
- \`chunk(varName, size)\` - Split into smaller chunks
- \`subQuery(query, context)\` - Invoke sub-LLM on context
- \`store(varName, value)\` - Store intermediate result
- \`getAnswer()\` - Return final answer from environment

Remaining budget: $${this.costTracker.remaining.toFixed(2)}
Iterations: ${this.executionLog.filter(s => s.type === 'iteration').length}/${this.config.maxIterations}
Sub-calls: ${this.executionLog.filter(s => s.type === 'sub_call').length}/${this.config.maxSubCalls}
`;
  }
  
  /**
   * Peek at portion of context (without loading full content into LLM)
   */
  peek(variableName: string, start?: number, end?: number): string {
    const variable = this.variables.get(variableName);
    if (!variable) return `Error: Variable '${variableName}' not found`;
    
    if (variable.type === 'chunks') {
      const chunks = variable.value as EnhancedChunk[];
      const selected = chunks.slice(start ?? 0, end ?? 3);
      return selected.map((c, i) => 
        `[Chunk ${(start ?? 0) + i}] (${c.content.length} chars):\n${c.content.substring(0, 500)}${c.content.length > 500 ? '...' : ''}`
      ).join('\n\n');
    }
    
    return String(variable.value).substring(start ?? 0, end ?? 1000);
  }
  
  /**
   * Filter chunks by regex pattern
   */
  filter(variableName: string, pattern: string): EnhancedChunk[] {
    const variable = this.variables.get(variableName);
    if (!variable || variable.type !== 'chunks') return [];
    
    const regex = new RegExp(pattern, 'i');
    const chunks = variable.value as EnhancedChunk[];
    const filtered = chunks.filter(c => regex.test(c.content));
    
    this.log({
      type: 'filter',
      variableName,
      pattern,
      resultCount: filtered.length,
    });
    
    return filtered;
  }
  
  /**
   * Split variable into smaller chunks for processing
   */
  chunk(variableName: string, size: number): EnhancedChunk[][] {
    const variable = this.variables.get(variableName);
    if (!variable || variable.type !== 'chunks') return [];
    
    const chunks = variable.value as EnhancedChunk[];
    const batches: EnhancedChunk[][] = [];
    
    for (let i = 0; i < chunks.length; i += size) {
      batches.push(chunks.slice(i, i + size));
    }
    
    this.log({
      type: 'chunk',
      variableName,
      size,
      batchCount: batches.length,
    });
    
    return batches;
  }
  
  /**
   * Execute a sub-LLM call on context
   * Implements async sub-calls as recommended by RLM paper
   */
  async subQuery(
    llm: LLMService,
    query: string,
    context: string | EnhancedChunk[],
    options?: SubQueryOptions
  ): Promise<string> {
    // Check budget before calling
    if (!this.costTracker.canAfford(options?.estimatedCost ?? 0.01)) {
      throw new BudgetExceededError('Cost budget exceeded');
    }
    
    const subCallCount = this.executionLog.filter(s => s.type === 'sub_call').length;
    if (subCallCount >= this.config.maxSubCalls) {
      throw new LimitExceededError('Maximum sub-calls exceeded');
    }
    
    const contextStr = Array.isArray(context)
      ? context.map(c => c.content).join('\n\n---\n\n')
      : context;
    
    const startTime = Date.now();
    
    const response = await llm.invoke(
      `${query}\n\nContext:\n${contextStr}`,
      {
        maxTokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.3,
      }
    );
    
    const cost = this.estimateCost(contextStr.length, response.length);
    this.costTracker.record(cost);
    
    this.log({
      type: 'sub_call',
      query: query.substring(0, 100),
      contextLength: contextStr.length,
      responseLength: response.length,
      cost,
      durationMs: Date.now() - startTime,
    });
    
    return response;
  }
  
  /**
   * Batch sub-queries with async execution (RLM paper recommendation)
   */
  async batchSubQuery(
    llm: LLMService,
    queries: Array<{ query: string; context: string | EnhancedChunk[] }>
  ): Promise<string[]> {
    if (!this.config.enableAsyncSubCalls) {
      // Sequential fallback
      const results: string[] = [];
      for (const q of queries) {
        results.push(await this.subQuery(llm, q.query, q.context));
      }
      return results;
    }
    
    // Parallel execution with concurrency limit
    const CONCURRENCY = 5;
    const results: string[] = new Array(queries.length);
    
    for (let i = 0; i < queries.length; i += CONCURRENCY) {
      const batch = queries.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((q, j) => 
          this.subQuery(llm, q.query, q.context)
            .then(r => ({ index: i + j, result: r }))
        )
      );
      
      for (const { index, result } of batchResults) {
        results[index] = result;
      }
    }
    
    return results;
  }
  
  /**
   * Store intermediate result
   */
  store(variableName: string, value: any): void {
    this.variables.set(variableName, {
      name: variableName,
      type: typeof value === 'object' ? 'object' : 'primitive',
      value,
      metadata: {},
    });
    
    this.log({
      type: 'store',
      variableName,
      valueType: typeof value,
    });
  }
  
  /**
   * Check if we should terminate
   */
  shouldTerminate(): { terminate: boolean; reason?: string } {
    if (this.costTracker.exceeded) {
      return { terminate: true, reason: 'Cost budget exceeded' };
    }
    
    const iterations = this.executionLog.filter(s => s.type === 'iteration').length;
    if (iterations >= this.config.maxIterations) {
      return { terminate: true, reason: 'Maximum iterations reached' };
    }
    
    const subCalls = this.executionLog.filter(s => s.type === 'sub_call').length;
    if (subCalls >= this.config.maxSubCalls) {
      return { terminate: true, reason: 'Maximum sub-calls reached' };
    }
    
    return { terminate: false };
  }
  
  private log(step: Omit<ExecutionStep, 'timestamp'>): void {
    this.executionLog.push({
      ...step,
      timestamp: new Date(),
    });
  }
  
  private estimateCost(inputChars: number, outputChars: number): number {
    // Rough estimate: $0.01 per 1000 chars input, $0.03 per 1000 chars output
    return (inputChars / 1000) * 0.01 + (outputChars / 1000) * 0.03;
  }
  
  getExecutionLog(): ExecutionStep[] {
    return [...this.executionLog];
  }
  
  getTotalCost(): number {
    return this.costTracker.total;
  }
}

interface ContextVariable {
  name: string;
  type: 'chunks' | 'primitive' | 'object';
  value: any;
  metadata: Record<string, any>;
}

interface ExecutionStep {
  type: 'load_context' | 'iteration' | 'filter' | 'chunk' | 'sub_call' | 'store';
  timestamp: Date;
  [key: string]: any;
}

interface EnvironmentConfig {
  maxIterations: number;
  maxSubCalls: number;
  costBudget: number;
  timeoutMs: number;
  enableAsyncSubCalls: boolean;
}

interface SubQueryOptions {
  maxTokens?: number;
  temperature?: number;
  estimatedCost?: number;
}

class CostTracker {
  total = 0;
  constructor(private budget: number) {}
  
  get remaining(): number { return this.budget - this.total; }
  get exceeded(): boolean { return this.total >= this.budget; }
  
  canAfford(amount: number): boolean {
    return this.total + amount <= this.budget;
  }
  
  record(amount: number): void {
    this.total += amount;
  }
}

class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitExceededError';
  }
}
```

**Acceptance Criteria**:
- [ ] Context can be loaded as environment variables
- [ ] State description gives LLM overview without full content
- [ ] Peek allows selective viewing
- [ ] Filter supports regex patterns
- [ ] Sub-queries track cost and enforce budget
- [ ] Async batch queries work with concurrency limit
- [ ] Termination conditions are enforced

---

#### Task 8.2: Implement Recursive Retrieval Controller

**File**: `src/services/recursiveRetrieval.ts` (new file)

Orchestrate the iterative retrieval loop:

```typescript
/**
 * Recursive Retrieval Controller
 * 
 * Implements RLM-style iterative retrieval where the model can
 * examine, filter, and recursively process context.
 */
export class RecursiveRetrievalController {
  private vectorStore: EnhancedVectorStore;
  private llm: LLMService;
  private subLlm: LLMService;  // Smaller/cheaper model for sub-calls
  private config: RetrievalConfig;
  
  constructor(
    vectorStore: EnhancedVectorStore,
    llm: LLMService,
    subLlm?: LLMService,
    config?: Partial<RetrievalConfig>
  ) {
    this.vectorStore = vectorStore;
    this.llm = llm;
    this.subLlm = subLlm ?? llm;
    this.config = {
      initialRetrievalK: 20,
      maxIterations: 10,
      enableRecursiveSubCalls: true,
      costBudget: 0.50,
      ...config,
    };
  }
  
  /**
   * Execute recursive retrieval for a query
   */
  async retrieve(query: string, options?: RetrieveOptions): Promise<RetrievalResult> {
    // Step 1: Initial retrieval
    const initialChunks = await this.vectorStore.search(query, {
      topK: this.config.initialRetrievalK,
      ...options?.searchOptions,
    });
    
    // Step 2: Assess complexity - do we need recursive processing?
    const complexity = await this.assessComplexity(query, initialChunks);
    
    if (complexity === 'simple') {
      // Simple query - return initial results
      return {
        chunks: initialChunks,
        strategy: 'direct',
        iterations: 1,
        cost: 0,
      };
    }
    
    // Step 3: Complex query - use RLM-style processing
    const env = new ContextEnvironment({
      maxIterations: this.config.maxIterations,
      costBudget: this.config.costBudget,
    });
    
    env.loadContext(initialChunks);
    
    return await this.iterativeProcess(query, env);
  }
  
  /**
   * Assess query complexity to decide strategy
   * (RLM paper: "more complex problems exhibit degradation at shorter lengths")
   */
  private async assessComplexity(
    query: string,
    chunks: EnhancedChunk[]
  ): Promise<'simple' | 'moderate' | 'complex'> {
    // Heuristics based on RLM paper findings
    const totalContext = chunks.reduce((sum, c) => sum + c.content.length, 0);
    
    // If context fits comfortably, might be simple
    if (totalContext < 50000) {
      // Check if query requires aggregation or multi-hop reasoning
      const aggregationKeywords = /how many|count|list all|compare|summarize|aggregate/i;
      const multiHopKeywords = /because|therefore|which.*then|after.*when/i;
      
      if (aggregationKeywords.test(query) || multiHopKeywords.test(query)) {
        return 'moderate';
      }
      return 'simple';
    }
    
    // Large context or complex query
    if (totalContext > 200000) {
      return 'complex';
    }
    
    return 'moderate';
  }
  
  /**
   * Iterative RLM-style processing
   */
  private async iterativeProcess(
    query: string,
    env: ContextEnvironment
  ): Promise<RetrievalResult> {
    let iteration = 0;
    let answer: string | null = null;
    
    while (iteration < this.config.maxIterations) {
      iteration++;
      
      // Check termination conditions
      const { terminate, reason } = env.shouldTerminate();
      if (terminate) {
        console.log(`Terminating: ${reason}`);
        break;
      }
      
      // Get next action from LLM
      const action = await this.getNextAction(query, env, iteration);
      
      if (action.type === 'answer') {
        answer = action.value;
        break;
      }
      
      // Execute the action
      await this.executeAction(action, env);
    }
    
    // Collect final results
    const relevantChunks = this.collectRelevantChunks(env);
    
    return {
      chunks: relevantChunks,
      strategy: 'recursive',
      iterations: iteration,
      cost: env.getTotalCost(),
      answer,
      executionLog: env.getExecutionLog(),
    };
  }
  
  /**
   * Ask LLM what to do next
   */
  private async getNextAction(
    query: string,
    env: ContextEnvironment,
    iteration: number
  ): Promise<RetrievalAction> {
    const prompt = `You are processing a query using a context environment. Your goal is to find relevant information efficiently.

## Query
${query}

${env.getStateDescription()}

## Iteration ${iteration}

Based on the query and current state, decide your next action. You can:

1. **peek** - Look at specific chunks to understand content
2. **filter** - Filter chunks by keyword/pattern to narrow down
3. **chunk** - Split context into batches for parallel processing
4. **subQuery** - Ask a question about a subset of context
5. **store** - Store intermediate findings
6. **answer** - Provide final answer if you have enough information

Respond with a JSON action:
\`\`\`json
{
  "type": "peek|filter|chunk|subQuery|store|answer",
  "params": { ... },
  "reasoning": "why this action"
}
\`\`\`

Be efficient - don't examine everything if you can filter first. Use subQuery for semantic understanding.`;

    const response = await this.llm.invoke(prompt, {
      maxTokens: 1000,
      temperature: 0.2,
    });
    
    return this.parseAction(response);
  }
  
  /**
   * Execute a retrieval action
   */
  private async executeAction(action: RetrievalAction, env: ContextEnvironment): Promise<void> {
    switch (action.type) {
      case 'peek':
        const peekResult = env.peek(
          action.params.variable ?? 'context',
          action.params.start,
          action.params.end
        );
        env.store('_lastPeek', peekResult);
        break;
        
      case 'filter':
        const filtered = env.filter(
          action.params.variable ?? 'context',
          action.params.pattern
        );
        env.store(action.params.outputVariable ?? 'filtered', filtered);
        break;
        
      case 'chunk':
        const batches = env.chunk(
          action.params.variable ?? 'context',
          action.params.size ?? 5
        );
        env.store(action.params.outputVariable ?? 'batches', batches);
        break;
        
      case 'subQuery':
        if (this.config.enableRecursiveSubCalls && action.params.batch) {
          // Batch sub-queries for efficiency
          const batchQueries = action.params.contexts.map((ctx: any) => ({
            query: action.params.query,
            context: ctx,
          }));
          const results = await env.batchSubQuery(this.subLlm, batchQueries);
          env.store(action.params.outputVariable ?? 'subResults', results);
        } else {
          const result = await env.subQuery(
            this.subLlm,
            action.params.query,
            action.params.context
          );
          env.store(action.params.outputVariable ?? 'subResult', result);
        }
        break;
        
      case 'store':
        env.store(action.params.variable, action.params.value);
        break;
    }
  }
  
  private parseAction(response: string): RetrievalAction {
    // Extract JSON from response
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Fall through to default
      }
    }
    
    // Try parsing entire response as JSON
    try {
      return JSON.parse(response);
    } catch {
      // Default to answer if parsing fails
      return { type: 'answer', params: { value: response }, reasoning: 'Parse failed' };
    }
  }
  
  private collectRelevantChunks(env: ContextEnvironment): EnhancedChunk[] {
    // Collect chunks that were accessed/filtered during processing
    const log = env.getExecutionLog();
    const accessedChunkIds = new Set<string>();
    
    // Implementation would track which chunks were actually used
    // For now, return the filtered/relevant set
    return [];
  }
}

interface RetrievalConfig {
  initialRetrievalK: number;
  maxIterations: number;
  enableRecursiveSubCalls: boolean;
  costBudget: number;
}

interface RetrieveOptions {
  searchOptions?: EnhancedSearchOptions;
}

interface RetrievalAction {
  type: 'peek' | 'filter' | 'chunk' | 'subQuery' | 'store' | 'answer';
  params: Record<string, any>;
  reasoning?: string;
}

interface RetrievalResult {
  chunks: EnhancedChunk[];
  strategy: 'direct' | 'recursive';
  iterations: number;
  cost: number;
  answer?: string | null;
  executionLog?: ExecutionStep[];
}
```

**Acceptance Criteria**:
- [ ] Simple queries use direct retrieval
- [ ] Complex queries trigger recursive processing
- [ ] Actions are parsed and executed correctly
- [ ] Cost is tracked across iterations
- [ ] Termination conditions are enforced
- [ ] Batch sub-queries use async execution

---

#### Task 8.3: Implement Smart Chunking Strategies

**File**: `src/services/smartChunker.ts` (new file)

Implement intelligent chunking based on RLM paper patterns:

```typescript
/**
 * Smart Chunking Strategies
 * 
 * Based on RLM paper observations about how models chunk context:
 * - Uniform chunking by size
 * - Semantic chunking by topic
 * - Keyword-based chunking
 * - Structural chunking (by file, section, etc.)
 */
export class SmartChunker {
  private llm: LLMService;
  
  constructor(llm: LLMService) {
    this.llm = llm;
  }
  
  /**
   * Uniform chunking - split by count
   */
  uniformChunk<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * Character-based chunking with overlap
   */
  charChunk(text: string, chunkSize: number, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start = end - overlap;
      if (start < 0) start = 0;
    }
    
    return chunks;
  }
  
  /**
   * Semantic chunking - group by topic similarity
   * (RLM pattern: models benefit from semantically coherent chunks)
   */
  async semanticChunk(
    chunks: EnhancedChunk[],
    targetGroups: number
  ): Promise<EnhancedChunk[][]> {
    // Use embeddings to cluster
    const embeddings = chunks.map(c => c.embedding);
    const clusters = this.kMeansClustering(embeddings, targetGroups);
    
    const groups: EnhancedChunk[][] = Array.from(
      { length: targetGroups },
      () => []
    );
    
    clusters.forEach((clusterIdx, chunkIdx) => {
      groups[clusterIdx].push(chunks[chunkIdx]);
    });
    
    return groups.filter(g => g.length > 0);
  }
  
  /**
   * Keyword-based chunking - group by shared keywords
   * (RLM pattern: filter by regex, then process matching chunks together)
   */
  keywordChunk(
    chunks: EnhancedChunk[],
    keywords: string[]
  ): Map<string, EnhancedChunk[]> {
    const groups = new Map<string, EnhancedChunk[]>();
    
    for (const keyword of keywords) {
      const pattern = new RegExp(keyword, 'i');
      const matching = chunks.filter(c => pattern.test(c.content));
      if (matching.length > 0) {
        groups.set(keyword, matching);
      }
    }
    
    // Add unmatched chunks to 'other'
    const matched = new Set(
      Array.from(groups.values()).flatMap(g => g.map(c => c.id))
    );
    const unmatched = chunks.filter(c => !matched.has(c.id));
    if (unmatched.length > 0) {
      groups.set('_other', unmatched);
    }
    
    return groups;
  }
  
  /**
   * Structural chunking - group by source file or section
   */
  structuralChunk(chunks: EnhancedChunk[]): Map<string, EnhancedChunk[]> {
    const groups = new Map<string, EnhancedChunk[]>();
    
    for (const chunk of chunks) {
      const source = chunk.source || '_unknown';
      if (!groups.has(source)) {
        groups.set(source, []);
      }
      groups.get(source)!.push(chunk);
    }
    
    return groups;
  }
  
  /**
   * Adaptive chunking - choose strategy based on content
   */
  async adaptiveChunk(
    chunks: EnhancedChunk[],
    query: string
  ): Promise<ChunkingResult> {
    // Analyze content and query to choose strategy
    const hasCodeContent = chunks.some(c => 
      c.chunkType === ChunkType.CODE || /```[\s\S]*```/.test(c.content)
    );
    
    const hasStructuredSources = new Set(chunks.map(c => c.source)).size > 1;
    
    const queryNeedsAggregation = /how many|count|list|all|every/i.test(query);
    
    if (hasCodeContent && hasStructuredSources) {
      // Code from multiple files - use structural chunking
      return {
        strategy: 'structural',
        groups: this.structuralChunk(chunks),
      };
    }
    
    if (queryNeedsAggregation) {
      // Aggregation query - uniform chunks for parallel processing
      return {
        strategy: 'uniform',
        groups: new Map([
          ['batch', this.uniformChunk(chunks, 10).map(batch => batch)],
        ].flatMap(([k, batches]) => 
          batches.map((b, i) => [`${k}_${i}`, b] as [string, EnhancedChunk[]])
        )),
      };
    }
    
    // Default to semantic chunking
    const semanticGroups = await this.semanticChunk(chunks, 5);
    return {
      strategy: 'semantic',
      groups: new Map(semanticGroups.map((g, i) => [`topic_${i}`, g])),
    };
  }
  
  /**
   * Simple k-means clustering for semantic grouping
   */
  private kMeansClustering(
    embeddings: number[][],
    k: number,
    maxIterations: number = 50
  ): number[] {
    if (embeddings.length === 0) return [];
    if (embeddings.length <= k) {
      return embeddings.map((_, i) => i);
    }
    
    const dim = embeddings[0].length;
    
    // Initialize centroids randomly
    const centroids: number[][] = [];
    const indices = new Set<number>();
    while (centroids.length < k) {
      const idx = Math.floor(Math.random() * embeddings.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        centroids.push([...embeddings[idx]]);
      }
    }
    
    let assignments = new Array(embeddings.length).fill(0);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign points to nearest centroid
      const newAssignments = embeddings.map(emb => {
        let minDist = Infinity;
        let closest = 0;
        for (let c = 0; c < centroids.length; c++) {
          const dist = this.euclideanDistance(emb, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            closest = c;
          }
        }
        return closest;
      });
      
      // Check convergence
      if (newAssignments.every((a, i) => a === assignments[i])) {
        break;
      }
      assignments = newAssignments;
      
      // Update centroids
      for (let c = 0; c < k; c++) {
        const members = embeddings.filter((_, i) => assignments[i] === c);
        if (members.length > 0) {
          for (let d = 0; d < dim; d++) {
            centroids[c][d] = members.reduce((sum, m) => sum + m[d], 0) / members.length;
          }
        }
      }
    }
    
    return assignments;
  }
  
  private euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
  }
}

interface ChunkingResult {
  strategy: 'uniform' | 'semantic' | 'keyword' | 'structural';
  groups: Map<string, EnhancedChunk[]>;
}
```

**Acceptance Criteria**:
- [ ] Uniform chunking works correctly
- [ ] Semantic chunking groups similar content
- [ ] Keyword chunking filters by patterns
- [ ] Structural chunking groups by source
- [ ] Adaptive chunking chooses appropriate strategy

---

## MCP Tool Definitions {#mcp-tools}

### New Tools to Add

```typescript
/**
 * New MCP tools for memory features
 */
export const MEMORY_TOOLS: Tool[] = [
  {
    name: 'search_past_solutions',
    description: 'Search for solutions from previous development sessions and Cursor chats',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Description of the problem or error',
        },
        errorMessage: {
          type: 'string',
          description: 'Specific error message if applicable',
        },
        project: {
          type: 'string',
          description: 'Filter to a specific project',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_similar_issues',
    description: 'Find past issues similar to the current problem',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Current context or code snippet',
        },
        errorMessage: {
          type: 'string',
          description: 'Error message if any',
        },
      },
      required: ['context'],
    },
  },
  {
    name: 'get_project_patterns',
    description: 'Get established patterns and standards for this project',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project name',
        },
        category: {
          type: 'string',
          description: 'Category filter (e.g., authentication, database)',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'recall_decision',
    description: 'Recall why a technical decision was made',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'What the decision was about',
        },
        project: {
          type: 'string',
          description: 'Project context',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_category_summary',
    description: 'Get a high-level summary for a knowledge category',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name (e.g., authentication, testing)',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'ingest_chat_history',
    description: 'Manually trigger chat history ingestion',
    inputSchema: {
      type: 'object',
      properties: {
        since: {
          type: 'string',
          description: 'Only ingest chats since this date (ISO format)',
        },
        hasCode: {
          type: 'boolean',
          description: 'Only ingest chats with code blocks',
        },
      },
    },
  },
  {
    name: 'memory_stats',
    description: 'Get statistics about the memory system',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
```

---

## Configuration Schema {#configuration}

### Enhanced Configuration

**File**: `src/config/memoryConfig.ts` (new file)

```typescript
/**
 * Configuration for memory features
 */
export interface MemoryConfig {
  // Metadata store
  metadataDbPath: string;           // Default: ~/.cursor-rag/memory.db
  
  // Cursor chat integration
  cursorDbPath?: string;            // Auto-detected by default
  autoIngestChats: boolean;         // Default: false
  chatIngestInterval: number;       // Minutes, default: 30
  
  // Decay configuration
  decay: {
    halfLifeDays: number;           // Default: 60
    archiveThreshold: number;       // Default: 0.2
    recencyBoostDays: number;       // Default: 7
  };
  
  // Knowledge extraction
  extraction: {
    enabled: boolean;               // Default: true
    minConfidence: number;          // Default: 0.6
    extractSolutions: boolean;      // Default: true
    extractPatterns: boolean;       // Default: true
    extractDecisions: boolean;      // Default: true
    extractStandards: boolean;      // Default: true
  };
  
  // Categories
  categories: {
    autoClassify: boolean;          // Default: true
    autoEvolveSummaries: boolean;   // Default: true
    summaryEvolutionThreshold: number; // New items before re-summarising
  };
  
  // Maintenance
  maintenance: {
    enabled: boolean;               // Default: true
    nightlyTime: string;            // Cron expression, default: "0 3 * * *"
    weeklyTime: string;             // Default: "0 4 * * 0"
    monthlyTime: string;            // Default: "0 5 1 * *"
  };
  
  // Scoring
  scoring: {
    weights: {
      similarity: number;
      decay: number;
      importance: number;
      recency: number;
      graphBoost: number;
      typeBoost: number;
    };
  };
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  metadataDbPath: '~/.cursor-rag/memory.db',
  autoIngestChats: false,
  chatIngestInterval: 30,
  
  decay: {
    halfLifeDays: 60,
    archiveThreshold: 0.2,
    recencyBoostDays: 7,
  },
  
  extraction: {
    enabled: true,
    minConfidence: 0.6,
    extractSolutions: true,
    extractPatterns: true,
    extractDecisions: true,
    extractStandards: true,
  },
  
  categories: {
    autoClassify: true,
    autoEvolveSummaries: true,
    summaryEvolutionThreshold: 5,
  },
  
  maintenance: {
    enabled: true,
    nightlyTime: '0 3 * * *',
    weeklyTime: '0 4 * * 0',
    monthlyTime: '0 5 1 * *',
  },
  
  scoring: {
    weights: {
      similarity: 0.35,
      decay: 0.20,
      importance: 0.15,
      recency: 0.10,
      graphBoost: 0.10,
      typeBoost: 0.10,
    },
  },
}};
```

---

## Anti-Patterns and Negative Results {#anti-patterns}

Based on the Recursive Language Models paper's Negative Results (Appendix A) and our own testing, these are critical anti-patterns to avoid:

### 1. One-Size-Fits-All Prompts

**Problem**: Using the exact same prompts/configurations across all models.

> "We originally wrote the RLM system prompt with in context examples for GPT-5, and tried to use the same system prompt for Qwen3-Coder, but found that it led to different, undesirable behavior."

**Solution in This Project**:
```typescript
// BAD: Same config for all models
const config = { maxSubCalls: 100 };

// GOOD: Model-specific configurations
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-4': { maxSubCalls: 100, warnOnExcessiveCalls: false },
  'claude': { maxSubCalls: 100, warnOnExcessiveCalls: false },
  'qwen': { maxSubCalls: 50, warnOnExcessiveCalls: true },  // Needs warning
  'local': { maxSubCalls: 20, warnOnExcessiveCalls: true },
};
```

### 2. Assuming All Models Can Execute Code

**Problem**: Models without sufficient coding capabilities struggle with REPL-based approaches.

> "We found from small scale experiments that smaller models like Qwen3-8B struggled without sufficient coding abilities."

**Solution**: Implement capability detection and fallback paths:
```typescript
interface ModelCapabilities {
  codeExecution: 'excellent' | 'good' | 'limited' | 'none';
  contextWindow: number;
  outputTokens: number;
}

async function chooseRetrievalStrategy(
  capabilities: ModelCapabilities,
  queryComplexity: 'simple' | 'moderate' | 'complex'
): Promise<'direct' | 'iterative' | 'recursive'> {
  // Models without coding ability can't use recursive REPL approach
  if (capabilities.codeExecution === 'none' || capabilities.codeExecution === 'limited') {
    return queryComplexity === 'simple' ? 'direct' : 'iterative';
  }
  
  return queryComplexity === 'complex' ? 'recursive' : 'iterative';
}
```

### 3. Unlimited Thinking/Reasoning Tokens

**Problem**: Thinking models can exhaust output tokens with reasoning before producing results.

> "The smaller gap compared to the evaluated models... are due to multiple trajectories running out of output tokens while producing outputs due to thinking tokens exceeding the maximum output token length."

**Solution**: Reserve output tokens and enforce budgets:
```typescript
interface TokenBudget {
  totalOutputTokens: number;
  reservedForAnswer: number;
  maxThinkingTokens: number;
}

function getTokenBudget(model: string, taskType: string): TokenBudget {
  const modelLimits = MODEL_LIMITS[model];
  
  // Reserve 20-30% for final answer
  const reservedForAnswer = Math.floor(modelLimits.outputTokens * 0.25);
  
  return {
    totalOutputTokens: modelLimits.outputTokens,
    reservedForAnswer,
    maxThinkingTokens: modelLimits.outputTokens - reservedForAnswer,
  };
}
```

### 4. Synchronous-Only Sub-Calls

**Problem**: Sequential LLM calls create significant latency.

> "We implemented all sub-LM queries naively as blocking / sequential calls, which caused our RLM experiments to be slow."

**Solution**: Implement async sub-calls from the start (already included in Phase 8):
```typescript
// BAD: Sequential processing
for (const chunk of chunks) {
  const result = await llm.invoke(query, chunk);  // Blocks!
  results.push(result);
}

// GOOD: Parallel with concurrency limit
const CONCURRENCY = 5;
const results = await pMap(
  chunks,
  chunk => llm.invoke(query, chunk),
  { concurrency: CONCURRENCY }
);
```

### 5. Tag-Based Answer Detection

**Problem**: Relying on the model to wrap answers in specific tags is brittle.

> "The current strategy for distinguishing between a 'next turn' and a final answer for the RLM is to have it wrap its answer in FINAL() or FINAL\_VAR() tags... we also found the model to make strange decisions (e.g. it outputs its plan as a final answer)."

**Solution**: Use multiple termination signals and validation:
```typescript
interface TerminationDetection {
  // Multiple signals - don't rely on just one
  explicitTag: boolean;           // Model used FINAL() tag
  confidenceStatement: boolean;   // Model expressed confidence
  noMoreActions: boolean;         // Model didn't request more operations
  answerValidation: boolean;      // Answer passes format validation
  
  // Require multiple signals for termination
  shouldTerminate(): boolean {
    const signals = [
      this.explicitTag,
      this.confidenceStatement,
      this.noMoreActions,
      this.answerValidation,
    ].filter(Boolean).length;
    
    return signals >= 2;  // Require at least 2 signals
  }
}

// Also add safeguards against premature termination
function validateAnswer(answer: string, query: string): ValidationResult {
  // Check answer isn't just a plan/thought
  if (answer.toLowerCase().includes('i will') || 
      answer.toLowerCase().includes('let me')) {
    return { valid: false, reason: 'Answer appears to be a plan, not a result' };
  }
  
  // Check answer addresses the query
  // ... additional validation
  
  return { valid: true };
}
```

### 6. No Cost/Iteration Limits

**Problem**: Without limits, runaway trajectories can be expensive.

> "RLMs iteratively interact with their context until they find a suitable answer, leading to large differences in iteration length... many outlier RLM runs are significantly more expensive than any base model query."

**Solution**: Enforce strict budgets (already in Phase 8) and add circuit breakers:
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: Date | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 3,
    private resetTimeMs: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure!.getTime() > this.resetTimeMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailure = new Date();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### 7. Excessive Sub-Calls for Simple Operations

**Problem**: Some models over-use sub-calls, making thousands of calls for basic tasks.

> "We observed a trajectory on OOLONG where the model tries to reproduce its correct answer more than five times before choosing the incorrect answer in the end."

**Solution**: Add sub-call throttling and caching:
```typescript
class SubCallThrottler {
  private callCounts = new Map<string, number>();
  private cache = new Map<string, string>();
  
  async throttledCall(
    key: string,
    llm: LLMService,
    prompt: string,
    maxCalls: number = 3
  ): Promise<string> {
    // Check cache first
    const cacheKey = this.hashPrompt(prompt);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Check call count
    const count = this.callCounts.get(key) ?? 0;
    if (count >= maxCalls) {
      throw new Error(`Maximum sub-calls (${maxCalls}) exceeded for ${key}`);
    }
    
    this.callCounts.set(key, count + 1);
    
    const result = await llm.invoke(prompt);
    this.cache.set(cacheKey, result);
    
    return result;
  }
  
  private hashPrompt(prompt: string): string {
    // Simple hash for caching
    return Buffer.from(prompt).toString('base64').substring(0, 32);
  }
}
```

### 8. Not Using Model Priors for Filtering

**Problem**: Processing all context equally instead of leveraging model knowledge.

> "A key intuition for why the RLM abstraction can maintain strong performance on huge inputs without exploding costs is the LM's ability to filter input context without explicitly seeing it."

**Solution**: Pre-filter with keywords/patterns before semantic analysis:
```typescript
async function smartFilter(
  chunks: EnhancedChunk[],
  query: string,
  llm: LLMService
): Promise<EnhancedChunk[]> {
  // Step 1: Ask model for likely keywords (uses model priors)
  const keywordsPrompt = `Given this query, what specific keywords, names, or patterns would likely appear in relevant documents?
  
Query: ${query}

Return only a JSON array of 5-10 keywords/patterns.`;

  const keywordsResponse = await llm.invoke(keywordsPrompt);
  const keywords = JSON.parse(keywordsResponse);
  
  // Step 2: Filter chunks by keywords FIRST (cheap)
  const pattern = new RegExp(keywords.join('|'), 'i');
  const filtered = chunks.filter(c => pattern.test(c.content));
  
  // Step 3: Only do expensive semantic analysis on filtered set
  if (filtered.length < chunks.length * 0.3) {
    return filtered;  // Good filtering, use this subset
  }
  
  // Filtering didn't narrow enough, fall back to semantic
  return chunks;
}
```

### Summary: Implementation Checklist

| Anti-Pattern | Mitigation | Phase |
|-------------|------------|-------|
| Same prompts for all models | Model-specific configs | 8 |
| Assuming code execution | Capability detection + fallback | 8 |
| Unlimited thinking tokens | Token budgets | 8 |
| Synchronous sub-calls | Async with concurrency | 8 |
| Tag-based termination | Multiple signals + validation | 8 |
| No cost limits | Budget enforcement + circuit breakers | 8 |
| Excessive sub-calls | Throttling + caching | 8 |
| Not using model priors | Keyword pre-filtering | 7, 8 |

---

## Testing Strategy {#testing}

### Test Categories

1. **Unit Tests**
   - DecayCalculator scoring
   - RelationshipGraph traversal
   - KnowledgeExtractor parsing
   - CategoryManager classification

2. **Integration Tests**
   - Cursor chat reading
   - Full ingestion pipeline
   - Search with decay scoring
   - Maintenance job execution

3. **End-to-End Tests**
   - CLI commands
   - MCP tool responses
   - Full workflow: ingest → extract → search → retrieve

### Key Test Cases

```typescript
// Example test structure
describe('DecayCalculator', () => {
  it('should give high score to new chunks with high importance', () => {
    const chunk = createChunk({ createdAt: new Date(), importance: 0.9 });
    const score = calculator.calculateDecayScore(chunk);
    expect(score).toBeGreaterThan(0.8);
  });
  
  it('should decay old unused chunks', () => {
    const chunk = createChunk({
      createdAt: subDays(new Date(), 120),
      accessCount: 0,
      importance: 0.5,
    });
    const score = calculator.calculateDecayScore(chunk);
    expect(score).toBeLessThan(0.4);
  });
  
  it('should boost frequently accessed chunks', () => {
    const chunk = createChunk({
      createdAt: subDays(new Date(), 60),
      accessCount: 20,
      lastAccessedAt: subDays(new Date(), 1),
    });
    const score = calculator.calculateDecayScore(chunk);
    expect(score).toBeGreaterThan(0.6);
  });
});

describe('CursorChatReader', () => {
  it('should read conversations from Cursor database', async () => {
    const reader = new CursorChatReader(TEST_DB_PATH);
    const conversations = await reader.listConversations();
    expect(conversations.length).toBeGreaterThan(0);
  });
  
  it('should parse code blocks correctly', async () => {
    const conversation = await reader.getConversation(TEST_CONV_ID);
    const codeBlocks = conversation.messages.flatMap(m => m.codeBlocks);
    expect(codeBlocks.length).toBeGreaterThan(0);
    expect(codeBlocks[0].language).toBeDefined();
  });
});
```

---

## Implementation Order

### Recommended Sequence

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Foundation | 3-4 days | None |
| Phase 2: Chat History | 2-3 days | Phase 1 |
| Phase 3: Knowledge Extraction | 3-4 days | Phase 1, 2 |
| Phase 4: Relationship Graph | 2-3 days | Phase 1 |
| Phase 5: Hierarchical Memory | 2-3 days | Phase 1, 3 |
| Phase 6: Maintenance | 2 days | Phase 1, 5 |
| Phase 7: Enhanced Retrieval | 2-3 days | All previous |

**Total estimated time: 16-22 days**

### Quick Wins (Can be done first)

1. Task 1.1: Enhanced types (1 hour)
2. Task 1.3: Decay calculator (2 hours)
3. Task 2.1: Cursor DB reader (4 hours)
4. Task 6.2: Maintenance CLI (2 hours)

### High-Impact Features

1. **Cursor chat ingestion** - Immediate value from existing conversations
2. **Temporal decay** - Keeps retrieval relevant without manual curation
3. **Category summaries** - Reduces token usage, improves overview answers

---

## Appendix: File Structure

```
src/
├── types/
│   ├── memory.ts              # Enhanced chunk types
│   ├── extractedKnowledge.ts  # Knowledge extraction types
│   ├── relationships.ts       # Relationship types
│   └── categories.ts          # Category types
├── services/
│   ├── memoryMetadataStore.ts # SQLite metadata store
│   ├── decayCalculator.ts     # Decay scoring
│   ├── enhancedVectorStore.ts # Wrapper with memory features
│   ├── cursorChatReader.ts    # Cursor DB access
│   ├── conversationProcessor.ts # Chat processing
│   ├── knowledgeExtractor.ts  # LLM extraction
│   ├── knowledgeStorage.ts    # Store extracted knowledge
│   ├── relationshipGraph.ts   # Graph operations
│   ├── categoryManager.ts     # Category management
│   ├── maintenanceScheduler.ts # Background jobs
│   └── hybridScorer.ts        # Enhanced scoring
├── cli/
│   ├── ingestChats.ts         # Chat ingestion commands
│   └── maintenance.ts         # Maintenance commands
├── config/
│   └── memoryConfig.ts        # Configuration
└── mcp/
    └── memoryTools.ts         # New MCP tools
```

---

*Document Version: 1.0*
*Created: January 2025*
*For: cursor-recursive-rag memory enhancement project*
