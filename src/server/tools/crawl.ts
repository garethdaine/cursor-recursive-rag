import { randomUUID } from 'crypto';
import FirecrawlApp from '@mendable/firecrawl-js';
import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig, VectorDocument } from '../../types/index.js';
import { chunkDocument } from '../../services/chunker.js';

interface CrawlAndIngestArgs {
  url: string;
  maxPages?: number;
  maxDepth?: number;
}

export async function crawlAndIngestTool(
  args: CrawlAndIngestArgs,
  deps: { vectorStore: VectorStore; embedder: Embedder; config: RAGConfig }
): Promise<any> {
  const { url, maxPages = 100, maxDepth = 3 } = args;
  const { vectorStore, embedder, config } = deps;

  const firecrawlApiKey = config.apiKeys?.firecrawl;
  if (!firecrawlApiKey) {
    return {
      content: [
        {
          type: 'text',
          text: 'Firecrawl API key not configured. Run "cursor-rag setup" and provide a Firecrawl API key to enable web crawling.'
        }
      ],
      isError: true
    };
  }

  try {
    const app = new FirecrawlApp({ apiKey: firecrawlApiKey });

    // Crawl the site
    const result = await app.crawlUrl(url, {
      limit: maxPages,
      maxDepth,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true
      }
    });

    // Check if crawl was successful
    if (!result.success || !('data' in result) || !result.data || result.data.length === 0) {
      const errorMsg = 'error' in result ? result.error : 'No pages were retrieved';
      return {
        content: [
          {
            type: 'text',
            text: `Crawl completed but no pages were retrieved from ${url}: ${errorMsg}`
          }
        ]
      };
    }

    // Process each page
    let totalChunks = 0;
    const documents: VectorDocument[] = [];

    for (const page of result.data) {
      if (!page.markdown) continue;

      const chunks = chunkDocument(page.markdown, {
        chunkSize: 512,
        chunkOverlap: 50,
        respectBoundaries: true
      });

      // Generate embeddings for chunks
      const embeddings = await embedder.embedBatch(chunks.map(c => c.text));

      // Create vector documents
      for (let i = 0; i < chunks.length; i++) {
        documents.push({
          id: randomUUID(),
          embedding: embeddings[i],
          content: chunks[i].text,
          metadata: {
            source: page.url || url,
            title: page.metadata?.title || 'Untitled',
            chunkIndex: chunks[i].index
          }
        });
      }

      totalChunks += chunks.length;
    }

    // Add all documents to vector store in batches
    const batchSize = 100;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      await vectorStore.add(batch);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully crawled and ingested ${result.data.length} pages from ${url}. Created ${totalChunks} chunks.`
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error crawling ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ],
      isError: true
    };
  }
}
