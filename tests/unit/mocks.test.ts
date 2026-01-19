import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockEmbeddingsAdapter,
  createMockVectorStore,
  createMockLLMProvider,
  createMockLLMWithJSONResponse,
  createInMemoryDatabase,
  createMockMetadataStore,
} from '../mocks/index.js';

describe('Mock Embeddings Adapter', () => {
  it('should generate embeddings with correct dimension', async () => {
    const adapter = createMockEmbeddingsAdapter({ dimension: 384 });
    const embedding = await adapter.embed('test text');
    
    expect(embedding).toHaveLength(384);
    expect(adapter.getDimension()).toBe(384);
  });

  it('should generate consistent embeddings for same text', async () => {
    const adapter = createMockEmbeddingsAdapter();
    const embedding1 = await adapter.embed('same text');
    const embedding2 = await adapter.embed('same text');
    
    expect(embedding1).toEqual(embedding2);
  });

  it('should generate different embeddings for different text', async () => {
    const adapter = createMockEmbeddingsAdapter();
    const embedding1 = await adapter.embed('text one');
    const embedding2 = await adapter.embed('text two');
    
    expect(embedding1).not.toEqual(embedding2);
  });

  it('should support batch embedding', async () => {
    const adapter = createMockEmbeddingsAdapter();
    const embeddings = await adapter.embedBatch(['text1', 'text2', 'text3']);
    
    expect(embeddings).toHaveLength(3);
    embeddings.forEach(emb => expect(emb).toHaveLength(384));
  });

  it('should allow custom fixed embedding', async () => {
    const fixedEmbedding = [0.1, 0.2, 0.3];
    const adapter = createMockEmbeddingsAdapter({ fixedEmbedding });
    const embedding = await adapter.embed('any text');
    
    expect(embedding).toEqual(fixedEmbedding);
  });
});

describe('Mock Vector Store', () => {
  let store: ReturnType<typeof createMockVectorStore>;

  beforeEach(() => {
    store = createMockVectorStore();
  });

  it('should upsert and retrieve chunks', async () => {
    await store.upsert({
      id: 'chunk-1',
      content: 'test content',
      embedding: [0.1, 0.2, 0.3],
      metadata: { source: 'test' },
    });

    const chunk = await store.get('chunk-1');
    expect(chunk).not.toBeNull();
    expect(chunk?.content).toBe('test content');
  });

  it('should search with cosine similarity', async () => {
    await store.upsertBatch([
      { id: '1', content: 'similar', embedding: [1, 0, 0] },
      { id: '2', content: 'different', embedding: [0, 1, 0] },
      { id: '3', content: 'opposite', embedding: [-1, 0, 0] },
    ]);

    const results = await store.search([1, 0, 0], 3);
    
    expect(results[0].id).toBe('1');
    expect(results[0].score).toBeCloseTo(1);
    expect(results[2].id).toBe('3');
    expect(results[2].score).toBeCloseTo(-1);
  });

  it('should filter search results by metadata', async () => {
    await store.upsertBatch([
      { id: '1', content: 'a', embedding: [1, 0, 0], metadata: { type: 'solution' } },
      { id: '2', content: 'b', embedding: [1, 0, 0], metadata: { type: 'pattern' } },
    ]);

    const results = await store.search([1, 0, 0], 10, { type: 'solution' });
    
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('should delete chunks', async () => {
    await store.upsert({ id: 'to-delete', content: 'test', embedding: [0, 0, 0] });
    
    expect(await store.count()).toBe(1);
    
    const deleted = await store.delete('to-delete');
    expect(deleted).toBe(true);
    expect(await store.count()).toBe(0);
  });

  it('should clear all chunks', async () => {
    await store.upsertBatch([
      { id: '1', content: 'a', embedding: [0, 0, 0] },
      { id: '2', content: 'b', embedding: [0, 0, 0] },
    ]);
    
    await store.clear();
    expect(await store.count()).toBe(0);
  });
});

describe('Mock LLM Provider', () => {
  it('should return default response', async () => {
    const llm = createMockLLMProvider({ defaultResponse: 'Hello!' });
    const response = await llm.chat([{ role: 'user', content: 'Hi' }]);
    
    expect(response.content).toBe('Hello!');
    expect(response.model).toBe('mock-model');
  });

  it('should match response patterns', async () => {
    const llm = createMockLLMProvider({
      responses: new Map([
        ['weather', 'It is sunny'],
        ['time', 'It is noon'],
      ]),
      defaultResponse: 'I do not understand',
    });

    const weatherResponse = await llm.chat([{ role: 'user', content: 'What is the weather?' }]);
    expect(weatherResponse.content).toBe('It is sunny');

    const timeResponse = await llm.chat([{ role: 'user', content: 'What time is it?' }]);
    expect(timeResponse.content).toBe('It is noon');

    const unknownResponse = await llm.chat([{ role: 'user', content: 'Hello' }]);
    expect(unknownResponse.content).toBe('I do not understand');
  });

  it('should support custom response function', async () => {
    const llm = createMockLLMProvider({
      responseFn: async (messages) => {
        const lastMessage = messages[messages.length - 1].content;
        return `Echo: ${lastMessage}`;
      },
    });

    const response = await llm.chat([{ role: 'user', content: 'test' }]);
    expect(response.content).toBe('Echo: test');
  });

  it('should handle failures', async () => {
    const llm = createMockLLMProvider({
      shouldFail: true,
      failureError: new Error('API Error'),
    });

    await expect(llm.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow('API Error');
    expect(await llm.isAvailable()).toBe(false);
  });

  it('should create JSON response provider', async () => {
    const data = { name: 'test', value: 42 };
    const llm = createMockLLMWithJSONResponse(data);
    
    const response = await llm.complete('Give me JSON');
    expect(JSON.parse(response.content)).toEqual(data);
  });

  it('should include token usage', async () => {
    const llm = createMockLLMProvider({
      tokenUsage: { input: 50, output: 25 },
    });

    const response = await llm.chat([{ role: 'user', content: 'Hi' }]);
    expect(response.usage.inputTokens).toBe(50);
    expect(response.usage.outputTokens).toBe(25);
    expect(response.usage.totalTokens).toBe(75);
  });
});

describe('Mock Database', () => {
  it('should create in-memory SQLite database', () => {
    const db = createInMemoryDatabase();
    
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO test (name) VALUES (?)').run('test');
    
    const row = db.prepare('SELECT * FROM test').get() as { id: number; name: string };
    expect(row.name).toBe('test');
    
    db.close();
  });

  it('should create mock metadata store with schema', () => {
    const { db, close, reset } = createMockMetadataStore();
    
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('chunks_metadata');
    expect(tableNames).toContain('relationships');
    expect(tableNames).toContain('access_log');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('category_items');
    expect(tableNames).toContain('processed_conversations');
    
    close();
  });

  it('should reset metadata store', () => {
    const { db, close, reset } = createMockMetadataStore();
    
    db.prepare(`
      INSERT INTO chunks_metadata (id, source_type, chunk_type, created_at)
      VALUES (?, ?, ?, ?)
    `).run('test-id', 'test', 'solution', new Date().toISOString());
    
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM chunks_metadata').get() as { count: number };
    expect(countBefore.count).toBe(1);
    
    reset();
    
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM chunks_metadata').get() as { count: number };
    expect(countAfter.count).toBe(0);
    
    close();
  });
});
