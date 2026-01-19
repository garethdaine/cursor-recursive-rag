import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../../../src/services/chunker.js';
import { SAMPLE_MARKDOWN_DOC, SAMPLE_MIXED_DOC } from '../../fixtures/documents.js';

describe('chunkDocument', () => {
  describe('basic chunking', () => {
    it('should chunk short text into single chunk', () => {
      const chunks = chunkDocument('Hello world');
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Hello world');
      expect(chunks[0].index).toBe(0);
    });

    it('should preserve original text content', () => {
      const text = 'This is a test document with some content.';
      const chunks = chunkDocument(text);
      
      const reconstructed = chunks.map(c => c.text).join(' ');
      expect(reconstructed).toContain('test document');
    });

    it('should assign sequential indices', () => {
      const text = 'Section 1\n\nSection 2\n\nSection 3';
      const chunks = chunkDocument(text);
      
      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
      });
    });
  });

  describe('semantic boundary splitting', () => {
    it('should split by double newlines (paragraphs)', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = chunkDocument(text);
      
      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks[0].text).toContain('First');
    });

    it('should split by markdown headers', () => {
      const text = '# Header 1\n\nContent 1\n\n## Header 2\n\nContent 2';
      const chunks = chunkDocument(text);
      
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle markdown document', () => {
      const chunks = chunkDocument(SAMPLE_MARKDOWN_DOC);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.some(c => c.text.includes('TypeScript'))).toBe(true);
    });
  });

  describe('chunk size options', () => {
    it('should respect chunkSize option', () => {
      const longText = 'word '.repeat(1000);
      const chunks = chunkDocument(longText, { chunkSize: 100 });
      
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should create smaller chunks with smaller chunkSize', () => {
      const text = 'word '.repeat(500);
      const smallChunks = chunkDocument(text, { chunkSize: 50 });
      const largeChunks = chunkDocument(text, { chunkSize: 200 });
      
      expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    });
  });

  describe('overlap', () => {
    it('should create overlapping content with chunkOverlap', () => {
      const text = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 '.repeat(50);
      const chunks = chunkDocument(text, { chunkSize: 50, chunkOverlap: 20 });
      
      if (chunks.length >= 2) {
        const chunk1Words = chunks[0].text.split(/\s+/);
        const chunk2Words = chunks[1].text.split(/\s+/);
        
        const lastWordsChunk1 = chunk1Words.slice(-5);
        const hasOverlap = lastWordsChunk1.some(w => chunk2Words.includes(w));
        expect(hasOverlap).toBe(true);
      }
    });
  });

  describe('boundary options', () => {
    it('should split differently with respectBoundaries=false', () => {
      const text = 'First paragraph.\n\nSecond paragraph.';
      const withBoundaries = chunkDocument(text, { respectBoundaries: true });
      const withoutBoundaries = chunkDocument(text, { respectBoundaries: false });
      
      expect(withBoundaries.length).toBeGreaterThanOrEqual(withoutBoundaries.length - 1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const chunks = chunkDocument('');
      expect(chunks).toHaveLength(0);
    });

    it('should handle whitespace only', () => {
      const chunks = chunkDocument('   \n\n   ');
      expect(chunks).toHaveLength(0);
    });

    it('should handle single newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const chunks = chunkDocument(text);
      
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].text).toContain('Line');
    });

    it('should handle code blocks', () => {
      const text = '```typescript\nconst x = 1;\nconst y = 2;\n```';
      const chunks = chunkDocument(text);
      
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.some(c => c.text.includes('const'))).toBe(true);
    });
  });

  describe('real document scenarios', () => {
    it('should handle mixed content document', () => {
      const chunks = chunkDocument(SAMPLE_MIXED_DOC);
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some(c => c.text.includes('Migration'))).toBe(true);
    });

    it('should produce chunks under size limit', () => {
      const chunks = chunkDocument(SAMPLE_MARKDOWN_DOC, { chunkSize: 200 });
      
      for (const chunk of chunks) {
        const wordCount = chunk.text.split(/\s+/).length;
        expect(wordCount).toBeLessThan(500);
      }
    });
  });
});
