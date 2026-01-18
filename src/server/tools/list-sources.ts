import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig } from '../../types/index.js';

export async function listSourcesTool(
  args: Record<string, any>,
  deps: { vectorStore: VectorStore; embedder: Embedder; config: RAGConfig }
): Promise<any> {
  const { vectorStore, embedder } = deps;

  try {
    // Sample a representative query to get some results
    // We'll use a generic query to retrieve chunks and extract unique sources
    const sampleQuery = 'documentation guide tutorial';
    const embedding = await embedder.embed(sampleQuery);
    
    // Get a large sample to find sources (up to 1000 results)
    const results = await vectorStore.search(embedding, { topK: 1000 });
    
    // Extract unique sources from metadata
    const sourceMap = new Map<string, { chunks: number; title?: string }>();
    
    for (const result of results) {
      const source = result.metadata?.source || result.metadata?.path || 'unknown';
      if (!sourceMap.has(source)) {
        sourceMap.set(source, {
          chunks: 0,
          title: result.metadata?.title
        });
      }
      const sourceInfo = sourceMap.get(source)!;
      sourceInfo.chunks++;
    }
    
    const sources = Array.from(sourceMap.entries()).map(([source, info]) => ({
      id: source,
      name: info.title || source,
      chunks: info.chunks,
      url: source.startsWith('http') ? source : undefined
    }));

    if (sources.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No sources found in the knowledge base. Ingest documents using the ingest_document or crawl_and_ingest tools.'
          }
        ]
      };
    }

    const sourceList = sources
      .map(s => `- ${s.name} (${s.chunks} chunks)${s.url ? `\n  ${s.url}` : ''}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${sources.length} source(s) in the knowledge base:\n\n${sourceList}\n\nNote: This is a sample-based listing. The actual count may be higher.`
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error listing sources: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ],
      isError: true
    };
  }
}
