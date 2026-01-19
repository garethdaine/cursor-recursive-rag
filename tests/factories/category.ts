import type { Category, CategoryItem } from '../../src/types/memory.js';

let categoryCounter = 0;
let categoryItemCounter = 0;

export interface CategoryFactoryOptions {
  id?: string;
  name?: string;
  description?: string;
  parentId?: string | null;
  summary?: string;
  chunkCount?: number;
  createdAt?: string;
  lastUpdated?: string;
}

export function createCategory(options: CategoryFactoryOptions = {}): Category {
  categoryCounter++;
  const now = new Date().toISOString();

  return {
    id: options.id ?? `cat-${categoryCounter}`,
    name: options.name ?? `Category ${categoryCounter}`,
    description: options.description ?? `Description for category ${categoryCounter}`,
    parentId: options.parentId ?? null,
    summary: options.summary ?? '',
    chunkCount: options.chunkCount ?? 0,
    lastUpdated: options.lastUpdated ?? now,
    createdAt: options.createdAt ?? now,
  };
}

export interface CategoryItemFactoryOptions {
  id?: string;
  chunkId?: string;
  categoryId?: string;
  relevanceScore?: number;
  assignedAt?: string;
}

export function createCategoryItem(options: CategoryItemFactoryOptions = {}): CategoryItem {
  categoryItemCounter++;
  const now = new Date().toISOString();

  return {
    id: options.id ?? `cat-item-${categoryItemCounter}`,
    chunkId: options.chunkId ?? `chunk-${categoryItemCounter}`,
    categoryId: options.categoryId ?? `cat-${categoryItemCounter}`,
    relevanceScore: options.relevanceScore ?? 1.0,
    assignedAt: options.assignedAt ?? now,
  };
}

export function createCategoryHierarchy(depth: number = 3): Category[] {
  const categories: Category[] = [];
  let parentId: string | null = null;

  for (let i = 0; i < depth; i++) {
    const category = createCategory({
      name: `Level ${i + 1} Category`,
      parentId,
    });
    categories.push(category);
    parentId = category.id;
  }

  return categories;
}

export function createTechCategories(): Category[] {
  return [
    createCategory({ name: 'Frontend', description: 'Frontend development patterns and solutions' }),
    createCategory({ name: 'Backend', description: 'Backend development patterns and solutions' }),
    createCategory({ name: 'Database', description: 'Database schemas, queries, and optimization' }),
    createCategory({ name: 'DevOps', description: 'Deployment, CI/CD, and infrastructure' }),
    createCategory({ name: 'Testing', description: 'Testing strategies and test implementations' }),
    createCategory({ name: 'Security', description: 'Security best practices and vulnerabilities' }),
    createCategory({ name: 'Performance', description: 'Performance optimization techniques' }),
    createCategory({ name: 'Architecture', description: 'System and software architecture decisions' }),
  ];
}

export function createCategoryWithItems(
  categoryOptions: CategoryFactoryOptions = {},
  itemCount: number = 5
): { category: Category; items: CategoryItem[] } {
  const category = createCategory(categoryOptions);
  const items: CategoryItem[] = [];

  for (let i = 0; i < itemCount; i++) {
    items.push(createCategoryItem({
      categoryId: category.id,
      chunkId: `chunk-for-${category.id}-${i}`,
      relevanceScore: 1 - (i * 0.1),
    }));
  }

  category.chunkCount = items.length;

  return { category, items };
}

export function resetCategoryCounters(): void {
  categoryCounter = 0;
  categoryItemCounter = 0;
}
