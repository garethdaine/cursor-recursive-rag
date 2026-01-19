import { randomUUID } from 'crypto';
import {
  DEFAULT_CATEGORIES,
  type CategoryDefinition,
  type CategoryClassification,
  type CategoryItemsOptions,
  type CategoryWithStats,
  type CategorySelectionOptions,
  type SelectedCategory,
  type SummaryEvolutionResult,
  findCategoriesByTags,
  scoreCategoryMatch,
} from '../types/categories.js';
import type { Category, CategoryItem, EnhancedChunk, ChunkType, EntityTag } from '../types/memory.js';
import { MemoryMetadataStore, getMemoryMetadataStore } from './memoryMetadataStore.js';

/**
 * Configuration for the CategoryManager
 */
export interface CategoryManagerConfig {
  minRelevanceScore: number;
  maxCategoriesPerChunk: number;
  summaryMaxItems: number;
  useLLMForClassification: boolean;
  useLLMForSummaries: boolean;
  llmEndpoint?: string;
  llmApiKey?: string;
  llmModel?: string;
}

const DEFAULT_CONFIG: CategoryManagerConfig = {
  minRelevanceScore: 0.4,
  maxCategoriesPerChunk: 3,
  summaryMaxItems: 20,
  useLLMForClassification: false,
  useLLMForSummaries: false,
};

/**
 * Manages category organization and summary evolution
 * 
 * The CategoryManager provides:
 * - Automatic initialization of default categories
 * - Classification of chunks into relevant categories
 * - Evolving summaries that integrate new knowledge
 * - Query-based category selection for retrieval
 */
export class CategoryManager {
  private metadataStore: MemoryMetadataStore;
  private config: CategoryManagerConfig;
  private initialized: boolean = false;

  constructor(
    metadataStore?: MemoryMetadataStore,
    config?: Partial<CategoryManagerConfig>
  ) {
    this.metadataStore = metadataStore || getMemoryMetadataStore();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize default categories if they don't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const catDef of DEFAULT_CATEGORIES) {
      const existing = this.metadataStore.getCategoryByName(catDef.name);
      if (!existing) {
        const category: Partial<Category> & { id: string; name: string } = {
          id: `cat:${catDef.name}`,
          name: catDef.name,
          description: catDef.description,
          parentId: catDef.parentName ? `cat:${catDef.parentName}` : null,
          summary: '',
          chunkCount: 0,
        };
        this.metadataStore.upsertCategory(category);
      }
    }

