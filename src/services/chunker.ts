import { encoding_for_model } from 'tiktoken';
import type { Chunk, ChunkOptions } from '../types/index.js';

const tokenizer = encoding_for_model('gpt-3.5-turbo');

function tokenCount(text: string): number {
  return tokenizer.encode(text).length;
}

function splitBySemanticBoundaries(text: string): string[] {
  // Split by double newlines (paragraphs)
  let sections = text.split(/\n\n+/);
  
  // Further split long sections by headers (# ## ###)
  const finalSections: string[] = [];
  for (const section of sections) {
    const headerMatches = section.match(/^(#{1,6}\s+.+)$/gm);
    if (headerMatches && headerMatches.length > 1) {
      // Split by headers
      const parts = section.split(/(?=^#{1,6}\s+)/m);
      finalSections.push(...parts.filter(p => p.trim().length > 0));
    } else {
      finalSections.push(section);
    }
  }
  
  return finalSections.filter(s => s.trim().length > 0);
}

function slidingWindowChunk(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let currentChunk: string[] = [];
  let currentTokens = 0;
  
  for (const word of words) {
    const wordTokens = tokenCount(word);
    if (currentTokens + wordTokens > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk.join(' '));
      
      // Start new chunk with overlap
      const overlapSize = Math.floor(currentChunk.length * (overlap / 100));
      currentChunk = currentChunk.slice(-overlapSize);
      currentTokens = tokenCount(currentChunk.join(' '));
    }
    
    currentChunk.push(word);
    currentTokens += wordTokens;
  }
  
  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  
  return chunks;
}

export function chunkDocument(text: string, options: ChunkOptions = {}): Chunk[] {
  const {
    chunkSize = 512,
    chunkOverlap = 50,
    respectBoundaries = true
  } = options;

  if (respectBoundaries) {
    // Split by semantic boundaries first
    const sections = splitBySemanticBoundaries(text);
    const chunks: Chunk[] = [];
    
    for (const section of sections) {
      const tokens = tokenCount(section);
      if (tokens <= chunkSize) {
        chunks.push({ text: section, index: chunks.length });
      } else {
        // Sliding window with overlap
        const windowChunks = slidingWindowChunk(section, chunkSize, chunkOverlap);
        windowChunks.forEach((chunkText, i) => {
          chunks.push({ text: chunkText, index: chunks.length });
        });
      }
    }
    
    return chunks;
  } else {
    // Simple sliding window without respecting boundaries
    const windowChunks = slidingWindowChunk(text, chunkSize, chunkOverlap);
    return windowChunks.map((text, index) => ({ text, index }));
  }
}
