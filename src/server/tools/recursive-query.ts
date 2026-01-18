import type { VectorStore } from '../../adapters/vector/index.js';
import type { Embedder } from '../../adapters/embeddings/index.js';
import type { RAGConfig } from '../../types/index.js';
import { decomposeQuery, generateFollowUps, assessConfidence } from '../../services/query-decomposer.js';

interface RecursiveQueryArgs {
  query: string;
  maxIterations?: number;
  minConfidence?: number;
  sources?: string[];
}

export async function recursiveQueryTool(
  args: RecursiveQueryArgs,
  deps: { vectorStore: VectorStore; embedder: Embedder; config: RAGConfig }
): Promise<any> {
  const {
    query,
    maxIterations = 5,
    minConfidence = 0.7,
    sources
  } = args;

  const { vectorStore, embedder } = deps;

  // Step 1: Decompose complex query into sub-questions
  const subQuestions = decomposeQuery(query);

  // Step 2: Initial retrieval for each sub-question
  const context: Array<{ question: string; chunks: any[]; iteration?: number }> = [];
  
  for (const subQ of subQuestions) {
    const embedding = await embedder.embed(subQ);
    const searchOptions: any = { topK: 10 };
    if (sources && sources.length > 0) {
      searchOptions.filter = { source: { $in: sources } };
    }
    const chunks = await vectorStore.search(embedding, searchOptions);
    context.push({ question: subQ, chunks, iteration: 0 });
  }

  // Step 3: Iterative refinement
  for (let i = 0; i < maxIterations; i++) {
    // Generate follow-up questions based on current context
    const followUps = generateFollowUps(query, context, 3);
    if (followUps.length === 0) break;

    // Retrieve for follow-ups
    for (const followUp of followUps) {
      const embedding = await embedder.embed(followUp.query);
      const searchOptions: any = { topK: 5 };
      if (sources && sources.length > 0) {
        searchOptions.filter = { source: { $in: sources } };
      }
      const chunks = await vectorStore.search(embedding, searchOptions);
      context.push({
        question: followUp.query,
        chunks,
        iteration: i + 1
      });
    }

    // Check if we have sufficient coverage
    const confidence = assessConfidence(query, context);
    if (confidence >= minConfidence) break;
  }

  // Step 4: Synthesize final answer
  // For now, return all relevant chunks with scores
  // In a full implementation, this would use an LLM to synthesize
  const allChunks = context.flatMap(c => c.chunks);
  const uniqueChunks = Array.from(
    new Map(allChunks.map(c => [c.id, c])).values()
  );
  
  // Sort by score descending
  uniqueChunks.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  // Take top chunks for answer synthesis
  const topChunks = uniqueChunks.slice(0, 20);
  
  // Simple synthesis: combine top chunks
  const answer = topChunks
    .map((chunk, idx) => `[${idx + 1}] ${chunk.content}`)
    .join('\n\n');

  return {
    content: [
      {
        type: 'text',
        text: `## Answer\n\n${answer}\n\n## Sources\n\nFound ${uniqueChunks.length} relevant chunks from ${context.length} retrieval steps.`
      }
    ]
  };
}
