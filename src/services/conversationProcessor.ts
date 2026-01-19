import type { Embedder } from '../adapters/embeddings/index.js';
import type { 
  Conversation, 
  ChatMessage, 
  CodeBlock, 
  MessageType 
} from './cursorChatReader.js';
import type { 
  EnhancedChunk, 
  ChunkType, 
  EntityTag, 
  EntityType,
} from '../types/memory.js';
import { randomUUID } from 'crypto';

/**
 * A message exchange (user question + assistant responses)
 */
export interface MessageExchange {
  userMessage: ChatMessage;
  assistantMessages: ChatMessage[];
  timestamp: Date;
}

/**
 * Result of processing a conversation
 */
export interface ProcessedConversationResult {
  conversationId: string;
  chunks: ProcessedChunk[];
  entities: EntityTag[];
  metadata: {
    messageCount: number;
    exchangeCount: number;
    codeBlockCount: number;
    filesReferenced: string[];
    languages: string[];
  };
}

/**
 * A processed chunk ready for embedding and storage
 */
export interface ProcessedChunk {
  id: string;
  content: string;
  source: string;
  chunkType: ChunkType;
  importance: number;
  metadata: Record<string, unknown>;
  sourceConversationId: string;
  sourceMessageIndex?: number;
}

/**
 * Options for processing conversations
 */
export interface ProcessingOptions {
  includeCodeChunks?: boolean;
  minExchangeLength?: number;
  maxChunkSize?: number;
  extractEntities?: boolean;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  includeCodeChunks: true,
  minExchangeLength: 50,
  maxChunkSize: 2000,
  extractEntities: true,
};

/**
 * Processes raw conversations into structured chunks for RAG storage
 */
export class ConversationProcessor {
  private options: ProcessingOptions;

