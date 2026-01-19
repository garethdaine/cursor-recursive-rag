import Database from 'better-sqlite3';
import { vi } from 'vitest';

export function createInMemoryDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

export function createMockMetadataStore() {
  const db = createInMemoryDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks_metadata (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      chunk_type TEXT NOT NULL,
      importance_score REAL DEFAULT 0.5,
      decay_score REAL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT,
      access_count INTEGER DEFAULT 0,
      entity_tags TEXT,
      archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      strength REAL DEFAULT 1.0,
      metadata TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source_id, target_id, relationship_type)
    );

    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id TEXT NOT NULL,
      accessed_at TEXT NOT NULL,
      query_context TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      summary TEXT,
      item_count INTEGER DEFAULT 0,
      last_updated TEXT,
      parent_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_items (
      category_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      relevance_score REAL DEFAULT 1.0,
      added_at TEXT NOT NULL,
      PRIMARY KEY (category_id, chunk_id)
    );

    CREATE TABLE IF NOT EXISTS processed_conversations (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      processed_at TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0,
      extracted_knowledge INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_decay ON chunks_metadata(decay_score);
    CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks_metadata(chunk_type);
    CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
    CREATE INDEX IF NOT EXISTS idx_access_log_chunk ON access_log(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_category_items_chunk ON category_items(chunk_id);
  `);

  return {
    db,
    close: () => db.close(),
    reset: () => {
      db.exec(`
        DELETE FROM chunks_metadata;
        DELETE FROM relationships;
        DELETE FROM access_log;
        DELETE FROM categories;
        DELETE FROM category_items;
        DELETE FROM processed_conversations;
      `);
    },
  };
}

export type MockMetadataStore = ReturnType<typeof createMockMetadataStore>;
