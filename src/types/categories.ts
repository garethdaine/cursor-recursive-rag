/**
 * Category Types for Hierarchical Memory Organization
 * 
 * Categories provide a way to group related knowledge items and maintain
 * evolving summaries that capture the essence of each topic area.
 */

import type { Category, CategoryItem } from './memory.js';

// Re-export base types
export type { Category, CategoryItem };

/**
 * Extended category with display and metadata fields
 */
export interface ExtendedCategory extends Category {
  displayName: string;
  tags: string[];
  isDefault: boolean;
  summaryUpdatedAt: string | null;
  lastItemAddedAt: string | null;
}

/**
 * Category definition for creating default categories
 */
export interface CategoryDefinition {
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  parentName?: string;
}

/**
 * Result of classifying a chunk into categories
 */
export interface CategoryClassification {
  category: string;
  relevanceScore: number;
  reason: string;
}

/**
 * Options for listing category items
 */
export interface CategoryItemsOptions {
  limit?: number;
  since?: Date;
  minRelevance?: number;
  sortBy?: 'relevance' | 'date';
}

/**
 * Category with item count and recent activity
 */
export interface CategoryWithStats extends Category {
  recentItemCount: number;
  avgRelevanceScore: number;
  topTags: string[];
}

/**
 * Options for selecting relevant categories for a query
 */
export interface CategorySelectionOptions {
  maxCategories?: number;
  minItemCount?: number;
  includeSummaries?: boolean;
}

/**
 * Result of category selection for a query
 */
export interface SelectedCategory {
  name: string;
  relevance: number;
  summary?: string;
  itemCount: number;
}

/**
 * Summary evolution result
 */
export interface SummaryEvolutionResult {
  categoryName: string;
  previousSummary: string;
  newSummary: string;
  itemsIntegrated: number;
  hadContradictions: boolean;
}

/**
 * Predefined categories for common knowledge types
 */
export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  {
    name: 'authentication',
    displayName: 'Authentication',
    description: 'Login, sessions, JWT, OAuth, API keys, security tokens',
    tags: ['auth', 'security', 'login', 'jwt', 'oauth', 'session', 'token'],
  },
  {
    name: 'database',
    displayName: 'Database',
    description: 'Queries, migrations, models, relationships, ORM, schema design',
    tags: ['sql', 'database', 'query', 'migration', 'model', 'orm', 'schema'],
  },
  {
    name: 'api',
    displayName: 'API',
    description: 'REST, GraphQL, endpoints, requests, responses, webhooks',
    tags: ['api', 'rest', 'graphql', 'endpoint', 'http', 'webhook', 'request'],
  },
  {
    name: 'testing',
    displayName: 'Testing',
    description: 'Unit tests, integration tests, E2E, mocking, fixtures, coverage',
    tags: ['test', 'testing', 'mock', 'fixture', 'assertion', 'coverage', 'e2e'],
  },
  {
    name: 'frontend',
    displayName: 'Frontend',
    description: 'UI components, styling, state management, routing, forms',
    tags: ['ui', 'component', 'style', 'css', 'state', 'vue', 'react', 'form'],
  },
  {
    name: 'devops',
    displayName: 'DevOps',
    description: 'Deployment, CI/CD, Docker, Kubernetes, infrastructure, monitoring',
    tags: ['deploy', 'docker', 'ci', 'cd', 'infrastructure', 'kubernetes', 'monitor'],
  },
  {
    name: 'architecture',
    displayName: 'Architecture',
    description: 'Design patterns, system design, decisions, microservices, modules',
    tags: ['pattern', 'architecture', 'design', 'structure', 'microservice', 'module'],
  },
  {
    name: 'performance',
    displayName: 'Performance',
    description: 'Optimization, caching, profiling, memory, speed, scaling',
    tags: ['performance', 'optimization', 'cache', 'speed', 'memory', 'scale', 'profile'],
  },
  {
    name: 'debugging',
    displayName: 'Debugging',
    description: 'Error resolution, troubleshooting, fixes, logging, stack traces',
    tags: ['bug', 'error', 'fix', 'debug', 'issue', 'log', 'trace', 'troubleshoot'],
  },
  {
    name: 'standards',
    displayName: 'Standards',
    description: 'Coding standards, conventions, best practices, linting, formatting',
    tags: ['standard', 'convention', 'practice', 'guideline', 'lint', 'format', 'style'],
  },
];

/**
 * Get a default category by name
 */
export function getDefaultCategory(name: string): CategoryDefinition | undefined {
  return DEFAULT_CATEGORIES.find(c => c.name === name);
}

/**
 * Check if a category name is a default category
 */
export function isDefaultCategory(name: string): boolean {
  return DEFAULT_CATEGORIES.some(c => c.name === name);
}

/**
 * Get all default category names
 */
export function getDefaultCategoryNames(): string[] {
  return DEFAULT_CATEGORIES.map(c => c.name);
}

/**
 * Find categories that match given tags
 */
export function findCategoriesByTags(tags: string[]): CategoryDefinition[] {
  const lowerTags = tags.map(t => t.toLowerCase());
  return DEFAULT_CATEGORIES.filter(cat => 
    cat.tags.some(catTag => lowerTags.includes(catTag.toLowerCase()))
  );
}

/**
 * Score how well content matches a category based on tag overlap
 */
export function scoreCategoryMatch(
  contentTags: string[],
  category: CategoryDefinition
): number {
  if (contentTags.length === 0) return 0;
  
  const lowerContentTags = contentTags.map(t => t.toLowerCase());
  const lowerCategoryTags = category.tags.map(t => t.toLowerCase());
  
  const matches = lowerContentTags.filter(tag => 
    lowerCategoryTags.some(catTag => 
      tag.includes(catTag) || catTag.includes(tag)
    )
  );
  
  return matches.length / Math.max(contentTags.length, 1);
}
