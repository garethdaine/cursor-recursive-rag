import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig, VectorDocument } from '../../types/index.js';
import { chunkDocument } from '../../services/chunker.js';
import { logActivity } from '../../services/activity-log.js';

interface IngestDocumentArgs {
  source: string;
  title?: string;
  metadata?: Record<string, any>;
}

export async function ingestDocumentTool(
  args: IngestDocumentArgs,
  deps: { vectorStore: VectorStore; embedder: Embedder; config: RAGConfig }
): Promise<any> {
  const { source, title, metadata = {} } = args;
  const { vectorStore, embedder } = deps;

  let content: string;
  let docSource: string;

  // Determine if source is URL, file path, or text
  if (source.startsWith('http://') || source.startsWith('https://')) {
    // Fetch URL content using fetch API
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      content = await response.text();
      docSource = title || source;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch URL ${source}: ${error instanceof Error ? error.message : 'Unknown error'}. Use crawl_and_ingest for better web content extraction.`
          }
        ],
        isError: true
      };
    }
  } else if (source.startsWith('/') || source.startsWith('./') || source.includes('\\') || existsSync(source)) {
    // File path - read file
    try {
      content = readFileSync(source, 'utf-8');
      docSource = title || source;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read file ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  } else {
    // Assume it's text content
    content = source;
    docSource = title || 'manual-input';
  }

  // Chunk the document
  const chunks = chunkDocument(content, {
    chunkSize: 512,
    chunkOverlap: 50,
    respectBoundaries: true
  });

  // Generate embeddings and add to vector store
  const embeddings = await embedder.embedBatch(chunks.map(c => c.text));

  const documents: VectorDocument[] = chunks.map((chunk, idx) => ({
    id: randomUUID(),
    embedding: embeddings[idx],
    content: chunk.text,
    metadata: {
      ...metadata,
      source: docSource,
      title: title || docSource,
      chunkIndex: chunk.index
    }
  }));

  await vectorStore.add(documents);

  logActivity('ingest', `Ingested: "${title || docSource}"`, {
    chunksCreated: documents.length,
    source: docSource
  });

  return {
    content: [
      {
        type: 'text',
        text: `Successfully ingested document "${title || docSource}". Created ${documents.length} chunks.`
      }
    ]
  };
}