  constructor(options?: Partial<ProcessingOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process a conversation into chunks for storage
   */
  processConversation(conversation: Conversation): ProcessedConversationResult {
    const chunks: ProcessedChunk[] = [];
    const allFilesReferenced: string[] = [];
    const allLanguages = new Set<string>();
    let codeBlockCount = 0;

    // 1. Group messages into exchanges (user question + assistant responses)
    const exchanges = this.groupIntoExchanges(conversation.messages);

    // 2. Create chunks for each exchange
    for (let i = 0; i < exchanges.length; i++) {
      const exchange = exchanges[i];
      const exchangeChunk = this.createExchangeChunk(exchange, conversation, i);
      
      if (exchangeChunk.content.length >= (this.options.minExchangeLength || 50)) {
        chunks.push(exchangeChunk);
      }

      // Collect files referenced
      for (const msg of [exchange.userMessage, ...exchange.assistantMessages]) {
        allFilesReferenced.push(...msg.filesReferenced);
      }
    }

    // 3. Create separate chunks for significant code blocks
    if (this.options.includeCodeChunks) {
      for (let msgIdx = 0; msgIdx < conversation.messages.length; msgIdx++) {
        const message = conversation.messages[msgIdx];
        
        for (const codeBlock of message.codeBlocks) {
          codeBlockCount++;
          allLanguages.add(codeBlock.language);
          
          // Only create separate chunk for substantial code blocks
          if (codeBlock.code.length > 100) {
            const codeChunk = this.createCodeChunk(codeBlock, message, conversation, msgIdx);
            chunks.push(codeChunk);
          }
        }
      }
    }

    // 4. Extract entities
    const entities = this.options.extractEntities 
      ? this.extractEntities(conversation, allLanguages)
      : [];

    return {
      conversationId: conversation.id,
      chunks,
      entities,
      metadata: {
        messageCount: conversation.messages.length,
        exchangeCount: exchanges.length,
        codeBlockCount,
        filesReferenced: [...new Set(allFilesReferenced)],
        languages: [...allLanguages],
      },
    };
  }

  /**
   * Group messages into user-assistant exchanges
   */
  private groupIntoExchanges(messages: ChatMessage[]): MessageExchange[] {
    const exchanges: MessageExchange[] = [];
    let currentExchange: MessageExchange | null = null;

    for (const message of messages) {
      if (message.type === 1) { // USER
        // Save previous exchange if exists
        if (currentExchange) {
          exchanges.push(currentExchange);
        }
        // Start new exchange
        currentExchange = {
          userMessage: message,
          assistantMessages: [],
          timestamp: message.createdAt,
        };
      } else if (message.type === 2 && currentExchange) { // ASSISTANT
        currentExchange.assistantMessages.push(message);
      }
    }

    // Don't forget the last exchange
    if (currentExchange && currentExchange.assistantMessages.length > 0) {
      exchanges.push(currentExchange);
    }

    return exchanges;
  }

  /**
   * Create a chunk from a message exchange
   */
  private createExchangeChunk(
    exchange: MessageExchange, 
    conversation: Conversation,
    exchangeIndex: number
  ): ProcessedChunk {
    const content = this.formatExchange(exchange);
    const importance = this.calculateExchangeImportance(exchange);

    return {
      id: `chat-${conversation.id.substring(0, 8)}-ex${exchangeIndex}-${randomUUID().substring(0, 8)}`,
      content: this.truncateContent(content),
      source: `cursor-chat:${conversation.id}`,
      chunkType: 'solution' as ChunkType,
      importance,
      metadata: {
        type: 'exchange',
        exchangeIndex,
        hasCode: exchange.assistantMessages.some(m => m.codeBlocks.length > 0),
        filesReferenced: [
          ...exchange.userMessage.filesReferenced,
          ...exchange.assistantMessages.flatMap(m => m.filesReferenced),
        ],
        isAgentic: exchange.assistantMessages.some(m => m.isAgentic),
        timestamp: exchange.timestamp.toISOString(),
      },
      sourceConversationId: conversation.id,
    };
  }

  /**
   * Create a chunk from a code block
   */
  private createCodeChunk(
    codeBlock: CodeBlock, 
    message: ChatMessage,
    conversation: Conversation,
    messageIndex: number
  ): ProcessedChunk {
    // Include context around the code
    const content = this.formatCodeBlockWithContext(codeBlock, message);
    const importance = this.calculateCodeImportance(codeBlock);

    return {
      id: `chat-${conversation.id.substring(0, 8)}-code-${randomUUID().substring(0, 8)}`,
      content: this.truncateContent(content),
      source: `cursor-chat:${conversation.id}`,
      chunkType: 'code' as ChunkType,
      importance,
      metadata: {
        type: 'code',
        language: codeBlock.language,
        filename: codeBlock.filename,
        messageIndex,
        timestamp: message.createdAt.toISOString(),
      },
      sourceConversationId: conversation.id,
      sourceMessageIndex: messageIndex,
    };
  }

  /**
   * Format an exchange as readable text
   */
  private formatExchange(exchange: MessageExchange): string {
    const parts: string[] = [];

    // User question
    if (exchange.userMessage.content.trim()) {
      parts.push(`## User Question\n${exchange.userMessage.content.trim()}`);
    }

    // Assistant response(s)
    const responses = exchange.assistantMessages
      .map(m => m.content.trim())
      .filter(c => c.length > 0)
      .join('\n\n');
    
    if (responses) {
      parts.push(`## Assistant Response\n${responses}`);
    }

    // Include code blocks inline
    const codeBlocks = exchange.assistantMessages.flatMap(m => m.codeBlocks);
    if (codeBlocks.length > 0) {
      const codeSection = codeBlocks
        .map(cb => `\`\`\`${cb.language}${cb.filename ? ` (${cb.filename})` : ''}\n${cb.code}\n\`\`\``)
        .join('\n\n');
      parts.push(`## Code\n${codeSection}`);
    }

    // Files referenced
    const files = [
      ...exchange.userMessage.filesReferenced,
      ...exchange.assistantMessages.flatMap(m => m.filesReferenced),
    ];
    if (files.length > 0) {
      const uniqueFiles = [...new Set(files)];
      parts.push(`## Files Referenced\n${uniqueFiles.join(', ')}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Format a code block with surrounding context
   */
  private formatCodeBlockWithContext(codeBlock: CodeBlock, message: ChatMessage): string {
    const parts: string[] = [];

    // Add filename as title if available
    if (codeBlock.filename) {
      parts.push(`# ${codeBlock.filename}`);
    }

    // Add language info
    parts.push(`Language: ${codeBlock.language}`);

    // Add the code
    parts.push(`\`\`\`${codeBlock.language}\n${codeBlock.code}\n\`\`\``);

    // Add context from the message (truncated)
    if (message.content) {
      const context = message.content.substring(0, 500);
      parts.push(`Context: ${context}${message.content.length > 500 ? '...' : ''}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Calculate importance score for an exchange
   */
  private calculateExchangeImportance(exchange: MessageExchange): number {
    let importance = 0.5;

    // Boost for code-containing responses
    if (exchange.assistantMessages.some(m => m.codeBlocks.length > 0)) {
      importance += 0.15;
    }

    // Boost for longer, detailed responses
    const totalLength = exchange.assistantMessages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalLength > 2000) importance += 0.1;
    if (totalLength > 5000) importance += 0.05;

    // Boost for file modifications (agentic responses)
    if (exchange.assistantMessages.some(m => m.isAgentic)) {
      importance += 0.1;
    }

    // Boost for file references
    const filesCount = exchange.assistantMessages.reduce((sum, m) => sum + m.filesReferenced.length, 0);
    if (filesCount > 0) importance += 0.05;
    if (filesCount > 5) importance += 0.05;

    return Math.min(1.0, importance);
  }

  /**
   * Calculate importance score for a code block
   */
  private calculateCodeImportance(codeBlock: CodeBlock): number {
    let importance = 0.6; // Code blocks start higher

    // Boost for longer code
    if (codeBlock.code.length > 200) importance += 0.1;
    if (codeBlock.code.length > 500) importance += 0.1;

    // Boost for code with filename (more specific)
    if (codeBlock.filename) importance += 0.1;

    return Math.min(1.0, importance);
  }

  /**
   * Extract entities from the conversation
   */
  private extractEntities(conversation: Conversation, languages: Set<string>): EntityTag[] {
    const entities: EntityTag[] = [];
    const content = conversation.messages.map(m => m.content).join(' ').toLowerCase();

    // Languages from code blocks
    for (const lang of languages) {
      entities.push({
        type: 'language' as EntityType,
        value: lang,
        confidence: 1.0,
      });
    }

    // Common frameworks/tools (simple pattern matching)
    const patterns: Array<{ pattern: RegExp; type: EntityType; value: string }> = [
      { pattern: /\breact\b/i, type: 'framework' as EntityType, value: 'react' },
      { pattern: /\bvue\b/i, type: 'framework' as EntityType, value: 'vue' },
      { pattern: /\bangular\b/i, type: 'framework' as EntityType, value: 'angular' },
      { pattern: /\bnext\.?js\b/i, type: 'framework' as EntityType, value: 'nextjs' },
      { pattern: /\bnuxt\b/i, type: 'framework' as EntityType, value: 'nuxt' },
      { pattern: /\blaravel\b/i, type: 'framework' as EntityType, value: 'laravel' },
      { pattern: /\bdjango\b/i, type: 'framework' as EntityType, value: 'django' },
      { pattern: /\bexpress\b/i, type: 'framework' as EntityType, value: 'express' },
      { pattern: /\bpostgres(?:ql)?\b/i, type: 'tool' as EntityType, value: 'postgresql' },
      { pattern: /\bmysql\b/i, type: 'tool' as EntityType, value: 'mysql' },
      { pattern: /\bredis\b/i, type: 'tool' as EntityType, value: 'redis' },
      { pattern: /\bdocker\b/i, type: 'tool' as EntityType, value: 'docker' },
      { pattern: /\bkubernetes\b/i, type: 'tool' as EntityType, value: 'kubernetes' },
      { pattern: /\baws\b/i, type: 'tool' as EntityType, value: 'aws' },
      { pattern: /\bcloudflare\b/i, type: 'tool' as EntityType, value: 'cloudflare' },
      { pattern: /\btailwind\b/i, type: 'framework' as EntityType, value: 'tailwindcss' },
    ];

    for (const { pattern, type, value } of patterns) {
      if (pattern.test(content)) {
        entities.push({ type, value, confidence: 0.8 });
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return entities.filter(e => {
      const key = `${e.type}:${e.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Truncate content to max chunk size
   */
  private truncateContent(content: string): string {
    const maxSize = this.options.maxChunkSize || 2000;
    if (content.length <= maxSize) return content;
    return content.substring(0, maxSize - 3) + '...';
  }
}

/**
 * Create a conversation processor
 */
export function createConversationProcessor(options?: Partial<ProcessingOptions>): ConversationProcessor {
  return new ConversationProcessor(options);
}
