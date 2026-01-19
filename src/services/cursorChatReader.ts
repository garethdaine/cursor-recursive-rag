import Database from 'better-sqlite3';
import { platform, homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Message types in Cursor chat
 */
export enum MessageType {
  USER = 1,
  ASSISTANT = 2,
}

/**
 * Code block extracted from a message
 */
export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

/**
 * A single message (bubble) in a conversation
 */
export interface ChatMessage {
  id: string;
  type: MessageType;
  content: string;
  createdAt: Date;
  codeBlocks: CodeBlock[];
  filesReferenced: string[];
  isAgentic: boolean;
  toolResults: any[];
}

/**
 * Summary of a conversation
 */
export interface ConversationSummary {
  id: string;
  messageCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  hasCodeBlocks: boolean;
  preview: string;
}

/**
 * Full conversation with messages
 */
export interface Conversation extends ConversationSummary {
  messages: ChatMessage[];
}

/**
 * Options for listing conversations
 */
export interface ListConversationsOptions {
  limit?: number;
  since?: Date;
  hasCode?: boolean;
  includeMessages?: boolean;
}

/**
 * Reads chat history directly from Cursor's SQLite database
 * 
 * Cursor stores data in two tables:
 * - ItemTable: General key-value storage
 * - cursorDiskKV: Composer (chat) data including conversations and messages
 * 
 * Conversation structure:
 * - composerData:{uuid} - Contains conversation metadata and list of bubble IDs
 * - bubbleId:{conversationId}:{bubbleId} - Contains individual message content
 */
export class CursorChatReader {
  private dbPath: string;

  constructor(customPath?: string) {
    this.dbPath = customPath ?? this.getDefaultDbPath();
  }

  /**
   * Get the default database path based on OS
   */
  private getDefaultDbPath(): string {
    const home = homedir();
    const os = platform();

    switch (os) {
      case 'darwin':
        return join(home, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
      case 'win32':
        return join(process.env.APPDATA ?? home, 'Cursor/User/globalStorage/state.vscdb');
      case 'linux':
        return join(home, '.config/Cursor/User/globalStorage/state.vscdb');
      default:
        throw new Error(`Unsupported platform: ${os}`);
    }
  }

  /**
   * Check if the database exists
   */
  isDatabaseAvailable(): boolean {
    return existsSync(this.dbPath);
  }

  /**
   * Get the database path
   */
  getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * List all conversations with summaries
   */
  listConversations(options?: ListConversationsOptions): ConversationSummary[] {
    if (!this.isDatabaseAvailable()) {
      return [];
    }

    const db = new Database(this.dbPath, { readonly: true, fileMustExist: true });

    try {
      // Get all composerData keys
      const rows = db.prepare(`
        SELECT key, value FROM cursorDiskKV 
        WHERE key LIKE 'composerData:%'
      `).all() as Array<{ key: string; value: Buffer }>;

      const conversations: ConversationSummary[] = [];

      for (const row of rows) {
        try {
          const conversationId = row.key.replace('composerData:', '');
          const data = JSON.parse(row.value.toString('utf-8'));
          
          // Get message count from fullConversationHeadersOnly
          const messageHeaders = data.fullConversationHeadersOnly || [];
          const messageCount = messageHeaders.length;
          
          if (messageCount === 0) continue;

          // Get first message timestamp if available
          let createdAt: Date | null = null;
          let updatedAt: Date | null = null;
          
          if (messageHeaders.length > 0) {
            const firstBubble = this.getBubble(db, conversationId, messageHeaders[0].bubbleId);
            if (firstBubble?.createdAt) {
              createdAt = new Date(firstBubble.createdAt);
            }
            
            const lastBubble = this.getBubble(db, conversationId, messageHeaders[messageHeaders.length - 1].bubbleId);
            if (lastBubble?.createdAt) {
              updatedAt = new Date(lastBubble.createdAt);
            }
          }

          // Apply filters
          if (options?.since && createdAt && createdAt < options.since) {
            continue;
          }

          // Get preview from first user message
          let preview = '';
          let hasCodeBlocks = false;
          
          for (const header of messageHeaders) {
            if (header.type === MessageType.USER) {
              const bubble = this.getBubble(db, conversationId, header.bubbleId);
              if (bubble) {
                preview = this.extractTextFromRichText(bubble.richText || '');
                if (preview) break;
              }
            }
          }

          // Check for code blocks if filter requested
          if (options?.hasCode) {
            for (const header of messageHeaders) {
              const bubble = this.getBubble(db, conversationId, header.bubbleId);
              if (bubble?.suggestedCodeBlocks?.length > 0) {
                hasCodeBlocks = true;
                break;
              }
            }
            if (!hasCodeBlocks) continue;
          }

          conversations.push({
            id: conversationId,
            messageCount,
            createdAt,
            updatedAt,
            hasCodeBlocks,
            preview: preview.substring(0, 200) + (preview.length > 200 ? '...' : ''),
          });
        } catch (e) {
          // Skip malformed entries
          continue;
        }
      }

      // Sort by updatedAt descending
      conversations.sort((a, b) => {
        if (!a.updatedAt && !b.updatedAt) return 0;
        if (!a.updatedAt) return 1;
        if (!b.updatedAt) return -1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      // Apply limit
      if (options?.limit) {
        return conversations.slice(0, options.limit);
      }

      return conversations;
    } finally {
      db.close();
    }
  }

  /**
   * Get a full conversation with all messages
   */
  getConversation(conversationId: string): Conversation | null {
    if (!this.isDatabaseAvailable()) {
      return null;
    }

    const db = new Database(this.dbPath, { readonly: true, fileMustExist: true });

    try {
      // Get composerData
      const row = db.prepare(`
        SELECT value FROM cursorDiskKV 
        WHERE key = ?
      `).get(`composerData:${conversationId}`) as { value: Buffer } | undefined;

      if (!row) return null;

      const data = JSON.parse(row.value.toString('utf-8'));
      const messageHeaders = data.fullConversationHeadersOnly || [];

      const messages: ChatMessage[] = [];
      let createdAt: Date | null = null;
      let updatedAt: Date | null = null;
      let hasCodeBlocks = false;
      let preview = '';

      for (const header of messageHeaders) {
        const bubble = this.getBubble(db, conversationId, header.bubbleId);
        if (!bubble) continue;

        const content = this.extractTextFromRichText(bubble.richText || '');
        const codeBlocks = this.extractCodeBlocks(bubble);
        
        if (codeBlocks.length > 0) hasCodeBlocks = true;
        
        // Track timestamps
        if (bubble.createdAt) {
          const timestamp = new Date(bubble.createdAt);
          if (!createdAt || timestamp < createdAt) createdAt = timestamp;
          if (!updatedAt || timestamp > updatedAt) updatedAt = timestamp;
        }

        // Get preview from first user message
        if (!preview && header.type === MessageType.USER && content) {
          preview = content;
        }

        messages.push({
          id: header.bubbleId,
          type: header.type,
          content,
          createdAt: bubble.createdAt ? new Date(bubble.createdAt) : new Date(),
          codeBlocks,
          filesReferenced: this.extractFilesReferenced(bubble),
          isAgentic: bubble.isAgentic || false,
          toolResults: bubble.toolResults || [],
        });
      }

      return {
        id: conversationId,
        messageCount: messages.length,
        createdAt,
        updatedAt,
        hasCodeBlocks,
        preview: preview.substring(0, 200) + (preview.length > 200 ? '...' : ''),
        messages,
      };
    } finally {
      db.close();
    }
  }

  /**
   * Search conversations by content
   */
  searchConversations(query: string, options?: { maxResults?: number; hasCode?: boolean }): Conversation[] {
    const conversations = this.listConversations({ limit: 100, hasCode: options?.hasCode });
    const queryLower = query.toLowerCase();
    const results: Conversation[] = [];

    for (const summary of conversations) {
      const conversation = this.getConversation(summary.id);
      if (!conversation) continue;

      // Search in message content
      const matches = conversation.messages.some(m => 
        m.content.toLowerCase().includes(queryLower)
      );

      if (matches) {
        results.push(conversation);
        if (options?.maxResults && results.length >= options.maxResults) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get conversation count
   */
  getConversationCount(): number {
    if (!this.isDatabaseAvailable()) {
      return 0;
    }

    const db = new Database(this.dbPath, { readonly: true, fileMustExist: true });

    try {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM cursorDiskKV 
        WHERE key LIKE 'composerData:%'
      `).get() as { count: number };

      return row.count;
    } finally {
      db.close();
    }
  }

  /**
   * Get a single bubble (message) from the database
   */
  private getBubble(db: Database.Database, conversationId: string, bubbleId: string): any | null {
    try {
      const row = db.prepare(`
        SELECT value FROM cursorDiskKV 
        WHERE key = ?
      `).get(`bubbleId:${conversationId}:${bubbleId}`) as { value: Buffer } | undefined;

      if (!row) return null;
      return JSON.parse(row.value.toString('utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Extract plain text from Cursor's rich text format (Lexical)
   */
  private extractTextFromRichText(richText: string): string {
    if (!richText) return '';
    
    try {
      const parsed = JSON.parse(richText);
      return this.extractTextFromNode(parsed.root);
    } catch {
      return '';
    }
  }

  /**
   * Recursively extract text from Lexical nodes
   */
  private extractTextFromNode(node: any): string {
    if (!node) return '';
    
    let text = '';
    
    if (node.text) {
      text += node.text;
    }
    
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        text += this.extractTextFromNode(child);
      }
      // Add newline after paragraphs
      if (node.type === 'paragraph') {
        text += '\n';
      }
    }
    
    return text;
  }

  /**
   * Extract code blocks from a bubble
   */
  private extractCodeBlocks(bubble: any): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    
    // From suggestedCodeBlocks
    if (bubble.suggestedCodeBlocks && Array.isArray(bubble.suggestedCodeBlocks)) {
      for (const block of bubble.suggestedCodeBlocks) {
        blocks.push({
          language: block.language || 'text',
          code: block.code || '',
          filename: block.filename,
        });
      }
    }
    
    // From assistantSuggestedDiffs
    if (bubble.assistantSuggestedDiffs && Array.isArray(bubble.assistantSuggestedDiffs)) {
      for (const diff of bubble.assistantSuggestedDiffs) {
        if (diff.newContent) {
          blocks.push({
            language: this.guessLanguageFromFilename(diff.filePath || ''),
            code: diff.newContent,
            filename: diff.filePath,
          });
        }
      }
    }
    
    return blocks;
  }

  /**
   * Extract files referenced in a bubble
   */
  private extractFilesReferenced(bubble: any): string[] {
    const files: string[] = [];
    
    if (bubble.attachedFileCodeChunksMetadataOnly) {
      for (const chunk of bubble.attachedFileCodeChunksMetadataOnly) {
        if (chunk.relativeWorkspacePath) {
          files.push(chunk.relativeWorkspacePath);
        }
      }
    }
    
    if (bubble.relevantFiles) {
      for (const file of bubble.relevantFiles) {
        if (typeof file === 'string') {
          files.push(file);
        } else if (file.path) {
          files.push(file.path);
        }
      }
    }
    
    return [...new Set(files)];
  }

  /**
   * Guess programming language from filename
   */
  private guessLanguageFromFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'java': 'java',
      'kt': 'kotlin',
      'swift': 'swift',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'vue': 'vue',
      'svelte': 'svelte',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
    };
    return languageMap[ext || ''] || 'text';
  }
}

/**
 * Create a CursorChatReader instance
 */
export function createCursorChatReader(customPath?: string): CursorChatReader {
  return new CursorChatReader(customPath);
}
