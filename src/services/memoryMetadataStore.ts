import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import type {
  ChunkMetadata,
  ChunkRelationship,
  RelationshipType,
  Category,
  CategoryItem,
  AccessLogEntry,
  ProcessedConversation,
  MemoryStats,
  ChunkType,
  EntityTag,
} from '../types/memory.js';

const DEFAULT_DB_PATH = join(homedir(), '.cursor-rag', 'memory.db');

/**
 * SQLite-based metadata store for memory tracking
 * 
 * This store maintains temporal metadata, access patterns, and relationships
 * independently of the vector store, allowing any vector backend to gain
 * memory capabilities.
 */
export class MemoryMetadataStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    
    // Ensure directory exists
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
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
        entities_json TEXT
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
        UNIQUE(from_chunk_id, to_chunk_id, relationship_type)
      );

      -- Access log for analytics
      CREATE TABLE IF NOT EXISTS access_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chunk_id TEXT NOT NULL,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        query_text TEXT,
        result_rank INTEGER,
        was_clicked BOOLEAN DEFAULT FALSE
      );

      -- Category summaries
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        parent_id TEXT,
        summary TEXT,
        chunk_count INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Category items (chunk assignments)
      CREATE TABLE IF NOT EXISTS category_items (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        relevance_score REAL DEFAULT 0.5,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chunk_id, category_id)
      );

      -- Processed conversations (to avoid re-processing)
      CREATE TABLE IF NOT EXISTS processed_conversations (
        id TEXT PRIMARY KEY,
        conversation_id TEXT UNIQUE NOT NULL,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        chunks_created INTEGER DEFAULT 0,
        knowledge_extracted INTEGER DEFAULT 0
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_chunks_decay ON chunks_metadata(decay_score);
      CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks_metadata(chunk_type);
      CREATE INDEX IF NOT EXISTS idx_chunks_archived ON chunks_metadata(is_archived);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks_metadata(source);
      CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_chunk_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_chunk_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
      CREATE INDEX IF NOT EXISTS idx_access_log_chunk ON access_log(chunk_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_time ON access_log(accessed_at);
      CREATE INDEX IF NOT EXISTS idx_category_items_chunk ON category_items(chunk_id);
      CREATE INDEX IF NOT EXISTS idx_category_items_category ON category_items(category_id);
    `);
  }

  // ==================== Chunk Metadata Operations ====================

  upsertChunkMetadata(metadata: Partial<ChunkMetadata> & { chunkId: string; source?: string }): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO chunks_metadata (
        chunk_id, source, chunk_type, created_at, updated_at, 
        last_accessed_at, access_count, importance, decay_score, 
        is_archived, source_conversation_id, source_message_index, entities_json
      ) VALUES (
        @chunkId, @source, @chunkType, @createdAt, @updatedAt,
        @lastAccessedAt, @accessCount, @importance, @decayScore,
        @isArchived, @sourceConversationId, @sourceMessageIndex, @entitiesJson
      )
      ON CONFLICT(chunk_id) DO UPDATE SET
        source = COALESCE(@source, source),
        chunk_type = COALESCE(@chunkType, chunk_type),
        updated_at = @updatedAt,
        last_accessed_at = COALESCE(@lastAccessedAt, last_accessed_at),
        access_count = COALESCE(@accessCount, access_count),
        importance = COALESCE(@importance, importance),
        decay_score = COALESCE(@decayScore, decay_score),
        is_archived = COALESCE(@isArchived, is_archived),
        source_conversation_id = COALESCE(@sourceConversationId, source_conversation_id),
        source_message_index = COALESCE(@sourceMessageIndex, source_message_index),
        entities_json = COALESCE(@entitiesJson, entities_json)
    `);

    stmt.run({
      chunkId: metadata.chunkId,
      source: metadata.source || 'unknown',
      chunkType: metadata.chunkType || 'documentation',
      createdAt: metadata.createdAt || now,
      updatedAt: now,
      lastAccessedAt: metadata.lastAccessedAt || null,
      accessCount: metadata.accessCount ?? 0,
      importance: metadata.importance ?? 0.5,
      decayScore: metadata.decayScore ?? 1.0,
      isArchived: metadata.isArchived ? 1 : 0,
      sourceConversationId: metadata.sourceConversationId || null,
      sourceMessageIndex: metadata.sourceMessageIndex ?? null,
      entitiesJson: null,
    });
  }

  getChunkMetadata(chunkId: string): ChunkMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM chunks_metadata WHERE chunk_id = ?
    `);
    const row = stmt.get(chunkId) as any;
    
    if (!row) return null;
    
    return {
      chunkId: row.chunk_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
      importance: row.importance,
      decayScore: row.decay_score,
      isArchived: Boolean(row.is_archived),
      chunkType: row.chunk_type as ChunkType,
      sourceConversationId: row.source_conversation_id,
      sourceMessageIndex: row.source_message_index,
    };
  }

  getAllChunkMetadata(options?: { 
    includeArchived?: boolean; 
    minDecayScore?: number;
    chunkTypes?: ChunkType[];
  }): ChunkMetadata[] {
    let sql = 'SELECT * FROM chunks_metadata WHERE 1=1';
    const params: any[] = [];
    
    if (!options?.includeArchived) {
      sql += ' AND is_archived = 0';
    }
    
    if (options?.minDecayScore !== undefined) {
      sql += ' AND decay_score >= ?';
      params.push(options.minDecayScore);
    }
    
    if (options?.chunkTypes && options.chunkTypes.length > 0) {
      sql += ` AND chunk_type IN (${options.chunkTypes.map(() => '?').join(',')})`;
      params.push(...options.chunkTypes);
    }
    
    sql += ' ORDER BY decay_score DESC';
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      chunkId: row.chunk_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
      importance: row.importance,
      decayScore: row.decay_score,
      isArchived: Boolean(row.is_archived),
      chunkType: row.chunk_type as ChunkType,
      sourceConversationId: row.source_conversation_id,
      sourceMessageIndex: row.source_message_index,
    }));
  }

  recordAccess(chunkId: string, queryText?: string, resultRank?: number): void {
    const now = new Date().toISOString();
    
    // Update chunk metadata
    const updateStmt = this.db.prepare(`
      UPDATE chunks_metadata 
      SET last_accessed_at = ?, access_count = access_count + 1, updated_at = ?
      WHERE chunk_id = ?
    `);
    updateStmt.run(now, now, chunkId);
    
    // Log access
    const logStmt = this.db.prepare(`
      INSERT INTO access_log (chunk_id, accessed_at, query_text, result_rank)
      VALUES (?, ?, ?, ?)
    `);
    logStmt.run(chunkId, now, queryText || null, resultRank ?? null);
  }

  updateDecayScore(chunkId: string, decayScore: number): void {
    const stmt = this.db.prepare(`
      UPDATE chunks_metadata 
      SET decay_score = ?, updated_at = CURRENT_TIMESTAMP
      WHERE chunk_id = ?
    `);
    stmt.run(decayScore, chunkId);
  }

  bulkUpdateDecayScores(updates: Array<{ chunkId: string; decayScore: number }>): void {
    const stmt = this.db.prepare(`
      UPDATE chunks_metadata 
      SET decay_score = ?, updated_at = CURRENT_TIMESTAMP
      WHERE chunk_id = ?
    `);
    
    const transaction = this.db.transaction((items: typeof updates) => {
      for (const item of items) {
        stmt.run(item.decayScore, item.chunkId);
      }
    });
    
    transaction(updates);
  }

  archiveChunk(chunkId: string): void {
    const stmt = this.db.prepare(`
      UPDATE chunks_metadata 
      SET is_archived = 1, updated_at = CURRENT_TIMESTAMP
      WHERE chunk_id = ?
    `);
    stmt.run(chunkId);
  }

  archiveStaleChunks(decayThreshold: number): string[] {
    const selectStmt = this.db.prepare(`
      SELECT chunk_id FROM chunks_metadata 
      WHERE decay_score < ? AND is_archived = 0
    `);
    const rows = selectStmt.all(decayThreshold) as any[];
    const chunkIds = rows.map(r => r.chunk_id);
    
    if (chunkIds.length > 0) {
      const updateStmt = this.db.prepare(`
        UPDATE chunks_metadata 
        SET is_archived = 1, updated_at = CURRENT_TIMESTAMP
        WHERE chunk_id = ?
      `);
      
      const transaction = this.db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id);
        }
      });
      
      transaction(chunkIds);
    }
    
    return chunkIds;
  }

  deleteChunkMetadata(chunkId: string): void {
    // Delete in correct order to respect foreign keys
    this.db.prepare('DELETE FROM access_log WHERE chunk_id = ?').run(chunkId);
    this.db.prepare('DELETE FROM category_items WHERE chunk_id = ?').run(chunkId);
    this.db.prepare('DELETE FROM relationships WHERE from_chunk_id = ? OR to_chunk_id = ?').run(chunkId, chunkId);
    this.db.prepare('DELETE FROM chunks_metadata WHERE chunk_id = ?').run(chunkId);
  }

  // ==================== Relationship Operations ====================

  addRelationship(
    fromChunkId: string, 
    toChunkId: string, 
    relationshipType: RelationshipType, 
    strength: number = 0.5,
    metadata?: Record<string, unknown>
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO relationships (from_chunk_id, to_chunk_id, relationship_type, strength, metadata_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(from_chunk_id, to_chunk_id, relationship_type) DO UPDATE SET
        strength = ?, metadata_json = COALESCE(?, metadata_json)
    `);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    stmt.run(fromChunkId, toChunkId, relationshipType, strength, metadataJson, strength, metadataJson);
  }

  getRelationships(chunkId: string, direction: 'from' | 'to' | 'both' = 'both'): ChunkRelationship[] {
    let sql: string;
    let params: string[];
    
    if (direction === 'from') {
      sql = 'SELECT * FROM relationships WHERE from_chunk_id = ?';
      params = [chunkId];
    } else if (direction === 'to') {
      sql = 'SELECT * FROM relationships WHERE to_chunk_id = ?';
      params = [chunkId];
    } else {
      sql = 'SELECT * FROM relationships WHERE from_chunk_id = ? OR to_chunk_id = ?';
      params = [chunkId, chunkId];
    }
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    
    return rows.map(row => ({
      id: String(row.id),
      sourceChunkId: row.from_chunk_id,
      targetChunkId: row.to_chunk_id,
      relationshipType: row.relationship_type as RelationshipType,
      strength: row.strength,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      createdAt: row.created_at,
    }));
  }

  getRelatedChunkIds(chunkId: string, relationshipType?: RelationshipType): string[] {
    let sql = `
      SELECT DISTINCT 
        CASE WHEN from_chunk_id = ? THEN to_chunk_id ELSE from_chunk_id END as related_id
      FROM relationships 
      WHERE from_chunk_id = ? OR to_chunk_id = ?
    `;
    const params: any[] = [chunkId, chunkId, chunkId];
    
    if (relationshipType) {
      sql += ' AND relationship_type = ?';
      params.push(relationshipType);
    }
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => r.related_id);
  }

  findContradictions(chunkId: string): ChunkRelationship[] {
    const stmt = this.db.prepare(`
      SELECT * FROM relationships 
      WHERE (from_chunk_id = ? OR to_chunk_id = ?) 
        AND relationship_type = 'contradicts'
    `);
    const rows = stmt.all(chunkId, chunkId) as any[];
    
    return rows.map(row => ({
      id: String(row.id),
      sourceChunkId: row.from_chunk_id,
      targetChunkId: row.to_chunk_id,
      relationshipType: row.relationship_type as RelationshipType,
      strength: row.strength,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      createdAt: row.created_at,
    }));
  }

  deleteRelationship(fromChunkId: string, toChunkId: string, relationshipType: RelationshipType): void {
    this.db.prepare(`
      DELETE FROM relationships 
      WHERE from_chunk_id = ? AND to_chunk_id = ? AND relationship_type = ?
    `).run(fromChunkId, toChunkId, relationshipType);
  }

  // ==================== Category Operations ====================

  upsertCategory(category: Partial<Category> & { id: string; name: string }): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO categories (id, name, description, parent_id, summary, chunk_count, last_updated, created_at)
      VALUES (@id, @name, @description, @parentId, @summary, @chunkCount, @lastUpdated, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        name = @name,
        description = COALESCE(@description, description),
        parent_id = COALESCE(@parentId, parent_id),
        summary = COALESCE(@summary, summary),
        chunk_count = COALESCE(@chunkCount, chunk_count),
        last_updated = @lastUpdated
    `);
    
    stmt.run({
      id: category.id,
      name: category.name,
      description: category.description || null,
      parentId: category.parentId || null,
      summary: category.summary || null,
      chunkCount: category.chunkCount ?? 0,
      lastUpdated: now,
      createdAt: category.createdAt || now,
    });
  }

  getCategory(id: string): Category | null {
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      parentId: row.parent_id,
      summary: row.summary,
      chunkCount: row.chunk_count,
      lastUpdated: row.last_updated,
      createdAt: row.created_at,
    };
  }

  getCategoryByName(name: string): Category | null {
    const row = this.db.prepare('SELECT * FROM categories WHERE name = ?').get(name) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      parentId: row.parent_id,
      summary: row.summary,
      chunkCount: row.chunk_count,
      lastUpdated: row.last_updated,
      createdAt: row.created_at,
    };
  }

  listCategories(): Category[] {
    const rows = this.db.prepare('SELECT * FROM categories ORDER BY name').all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parentId: row.parent_id,
      summary: row.summary,
      chunkCount: row.chunk_count,
      lastUpdated: row.last_updated,
      createdAt: row.created_at,
    }));
  }

  assignChunkToCategory(chunkId: string, categoryId: string, relevanceScore: number = 0.5): void {
    const id = `${chunkId}:${categoryId}`;
    const stmt = this.db.prepare(`
      INSERT INTO category_items (id, chunk_id, category_id, relevance_score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(chunk_id, category_id) DO UPDATE SET
        relevance_score = ?
    `);
    stmt.run(id, chunkId, categoryId, relevanceScore, relevanceScore);
    
    // Update category chunk count
    this.db.prepare(`
      UPDATE categories SET 
        chunk_count = (SELECT COUNT(*) FROM category_items WHERE category_id = ?),
        last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(categoryId, categoryId);
  }

  getChunkCategories(chunkId: string): CategoryItem[] {
    const rows = this.db.prepare(`
      SELECT * FROM category_items WHERE chunk_id = ?
    `).all(chunkId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      chunkId: row.chunk_id,
      categoryId: row.category_id,
      relevanceScore: row.relevance_score,
      assignedAt: row.assigned_at,
    }));
  }

  getCategoryChunks(categoryId: string): CategoryItem[] {
    const rows = this.db.prepare(`
      SELECT * FROM category_items WHERE category_id = ?
      ORDER BY relevance_score DESC
    `).all(categoryId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      chunkId: row.chunk_id,
      categoryId: row.category_id,
      relevanceScore: row.relevance_score,
      assignedAt: row.assigned_at,
    }));
  }

  // ==================== Processed Conversations ====================

  markConversationProcessed(
    conversationId: string, 
    messageCount: number, 
    chunksCreated: number,
    knowledgeExtracted: number
  ): void {
    const id = `conv:${conversationId}`;
    const stmt = this.db.prepare(`
      INSERT INTO processed_conversations (id, conversation_id, message_count, chunks_created, knowledge_extracted)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        processed_at = CURRENT_TIMESTAMP,
        message_count = ?,
        chunks_created = ?,
        knowledge_extracted = ?
    `);
    stmt.run(id, conversationId, messageCount, chunksCreated, knowledgeExtracted, messageCount, chunksCreated, knowledgeExtracted);
  }

  isConversationProcessed(conversationId: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM processed_conversations WHERE conversation_id = ?').get(conversationId);
    return !!row;
  }

  getProcessedConversation(conversationId: string): ProcessedConversation | null {
    const row = this.db.prepare('SELECT * FROM processed_conversations WHERE conversation_id = ?').get(conversationId) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      conversationId: row.conversation_id,
      processedAt: row.processed_at,
      messageCount: row.message_count,
      chunksCreated: row.chunks_created,
      knowledgeExtracted: row.knowledge_extracted,
    };
  }

  // ==================== Analytics & Stats ====================

  getMemoryStats(): MemoryStats {
    const totalChunks = (this.db.prepare('SELECT COUNT(*) as count FROM chunks_metadata').get() as any).count;
    const activeChunks = (this.db.prepare('SELECT COUNT(*) as count FROM chunks_metadata WHERE is_archived = 0').get() as any).count;
    const archivedChunks = (this.db.prepare('SELECT COUNT(*) as count FROM chunks_metadata WHERE is_archived = 1').get() as any).count;
    const avgDecay = (this.db.prepare('SELECT AVG(decay_score) as avg FROM chunks_metadata WHERE is_archived = 0').get() as any).avg || 0;
    const avgImportance = (this.db.prepare('SELECT AVG(importance) as avg FROM chunks_metadata WHERE is_archived = 0').get() as any).avg || 0;
    const totalAccesses = (this.db.prepare('SELECT COUNT(*) as count FROM access_log').get() as any).count;
    const relationshipCount = (this.db.prepare('SELECT COUNT(*) as count FROM relationships').get() as any).count;
    const categoryCount = (this.db.prepare('SELECT COUNT(*) as count FROM categories').get() as any).count;
    
    const typeRows = this.db.prepare(`
      SELECT chunk_type, COUNT(*) as count 
      FROM chunks_metadata 
      WHERE is_archived = 0 
      GROUP BY chunk_type
    `).all() as any[];
    
    const chunksByType: Record<ChunkType, number> = {} as any;
    for (const row of typeRows) {
      chunksByType[row.chunk_type as ChunkType] = row.count;
    }
    
    return {
      totalChunks,
      activeChunks,
      archivedChunks,
      avgDecayScore: avgDecay,
      avgImportance: avgImportance,
      totalAccesses,
      chunksByType,
      relationshipCount,
      categoryCount,
    };
  }

  getAccessStats(since?: Date): { chunkId: string; accessCount: number; lastAccess: string }[] {
    let sql = `
      SELECT chunk_id, COUNT(*) as access_count, MAX(accessed_at) as last_access
      FROM access_log
    `;
    const params: any[] = [];
    
    if (since) {
      sql += ' WHERE accessed_at >= ?';
      params.push(since.toISOString());
    }
    
    sql += ' GROUP BY chunk_id ORDER BY access_count DESC LIMIT 100';
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      chunkId: r.chunk_id,
      accessCount: r.access_count,
      lastAccess: r.last_access,
    }));
  }

  // ==================== Cleanup ====================

  close(): void {
    this.db.close();
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }
}

// Singleton instance
let instance: MemoryMetadataStore | null = null;

export function getMemoryMetadataStore(dbPath?: string): MemoryMetadataStore {
  if (!instance) {
    instance = new MemoryMetadataStore(dbPath);
  }
  return instance;
}

export function closeMemoryMetadataStore(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
