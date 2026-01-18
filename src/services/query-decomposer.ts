/**
 * Query decomposition for recursive RAG
 * 
 * This service breaks down complex queries into sub-questions
 * and generates follow-up questions based on retrieved context.
 */

export interface SubQuestion {
  question: string;
  reasoning: string;
}

export interface FollowUpQuestion {
  query: string;
  reasoning: string;
}

/**
 * Decompose a complex query into sub-questions
 * 
 * For now, uses simple heuristics. In the future, this could use
 * an LLM to intelligently decompose queries.
 */
export function decomposeQuery(query: string): string[] {
  // Simple heuristic: split by "and" or commas if they appear to separate distinct questions
  const parts = query.split(/\s+(?:and|,)\s+/i).filter(p => p.trim().length > 0);
  
  // If query seems complex (long, multiple clauses), split it
  if (parts.length > 1 && parts.every(p => p.includes('?'))) {
    return parts.map(p => p.trim());
  }
  
  // Check for multiple question patterns
  const questionMarks = (query.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    // Split by question marks
    return query.split(/\?+/)
      .map(q => q.trim())
      .filter(q => q.length > 0)
      .map(q => q + '?');
  }
  
  // Single question - return as is
  return [query];
}

/**
 * Generate follow-up questions based on retrieved context and original query
 * 
 * This is a placeholder for a more sophisticated implementation that would:
 * 1. Analyze gaps in the retrieved context
 * 2. Identify entities or concepts that need more detail
 * 3. Generate targeted follow-up queries
 */
export function generateFollowUps(
  originalQuery: string,
  context: Array<{ question: string; chunks: any[] }>,
  maxFollowUps: number = 3
): FollowUpQuestion[] {
  const followUps: FollowUpQuestion[] = [];
  
  // Simple heuristic: if we have few chunks, generate follow-ups
  const totalChunks = context.reduce((sum, c) => sum + c.chunks.length, 0);
  
  if (totalChunks < 5) {
    // Try to identify what's missing
    const lowerQuery = originalQuery.toLowerCase();
    
    if (lowerQuery.includes('how')) {
      followUps.push({
        query: `What are the steps to ${originalQuery.replace(/how\s+/i, '')}`,
        reasoning: 'Need more detailed steps'
      });
    }
    
    if (lowerQuery.includes('why')) {
      followUps.push({
        query: `What are the reasons for ${originalQuery.replace(/why\s+/i, '')}`,
        reasoning: 'Need more context on reasons'
      });
    }
  }
  
  return followUps.slice(0, maxFollowUps);
}

/**
 * Assess confidence that we have sufficient information to answer the query
 * 
 * Simple heuristic based on number of chunks and their relevance scores
 */
export function assessConfidence(
  query: string,
  context: Array<{ question: string; chunks: any[]; iteration?: number }>
): number {
  // Count relevant chunks (score > 0.7)
  const relevantChunks = context.reduce((sum, c) => {
    return sum + c.chunks.filter(chunk => (chunk.score || 0) > 0.7).length;
  }, 0);
  
  // More chunks = higher confidence (capped)
  const baseConfidence = Math.min(relevantChunks / 10, 0.9);
  
  // Multiple iterations = we've done some exploration
  const maxIteration = Math.max(...context.map(c => c.iteration || 0));
  const iterationBonus = Math.min(maxIteration * 0.1, 0.2);
  
  return Math.min(baseConfidence + iterationBonus, 1.0);
}
