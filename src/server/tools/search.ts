import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig } from '../../types/index.js';

interface SearchKnowledgeArgs {
  query: string;
  topK?: number;
  sources?: string[];
}

export async function searchKnowledgeTool(
  args: SearchKnowledgeArgs,
  deps: { vectorStore: VectorStore; embedder: Embedder; config: RAGConfig }
): Promise<any> {
  const { query, topK = 10, sources } = args;
  const { vectorStore, embedder } = deps;

  const embedding = await embedder.embed(query);
  
  const searchOptions: any = { topK };
  if (sources && sources.length > 0) {
    searchOptions.filter = { source: { $in: sources } };
  }
  
  const results = await vectorStore.search(embedding, searchOptions);

  const formattedResults = results.map((result: any, idx: number) => 
    `[${idx + 1}] Score: ${result.score.toFixed(4)}\nSource: ${result.metadata.source || 'unknown'}\n${result.content}`
  ).join('\n\n---\n\n');

  return {
    content: [
      {
        type: 'text',
        text: `Found ${results.length} results:\n\n${formattedResults}`
      }
    ]
  };
}