    this.initialized = true;
  }

  /**
   * Classify a chunk into relevant categories
   */
  async classifyChunk(chunk: EnhancedChunk): Promise<CategoryClassification[]> {
    await this.initialize();

    if (this.config.useLLMForClassification) {
      return this.classifyWithLLM(chunk);
    }

    return this.classifyWithHeuristics(chunk);
  }

  /**
   * Heuristic-based classification using tags and content analysis
   */
  private classifyWithHeuristics(chunk: EnhancedChunk): CategoryClassification[] {
    const classifications: CategoryClassification[] = [];
    
    const contentTags = this.extractTagsFromChunk(chunk);
    
    for (const catDef of DEFAULT_CATEGORIES) {
      const score = scoreCategoryMatch(contentTags, catDef);
      
      if (score >= this.config.minRelevanceScore) {
        classifications.push({
          category: catDef.name,
          relevanceScore: score,
          reason: `Matched tags: ${catDef.tags.filter(t => 
            contentTags.some(ct => ct.toLowerCase().includes(t.toLowerCase()))
          ).join(', ')}`,
        });
      }
    }

    const keywordMatches = this.matchCategoriesByKeywords(chunk.content);
    for (const match of keywordMatches) {
      const existing = classifications.find(c => c.category === match.category);
      if (existing) {
        existing.relevanceScore = Math.min(1.0, existing.relevanceScore + match.relevanceScore * 0.3);
      } else if (match.relevanceScore >= this.config.minRelevanceScore) {
        classifications.push(match);
      }
    }

    return classifications
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.config.maxCategoriesPerChunk);
  }

  /**
   * LLM-based classification (when enabled)
   */
  private async classifyWithLLM(chunk: EnhancedChunk): Promise<CategoryClassification[]> {
    if (!this.config.llmEndpoint) {
      console.warn('LLM classification enabled but no endpoint configured, falling back to heuristics');
      return this.classifyWithHeuristics(chunk);
    }

    const categories = this.metadataStore.listCategories();
    
    const prompt = `Classify this knowledge item into one or more categories.

## Item
Type: ${chunk.chunkType}
Content: ${chunk.content.substring(0, 2000)}

## Available Categories
${categories.map(c => `- ${c.name}: ${c.description}`).join('\n')}

## Instructions
Return a JSON array of classifications:
[
  { "category": "category_name", "relevanceScore": 0.0-1.0, "reason": "brief reason" }
]

Only include categories with relevanceScore > ${this.config.minRelevanceScore}.
Maximum ${this.config.maxCategoriesPerChunk} categories.`;

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('LLM classification failed, falling back to heuristics:', error);
      return this.classifyWithHeuristics(chunk);
    }
  }

  /**
   * Add a chunk to a category
   */
  addToCategory(
    chunkId: string,
    categoryName: string,
    relevanceScore: number
  ): void {
    const category = this.metadataStore.getCategoryByName(categoryName);
    if (!category) {
      console.warn(`Category not found: ${categoryName}`);
      return;
    }

    this.metadataStore.assignChunkToCategory(chunkId, category.id, relevanceScore);
  }

  /**
   * Classify and add a chunk to all relevant categories
   */
  async classifyAndAssign(chunk: EnhancedChunk): Promise<CategoryClassification[]> {
    const classifications = await this.classifyChunk(chunk);
    
    for (const classification of classifications) {
      this.addToCategory(chunk.id, classification.category, classification.relevanceScore);
    }

    return classifications;
  }

  /**
   * Get items in a category
   */
  getCategoryItems(
    categoryName: string,
    options: CategoryItemsOptions = {}
  ): CategoryItem[] {
    const category = this.metadataStore.getCategoryByName(categoryName);
    if (!category) return [];

    const allItems = this.metadataStore.getCategoryChunks(category.id);
    
    let items = allItems;

    if (options.minRelevance) {
      items = items.filter(item => item.relevanceScore >= options.minRelevance!);
    }

    if (options.since) {
      const sinceStr = options.since.toISOString();
      items = items.filter(item => item.assignedAt >= sinceStr);
    }

    if (options.sortBy === 'relevance') {
      items.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else {
      items.sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  /**
   * Evolve a category's summary with new items
   */
  async evolveSummary(categoryName: string): Promise<SummaryEvolutionResult | null> {
    const category = this.metadataStore.getCategoryByName(categoryName);
    if (!category) return null;

    const recentItems = this.getCategoryItems(categoryName, {
      limit: this.config.summaryMaxItems,
      sortBy: 'date',
    });

    if (recentItems.length === 0) {
      return {
        categoryName,
        previousSummary: category.summary,
        newSummary: category.summary,
        itemsIntegrated: 0,
        hadContradictions: false,
      };
    }

    const itemContents: string[] = [];
    for (const item of recentItems) {
      const metadata = this.metadataStore.getChunkMetadata(item.chunkId);
      if (metadata) {
        itemContents.push(`[${metadata.chunkType}] Relevance: ${item.relevanceScore.toFixed(2)}`);
      }
    }

    if (this.config.useLLMForSummaries && this.config.llmEndpoint) {
      return this.evolveSummaryWithLLM(category, itemContents);
    }

    return this.evolveSummaryWithHeuristics(category, recentItems);
  }

  /**
   * Heuristic-based summary evolution
   */
  private evolveSummaryWithHeuristics(
    category: Category,
    items: CategoryItem[]
  ): SummaryEvolutionResult {
    const previousSummary = category.summary;
    
    const chunkTypes = new Map<string, number>();
    for (const item of items) {
      const metadata = this.metadataStore.getChunkMetadata(item.chunkId);
      if (metadata) {
        const count = chunkTypes.get(metadata.chunkType) || 0;
        chunkTypes.set(metadata.chunkType, count + 1);
      }
    }

    const typeBreakdown = Array.from(chunkTypes.entries())
      .map(([type, count]) => `${count} ${type}(s)`)
      .join(', ');

    const avgRelevance = items.reduce((sum, i) => sum + i.relevanceScore, 0) / items.length;

    const newSummary = `## ${category.name}

**Items**: ${category.chunkCount}
**Recent**: ${items.length} items (${typeBreakdown})
**Avg Relevance**: ${avgRelevance.toFixed(2)}

${previousSummary ? `### Previous Summary\n${previousSummary}` : 'No previous summary.'}

*Last updated: ${new Date().toISOString()}*`;

    this.metadataStore.upsertCategory({
      ...category,
      summary: newSummary,
    });

    return {
      categoryName: category.name,
      previousSummary,
      newSummary,
      itemsIntegrated: items.length,
      hadContradictions: false,
    };
  }

  /**
   * LLM-based summary evolution
   */
  private async evolveSummaryWithLLM(
    category: Category,
    itemContents: string[]
  ): Promise<SummaryEvolutionResult> {
    const prompt = `You are a Memory Synchronisation Specialist.

## Category: ${category.name}
${category.description}

## Current Summary
${category.summary || 'No existing summary.'}

## New Items to Integrate (${itemContents.length} items)
${itemContents.slice(0, 10).join('\n')}
${itemContents.length > 10 ? `\n... and ${itemContents.length - 10} more items` : ''}

## Instructions
1. Update the summary to incorporate new information
2. If new items conflict with existing summary, update to reflect the latest state
3. Keep the summary concise but comprehensive (max 500 words)
4. Use markdown formatting
5. Focus on actionable knowledge, patterns, and decisions

Return ONLY the updated summary markdown.`;

    try {
      const newSummary = await this.callLLM(prompt);
      
      const hadContradictions = newSummary.toLowerCase().includes('previously') ||
                               newSummary.toLowerCase().includes('updated') ||
                               newSummary.toLowerCase().includes('changed from');

      this.metadataStore.upsertCategory({
        ...category,
        summary: newSummary,
      });

      return {
        categoryName: category.name,
        previousSummary: category.summary,
        newSummary,
        itemsIntegrated: itemContents.length,
        hadContradictions,
      };
    } catch (error) {
      console.error('LLM summary evolution failed:', error);
      return this.evolveSummaryWithHeuristics(category, []);
    }
  }

  /**
   * Get category summary for retrieval
   */
  getCategorySummary(categoryName: string): string | null {
    const category = this.metadataStore.getCategoryByName(categoryName);
    return category?.summary || null;
  }

  /**
   * Select categories most relevant to a query
   */
  async selectRelevantCategories(
    query: string,
    options: CategorySelectionOptions = {}
  ): Promise<SelectedCategory[]> {
    await this.initialize();

    const maxCategories = options.maxCategories ?? 3;
    const minItemCount = options.minItemCount ?? 1;
    
    const categories = this.metadataStore.listCategories()
      .filter(c => c.chunkCount >= minItemCount);

    if (categories.length === 0) return [];

    if (this.config.useLLMForClassification && this.config.llmEndpoint) {
      return this.selectCategoriesWithLLM(query, categories, options);
    }

    return this.selectCategoriesWithHeuristics(query, categories, options);
  }

  /**
   * Heuristic-based category selection
   */
  private selectCategoriesWithHeuristics(
    query: string,
    categories: Category[],
    options: CategorySelectionOptions
  ): SelectedCategory[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    const scored: SelectedCategory[] = [];

    for (const category of categories) {
      const catDef = DEFAULT_CATEGORIES.find(c => c.name === category.name);
      if (!catDef) continue;

      let relevance = 0;
      
      for (const word of queryWords) {
        if (catDef.name.includes(word)) relevance += 0.3;
        if (catDef.description.toLowerCase().includes(word)) relevance += 0.2;
        if (catDef.tags.some(t => t.includes(word) || word.includes(t))) relevance += 0.25;
      }

      if (relevance > 0) {
        scored.push({
          name: category.name,
          relevance: Math.min(1.0, relevance),
          summary: options.includeSummaries ? category.summary : undefined,
          itemCount: category.chunkCount,
        });
      }
    }

    return scored
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, options.maxCategories ?? 3);
  }

  /**
   * LLM-based category selection
   */
  private async selectCategoriesWithLLM(
    query: string,
    categories: Category[],
    options: CategorySelectionOptions
  ): Promise<SelectedCategory[]> {
    const prompt = `Query: ${query}

Available Categories:
${categories.map(c => `- ${c.name}: ${c.description} (${c.chunkCount} items)`).join('\n')}

Return a JSON array of the ${options.maxCategories ?? 3} most relevant category names:
["category1", "category2", ...]

Only include categories clearly relevant to the query.`;

    try {
      const response = await this.callLLM(prompt);
      const names = JSON.parse(response) as string[];
      
      const results: SelectedCategory[] = [];
      for (const name of names) {
        const cat = categories.find(c => c.name === name);
        if (cat) {
          results.push({
            name: cat.name,
            relevance: 0.8,
            summary: options.includeSummaries ? cat.summary : undefined,
            itemCount: cat.chunkCount,
          });
        }
      }
      return results;
    } catch (error) {
      console.error('LLM category selection failed:', error);
      return this.selectCategoriesWithHeuristics(query, categories, options);
    }
  }

  /**
   * Get all categories with statistics
   */
  getAllCategoriesWithStats(): CategoryWithStats[] {
    const categories = this.metadataStore.listCategories();
    
    return categories.map(cat => {
      const catDef = DEFAULT_CATEGORIES.find(c => c.name === cat.name);
      const items = this.getCategoryItems(cat.name, { limit: 100 });
      const avgRelevance = items.length > 0
        ? items.reduce((sum, i) => sum + i.relevanceScore, 0) / items.length
        : 0;

      return {
        ...cat,
        recentItemCount: items.length,
        avgRelevanceScore: avgRelevance,
        topTags: catDef?.tags.slice(0, 5) ?? [],
      };
    });
  }

  /**
   * Create a custom category
   */
  createCategory(definition: CategoryDefinition): Category {
    const category: Partial<Category> & { id: string; name: string } = {
      id: `cat:${definition.name}`,
      name: definition.name,
      description: definition.description,
      parentId: definition.parentName ? `cat:${definition.parentName}` : null,
      summary: '',
      chunkCount: 0,
    };

    this.metadataStore.upsertCategory(category);
    
    return this.metadataStore.getCategoryByName(definition.name)!;
  }

  /**
   * Extract tags from a chunk for classification
   */
  private extractTagsFromChunk(chunk: EnhancedChunk): string[] {
    const tags: string[] = [];

    if (chunk.entities) {
      for (const entity of chunk.entities) {
        tags.push(entity.value.toLowerCase());
      }
    }

    const content = chunk.content.toLowerCase();
    
    const techPatterns = [
      /\b(typescript|javascript|python|php|java|go|rust|ruby)\b/gi,
      /\b(react|vue|angular|svelte|next\.?js|nuxt)\b/gi,
      /\b(postgresql|mysql|sqlite|mongodb|redis|elasticsearch)\b/gi,
      /\b(docker|kubernetes|aws|gcp|azure|vercel|cloudflare)\b/gi,
      /\b(api|rest|graphql|grpc|websocket)\b/gi,
      /\b(test|spec|mock|fixture|coverage)\b/gi,
      /\b(auth|login|session|jwt|oauth|token)\b/gi,
      /\b(cache|performance|optimize|speed)\b/gi,
      /\b(error|bug|fix|debug|issue|exception)\b/gi,
      /\b(deploy|ci|cd|pipeline|build)\b/gi,
    ];

    for (const pattern of techPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        tags.push(...matches.map(m => m.toLowerCase()));
      }
    }

    return [...new Set(tags)];
  }

  /**
   * Match categories by keyword presence in content
   */
  private matchCategoriesByKeywords(content: string): CategoryClassification[] {
    const contentLower = content.toLowerCase();
    const classifications: CategoryClassification[] = [];

    const keywordMap: Record<string, { category: string; weight: number }[]> = {
      'authentication': [{ category: 'authentication', weight: 0.8 }],
      'login': [{ category: 'authentication', weight: 0.7 }],
      'password': [{ category: 'authentication', weight: 0.6 }],
      'jwt': [{ category: 'authentication', weight: 0.8 }],
      'oauth': [{ category: 'authentication', weight: 0.8 }],
      'database': [{ category: 'database', weight: 0.8 }],
      'query': [{ category: 'database', weight: 0.5 }],
      'migration': [{ category: 'database', weight: 0.7 }],
      'sql': [{ category: 'database', weight: 0.7 }],
      'api': [{ category: 'api', weight: 0.7 }],
      'endpoint': [{ category: 'api', weight: 0.7 }],
      'rest': [{ category: 'api', weight: 0.7 }],
      'graphql': [{ category: 'api', weight: 0.8 }],
      'test': [{ category: 'testing', weight: 0.6 }],
      'spec': [{ category: 'testing', weight: 0.6 }],
      'mock': [{ category: 'testing', weight: 0.7 }],
      'assert': [{ category: 'testing', weight: 0.7 }],
      'component': [{ category: 'frontend', weight: 0.6 }],
      'css': [{ category: 'frontend', weight: 0.7 }],
      'style': [{ category: 'frontend', weight: 0.5 }],
      'docker': [{ category: 'devops', weight: 0.8 }],
      'deploy': [{ category: 'devops', weight: 0.7 }],
      'ci/cd': [{ category: 'devops', weight: 0.8 }],
      'kubernetes': [{ category: 'devops', weight: 0.8 }],
      'pattern': [{ category: 'architecture', weight: 0.6 }],
      'architecture': [{ category: 'architecture', weight: 0.8 }],
      'design': [{ category: 'architecture', weight: 0.5 }],
      'performance': [{ category: 'performance', weight: 0.8 }],
      'cache': [{ category: 'performance', weight: 0.7 }],
      'optimize': [{ category: 'performance', weight: 0.7 }],
      'error': [{ category: 'debugging', weight: 0.6 }],
      'bug': [{ category: 'debugging', weight: 0.7 }],
      'fix': [{ category: 'debugging', weight: 0.5 }],
      'debug': [{ category: 'debugging', weight: 0.8 }],
      'convention': [{ category: 'standards', weight: 0.7 }],
      'standard': [{ category: 'standards', weight: 0.7 }],
      'best practice': [{ category: 'standards', weight: 0.8 }],
    };

    const categoryScores = new Map<string, { score: number; reasons: string[] }>();

    for (const [keyword, mappings] of Object.entries(keywordMap)) {
      if (contentLower.includes(keyword)) {
        for (const mapping of mappings) {
          const existing = categoryScores.get(mapping.category) || { score: 0, reasons: [] };
          existing.score += mapping.weight;
          existing.reasons.push(keyword);
          categoryScores.set(mapping.category, existing);
        }
      }
    }

    for (const [category, data] of categoryScores) {
      const normalizedScore = Math.min(1.0, data.score / 2);
      if (normalizedScore >= this.config.minRelevanceScore) {
        classifications.push({
          category,
          relevanceScore: normalizedScore,
          reason: `Keywords: ${data.reasons.slice(0, 3).join(', ')}`,
        });
      }
    }

    return classifications;
  }

  /**
   * Call LLM endpoint
   */
  private async callLLM(prompt: string): Promise<string> {
    if (!this.config.llmEndpoint) {
      throw new Error('LLM endpoint not configured');
    }

    const response = await fetch(this.config.llmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.llmApiKey && { 'Authorization': `Bearer ${this.config.llmApiKey}` }),
      },
      body: JSON.stringify({
        model: this.config.llmModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }
}

let instance: CategoryManager | null = null;

export function getCategoryManager(
  metadataStore?: MemoryMetadataStore,
  config?: Partial<CategoryManagerConfig>
): CategoryManager {
  if (!instance) {
    instance = new CategoryManager(metadataStore, config);
  }
  return instance;
}

export function resetCategoryManager(): void {
  instance = null;
}
