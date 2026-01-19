import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { KnowledgeExtractor } from '../../src/services/knowledgeExtractor.js';
import { KnowledgeStorageService } from '../../src/services/knowledgeStorage.js';
import { ConversationProcessor } from '../../src/services/conversationProcessor.js';
import { EnhancedVectorStore } from '../../src/services/enhancedVectorStore.js';
import { MemoryMetadataStore } from '../../src/services/memoryMetadataStore.js';
import type { RAGConfig, VectorStore, VectorDocument, SearchResult, SearchOptions } from '../../src/types/index.js';
import type { Conversation, ChatMessage, MessageType, CodeBlock } from '../../src/services/cursorChatReader.js';
import { createMockEmbeddingsAdapter } from '../mocks/embeddings.js';
import { ChunkType } from '../../src/types/memory.js';

const testId = `test-knowledge-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testDir = join(tmpdir(), testId);

class InMemoryVectorStore implements VectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  async add(docs: VectorDocument[]): Promise<void> {
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }
  }

  async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (options.filter) {
        const matches = Object.entries(options.filter).every(([key, value]) => {
          return doc.metadata?.[key] === value;
        });
        if (!matches) continue;
      }

      const score = this.cosineSimilarity(embedding, doc.embedding);
      results.push({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.documents.size;
  }

  getAll(): VectorDocument[] {
    return Array.from(this.documents.values());
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

function createChatMessage(
  type: MessageType,
  content: string,
  options: {
    codeBlocks?: CodeBlock[];
    filesReferenced?: string[];
    isAgentic?: boolean;
  } = {}
): ChatMessage {
  return {
    id: randomUUID(),
    type,
    content,
    createdAt: new Date(),
    codeBlocks: options.codeBlocks || [],
    filesReferenced: options.filesReferenced || [],
    isAgentic: options.isAgentic || false,
    toolResults: [],
  };
}

function createConversation(
  messages: Array<{ type: 'user' | 'assistant'; content: string; codeBlocks?: CodeBlock[]; filesReferenced?: string[] }>
): Conversation {
  const chatMessages: ChatMessage[] = messages.map((msg, idx) => 
    createChatMessage(
      msg.type === 'user' ? 1 : 2,
      msg.content,
      { codeBlocks: msg.codeBlocks, filesReferenced: msg.filesReferenced }
    )
  );

  return {
    id: randomUUID(),
    messageCount: chatMessages.length,
    createdAt: new Date(),
    updatedAt: new Date(),
    hasCodeBlocks: chatMessages.some(m => m.codeBlocks.length > 0),
    preview: chatMessages[0]?.content.substring(0, 100) || '',
    messages: chatMessages,
  };
}

describe('Knowledge Pipeline Integration', () => {
  let vectorStore: InMemoryVectorStore;
  let metadataStore: MemoryMetadataStore;
  let enhancedStore: EnhancedVectorStore;
  let embedder: ReturnType<typeof createMockEmbeddingsAdapter>;
  let ragConfig: RAGConfig;
  let dbPath: string;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'metadata.db');

    vectorStore = new InMemoryVectorStore();
    metadataStore = new MemoryMetadataStore(dbPath);
    enhancedStore = new EnhancedVectorStore(vectorStore, { metadataStore });
    embedder = createMockEmbeddingsAdapter();
    
    ragConfig = {
      vectorStore: 'memory',
      embeddings: 'xenova',
    };
  });

  afterEach(() => {
    metadataStore.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ConversationProcessor', () => {
    it('should process conversation into chunks', () => {
      const conversation = createConversation([
        { type: 'user', content: 'How do I fix this error: TypeError: undefined is not a function' },
        { 
          type: 'assistant', 
          content: 'This error means you\'re trying to call something that isn\'t a function.',
          codeBlocks: [{ language: 'javascript', code: 'const fn = myObj.method;', filename: undefined }]
        },
      ]);

      const processor = new ConversationProcessor();
      const result = processor.processConversation(conversation);

      expect(result.conversationId).toBe(conversation.id);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.metadata.messageCount).toBe(2);
      expect(result.metadata.exchangeCount).toBe(1);
    });

    it('should create separate chunks for substantial code blocks', () => {
      const longCode = 'function example() {\n' + '  console.log("test");\n'.repeat(10) + '}';
      const conversation = createConversation([
        { type: 'user', content: 'Show me a complete example of error handling' },
        { 
          type: 'assistant', 
          content: 'Here is a complete implementation:',
          codeBlocks: [{ language: 'typescript', code: longCode, filename: 'error-handler.ts' }]
        },
      ]);

      const processor = new ConversationProcessor({ includeCodeChunks: true });
      const result = processor.processConversation(conversation);

      const codeChunks = result.chunks.filter(c => c.chunkType === 'code');
      expect(codeChunks.length).toBeGreaterThan(0);
      expect(codeChunks[0].metadata.language).toBe('typescript');
    });

    it('should extract entities from conversations', () => {
      const conversation = createConversation([
        { type: 'user', content: 'How do I set up React with TypeScript and Tailwind?' },
        { 
          type: 'assistant', 
          content: 'You can use create-react-app with the TypeScript template...',
          codeBlocks: [{ language: 'bash', code: 'npx create-react-app my-app --template typescript', filename: undefined }]
        },
      ]);

      const processor = new ConversationProcessor({ extractEntities: true });
      const result = processor.processConversation(conversation);

      expect(result.entities.length).toBeGreaterThan(0);
      const entityValues = result.entities.map(e => e.value);
      expect(entityValues).toContain('react');
    });

    it('should calculate importance based on content', () => {
      const shortConversation = createConversation([
        { type: 'user', content: 'Hi' },
        { type: 'assistant', content: 'Hello!' },
      ]);

      const detailedConversation = createConversation([
        { type: 'user', content: 'How do I implement authentication with JWT tokens and refresh tokens?' },
        { 
          type: 'assistant', 
          content: 'Here is a detailed implementation...' + 'x'.repeat(3000),
          codeBlocks: [{ language: 'typescript', code: 'class AuthService {}', filename: 'auth.service.ts' }],
          filesReferenced: ['src/auth.ts', 'src/middleware/auth.ts']
        },
      ]);

      const processor = new ConversationProcessor();
      const shortResult = processor.processConversation(shortConversation);
      const detailedResult = processor.processConversation(detailedConversation);

      const shortChunk = shortResult.chunks.find(c => c.chunkType === 'solution');
      const detailedChunk = detailedResult.chunks.find(c => c.chunkType === 'solution');

      expect(detailedChunk?.importance).toBeGreaterThan(shortChunk?.importance || 0);
    });
  });

  describe('KnowledgeExtractor', () => {
    it('should extract knowledge using heuristics when no LLM is available', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'I have an error: TypeError: Cannot read property of undefined' },
        { 
          type: 'assistant', 
          content: 'This error occurs when accessing properties on undefined values. Add null checks.',
          codeBlocks: [{ language: 'typescript', code: 'if (obj?.prop) { ... }', filename: undefined }]
        },
      ]);

      const extractor = new KnowledgeExtractor(ragConfig);
      expect(extractor.isLLMAvailable()).toBe(false);

      const knowledge = await extractor.extract(conversation);

      expect(knowledge.conversationId).toBe(conversation.id);
      expect(knowledge.solutions.length).toBeGreaterThan(0);
    });

    it('should extract patterns when code blocks are present', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'How should I implement a singleton pattern?' },
        { 
          type: 'assistant', 
          content: 'Here is the singleton pattern implementation:',
          codeBlocks: [{ 
            language: 'typescript', 
            code: 'class Singleton { private static instance; static getInstance() { return this.instance; } }',
            filename: undefined 
          }]
        },
      ]);

      const extractor = new KnowledgeExtractor(ragConfig);
      const knowledge = await extractor.extract(conversation);

      expect(knowledge.patterns.length).toBeGreaterThan(0);
    });

    it('should extract decisions for choice questions', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'Should I use Redux or Context API for state management?' },
        { 
          type: 'assistant', 
          content: 'For complex state, Redux is better because it provides better debugging tools and middleware support.',
        },
      ]);

      const extractor = new KnowledgeExtractor(ragConfig);
      const knowledge = await extractor.extract(conversation);

      expect(knowledge.decisions.length).toBeGreaterThan(0);
      expect(knowledge.decisions[0].topic).toContain('Redux');
    });

    it('should assign confidence scores to extracted items', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'Fix this error: ECONNRESET' },
        { 
          type: 'assistant', 
          content: 'This is a connection reset error. Check your network configuration.',
          codeBlocks: [{ language: 'typescript', code: 'const retry = async () => {}', filename: undefined }]
        },
      ]);

      const extractor = new KnowledgeExtractor(ragConfig);
      const knowledge = await extractor.extract(conversation);

      for (const solution of knowledge.solutions) {
        expect(solution.confidence).toBeGreaterThanOrEqual(0);
        expect(solution.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('KnowledgeStorageService', () => {
    let storageService: KnowledgeStorageService;

    beforeEach(() => {
      storageService = new KnowledgeStorageService(enhancedStore, embedder);
    });

    it('should store extracted solutions as chunks', async () => {
      const extractor = new KnowledgeExtractor(ragConfig);
      const conversation = createConversation([
        { type: 'user', content: 'Error: Module not found' },
        { 
          type: 'assistant', 
          content: 'Install the missing dependency with npm install.',
        },
      ]);

      const knowledge = await extractor.extract(conversation);
      const result = await storageService.store(knowledge);

      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.solutionChunks.length).toBeGreaterThan(0);

      const count = await vectorStore.count();
      expect(count).toBe(result.chunksCreated);
    });

    it('should store chunks with correct chunk types', async () => {
      const extractor = new KnowledgeExtractor(ragConfig);
      const conversation = createConversation([
        { type: 'user', content: 'Error: Cannot find module' },
        { 
          type: 'assistant', 
          content: 'The module needs to be installed.',
          codeBlocks: [{ language: 'bash', code: 'npm install package', filename: undefined }]
        },
      ]);

      const knowledge = await extractor.extract(conversation);
      await storageService.store(knowledge);

      const docs = vectorStore.getAll();
      const solutionDocs = docs.filter(d => d.metadata.chunkType === ChunkType.SOLUTION);
      
      expect(solutionDocs.length).toBeGreaterThan(0);
    });

    it('should store metadata for searchability', async () => {
      const extractor = new KnowledgeExtractor(ragConfig);
      const conversation = createConversation([
        { type: 'user', content: 'Error: TypeError in React component' },
        { 
          type: 'assistant', 
          content: 'Add null checks to prevent the error.',
          codeBlocks: [{ language: 'tsx', code: 'return <div>{data?.value}</div>', filename: undefined }]
        },
      ]);

      const knowledge = await extractor.extract(conversation);
      const result = await storageService.store(knowledge);

      const chunkId = result.solutionChunks[0];
      const metadata = metadataStore.getChunkMetadata(chunkId);

      expect(metadata).not.toBeNull();
      expect(metadata!.chunkType).toBe(ChunkType.SOLUTION);
      expect(metadata!.importance).toBeGreaterThan(0);
    });

    it('should create relationships between related patterns', async () => {
      const knowledge = {
        conversationId: 'test-conv',
        solutions: [],
        patterns: [
          {
            id: 'pat-1',
            name: 'Singleton',
            description: 'Singleton pattern',
            useCase: 'Single instance',
            implementation: 'class Singleton {}',
            language: 'typescript',
            relatedPatterns: ['Factory'],
            tags: ['design-pattern'],
            confidence: 0.8,
            sourceMessageIndices: [0, 1],
          },
          {
            id: 'pat-2',
            name: 'Factory',
            description: 'Factory pattern',
            useCase: 'Object creation',
            implementation: 'class Factory {}',
            language: 'typescript',
            relatedPatterns: ['Singleton'],
            tags: ['design-pattern'],
            confidence: 0.8,
            sourceMessageIndices: [0, 1],
          },
        ],
        decisions: [],
        standards: [],
        preferences: [],
        entities: [],
      };

      const result = await storageService.store(knowledge);

      expect(result.relationshipsCreated).toBeGreaterThan(0);
      expect(result.patternChunks.length).toBe(2);
    });
  });

  describe('Full Pipeline: Conversation → Extraction → Storage → Search', () => {
    it('should be able to search for stored solutions', async () => {
      const extractor = new KnowledgeExtractor(ragConfig);
      const storageService = new KnowledgeStorageService(enhancedStore, embedder);

      const conversation = createConversation([
        { type: 'user', content: 'Error: CORS policy blocked my API request' },
        { 
          type: 'assistant', 
          content: 'CORS errors occur when making cross-origin requests. Configure your server to send Access-Control-Allow-Origin headers.',
          codeBlocks: [{ 
            language: 'javascript', 
            code: 'app.use(cors({ origin: "http://localhost:3000" }))',
            filename: undefined 
          }]
        },
      ]);

      const knowledge = await extractor.extract(conversation);
      await storageService.store(knowledge);

      const searchEmbedding = await embedder.embed('CORS error in API request');
      const results = await enhancedStore.search(searchEmbedding, { topK: 5 });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('CORS');
    });

    it('should not re-process already processed conversations', async () => {
      const conversation = createConversation([
        { type: 'user', content: 'Test question' },
        { type: 'assistant', content: 'Test answer' },
      ]);

      metadataStore.markConversationProcessed(
        conversation.id,
        conversation.messages.length,
        1,
        1
      );

      const isProcessed = metadataStore.isConversationProcessed(conversation.id);
      expect(isProcessed).toBe(true);

      const processed = metadataStore.getProcessedConversation(conversation.id);
      expect(processed).not.toBeNull();
      expect(processed!.messageCount).toBe(2);
    });

    it('should handle multiple conversations and retrieve relevant results', async () => {
      const extractor = new KnowledgeExtractor(ragConfig);
      const storageService = new KnowledgeStorageService(enhancedStore, embedder);

      const conversations = [
        createConversation([
          { type: 'user', content: 'Error: How to handle database connection errors?' },
          { type: 'assistant', content: 'Use connection pooling and retry logic for database errors.' },
        ]),
        createConversation([
          { type: 'user', content: 'Error: How to fix authentication issues in Express?' },
          { type: 'assistant', content: 'Use passport.js for authentication middleware.' },
        ]),
        createConversation([
          { type: 'user', content: 'Error: Database connection timeout problem' },
          { type: 'assistant', content: 'Increase the connection timeout and check network latency.' },
        ]),
      ];

      for (const conv of conversations) {
        const knowledge = await extractor.extract(conv);
        await storageService.store(knowledge);
      }

      const count = await vectorStore.count();
      expect(count).toBeGreaterThanOrEqual(1);

      const searchEmbedding = await embedder.embed('database connection problem');
      const results = await enhancedStore.search(searchEmbedding, { topK: 3 });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should calculate and store importance scores', async () => {
      const extractor = new KnowledgeExtractor(ragConfig);
      const storageService = new KnowledgeStorageService(enhancedStore, embedder);

      const conversation = createConversation([
        { type: 'user', content: 'Critical error in production: OutOfMemoryError' },
        { 
          type: 'assistant', 
          content: 'Memory leaks can cause this. Profile your application and fix memory-retaining closures.',
          codeBlocks: [
            { language: 'javascript', code: 'const heapdump = require("heapdump");', filename: 'debug.js' }
          ],
          filesReferenced: ['server.js', 'config.js']
        },
      ]);

      const knowledge = await extractor.extract(conversation);
      const result = await storageService.store(knowledge);

      if (result.solutionChunks.length > 0) {
        const chunkId = result.solutionChunks[0];
        const metadata = metadataStore.getChunkMetadata(chunkId);

        expect(metadata).not.toBeNull();
        expect(metadata!.importance).toBeGreaterThan(0.5);
      }
    });
  });

  describe('Entity Extraction from Conversations', () => {
    it('should extract framework entities', () => {
      const conversation = createConversation([
        { type: 'user', content: 'How do I use React Query with Next.js?' },
        { 
          type: 'assistant', 
          content: 'React Query integrates well with Next.js for data fetching.',
          codeBlocks: [{ language: 'typescript', code: 'const query = useQuery()', filename: undefined }]
        },
      ]);

      const processor = new ConversationProcessor({ extractEntities: true });
      const result = processor.processConversation(conversation);

      const frameworks = result.entities.filter(e => e.type === 'framework');
      const frameworkNames = frameworks.map(f => f.value);

      expect(frameworkNames).toContain('react');
      expect(frameworkNames).toContain('nextjs');
    });

    it('should extract tool entities', () => {
      const conversation = createConversation([
        { type: 'user', content: 'How do I connect PostgreSQL with Docker?' },
        { type: 'assistant', content: 'Use docker-compose to run PostgreSQL.' },
      ]);

      const processor = new ConversationProcessor({ extractEntities: true });
      const result = processor.processConversation(conversation);

      const tools = result.entities.filter(e => e.type === 'tool');
      const toolNames = tools.map(t => t.value);

      expect(toolNames).toContain('postgresql');
      expect(toolNames).toContain('docker');
    });

    it('should extract language entities from code blocks', () => {
      const conversation = createConversation([
        { type: 'user', content: 'Show me a Python example' },
        { 
          type: 'assistant', 
          content: 'Here is a Python example:',
          codeBlocks: [{ language: 'python', code: 'print("Hello")', filename: undefined }]
        },
      ]);

      const processor = new ConversationProcessor({ extractEntities: true });
      const result = processor.processConversation(conversation);

      const languages = result.entities.filter(e => e.type === 'language');
      const langValues = languages.map(l => l.value);

      expect(langValues).toContain('python');
    });
  });
});
