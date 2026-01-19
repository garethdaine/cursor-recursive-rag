# Testing Guide for cursor-recursive-rag

This document describes the testing strategy, structure, and conventions used in the cursor-recursive-rag project.

## Overview

The project uses [Vitest](https://vitest.dev/) as the test framework, providing:
- Fast execution with native ESM support
- Jest-compatible API
- Built-in TypeScript support
- Code coverage with v8 provider

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── mocks/                      # Mock implementations
│   ├── database.ts             # Mock database adapter
│   ├── embeddings.ts           # Mock embeddings adapter
│   ├── llmProvider.ts          # Mock LLM provider
│   ├── vectorStore.ts          # Mock vector store
│   └── index.ts                # Mock exports
├── factories/                  # Test data factories
│   ├── category.ts             # Category factory
│   ├── chunk.ts                # Chunk/document factory
│   ├── conversation.ts         # Conversation factory
│   ├── knowledge.ts            # Extracted knowledge factory
│   ├── relationship.ts         # Relationship factory
│   └── index.ts                # Factory exports
├── fixtures/                   # Static test data
│   ├── conversations.ts        # Sample conversations
│   ├── documents.ts            # Sample documents
│   └── index.ts                # Fixture exports
├── unit/                       # Unit tests
│   ├── adapters/               # Adapter tests
│   ├── services/               # Service tests
│   └── types/                  # Type/interface tests
├── integration/                # Integration tests
│   ├── vector-metadata.test.ts # Vector + metadata store integration
│   ├── knowledge-pipeline.test.ts # Knowledge extraction pipeline
│   ├── cli/                    # CLI command tests
│   └── mcp/                    # MCP server/tools tests
└── e2e/                        # End-to-end tests (Playwright)
    ├── dashboard/              # Dashboard UI tests
    │   └── dashboard-ui.test.ts
    └── flows/                  # Full user flow tests
        └── user-flows.test.ts
```

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test File

```bash
npm test -- tests/unit/services/chunker.test.ts
```

### Tests Matching Pattern

```bash
npm test -- --grep "DecayCalculator"
```

### Unit Tests Only

```bash
npm run test:unit
```

### With Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run test:watch
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Show HTML report
npm run test:e2e:report
```

## Test Categories

### Unit Tests

Unit tests focus on isolated components with mocked dependencies.

**Location**: `tests/unit/`

**Conventions**:
- Test files match source files: `src/services/chunker.ts` → `tests/unit/services/chunker.test.ts`
- One `describe` block per class/function
- Use mock adapters for external dependencies

**Example**:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DecayCalculator } from '../../src/services/decayCalculator.js';

describe('DecayCalculator', () => {
  let calculator: DecayCalculator;

  beforeEach(() => {
    calculator = new DecayCalculator();
  });

  it('should return high score for new chunks', () => {
    const chunk = createChunkMetadata({ createdAt: new Date().toISOString() });
    const score = calculator.calculateDecayScore(chunk);
    expect(score).toBeGreaterThan(0.8);
  });
});
```

### Integration Tests

Integration tests verify component interactions without mocking internal dependencies.

**Location**: `tests/integration/`

**Conventions**:
- Use real implementations where possible
- Use temporary directories for file-based tests
- Clean up resources in `afterEach`

**Key Integration Tests**:

1. **Vector + Metadata Store** (`vector-metadata.test.ts`)
   - Tests EnhancedVectorStore with MemoryMetadataStore
   - Verifies hybrid scoring, decay updates, filtering

2. **Knowledge Pipeline** (`knowledge-pipeline.test.ts`)
   - Tests ConversationProcessor → KnowledgeExtractor → KnowledgeStorage
   - Verifies end-to-end conversation processing

3. **CLI Commands** (`cli/cli-commands.test.ts`)
   - Tests CLI help output and argument validation
   - Spawns actual Node processes

4. **MCP Tools** (`mcp/mcp-tools.test.ts`)
   - Tests search, ingest, and list-sources tools
   - Verifies MCP response format

### E2E Tests

E2E tests use [Playwright](https://playwright.dev/) and test the full dashboard web interface.

**Location**: `tests/e2e/`

**Configuration**: `playwright.config.ts`

**Key E2E Tests**:

1. **Dashboard UI** (`e2e/dashboard/dashboard-ui.test.ts`)
   - Dashboard loads without errors
   - Search form submits and displays results
   - Activity log displays recent operations
   - Statistics cards show correct data
   - Navigation between tabs works
   - Responsive layout on mobile viewport
   - Error states displayed correctly

2. **User Flows** (`e2e/flows/user-flows.test.ts`)
   - Flow: Search → View results
   - Flow: Dashboard search → Click result → View details
   - Flow: MCP Gateway tools browsing
   - Flow: Settings configuration
   - Flow: Activity log monitoring
   - Performance: Dashboard load time
   - API integration tests

## Mocks

### Mock Embeddings Adapter

```typescript
import { createMockEmbeddingsAdapter } from './mocks/embeddings.js';

const embedder = createMockEmbeddingsAdapter({
  dimension: 384,  // Optional: embedding dimension
});

const embedding = await embedder.embed('text');
```

The mock embedder generates deterministic embeddings based on text hash.

### Mock Vector Store

```typescript
import { createMockVectorStore } from './mocks/vectorStore.js';

const store = createMockVectorStore({
  initialChunks: [/* pre-populated chunks */],
});

await store.upsert({ id: '1', content: 'text', embedding: [...] });
```

### Mock LLM Provider

```typescript
import { createMockLLMProvider } from './mocks/llmProvider.js';

const llm = createMockLLMProvider({
  responses: ['Response 1', 'Response 2'],  // Queued responses
});
```

## Factories

Factories create test data with sensible defaults and customization.

### Chunk Factory

```typescript
import { createEnhancedChunk, createChunkMetadata } from './factories/chunk.js';

const chunk = createEnhancedChunk({
  content: 'Custom content',
  importance: 0.9,
});

const metadata = createChunkMetadata({
  decayScore: 0.5,
});
```

### Conversation Factory

```typescript
import { createConversation, createConversationMessage } from './factories/conversation.js';

const conversation = createConversation({
  messages: [
    createConversationMessage({ role: 'user', content: 'Question?' }),
    createConversationMessage({ role: 'assistant', content: 'Answer.' }),
  ],
});
```

### Relationship Factory

```typescript
import { createRelationship } from './factories/relationship.js';

const relationship = createRelationship({
  sourceChunkId: 'chunk-1',
  targetChunkId: 'chunk-2',
  relationshipType: 'relates_to',
  strength: 0.8,
});
```

## Fixtures

Fixtures provide realistic sample data for testing.

```typescript
import { DEBUG_SESSION_CONVERSATION, ALL_CONVERSATIONS } from './fixtures/conversations.js';
import { MARKDOWN_DOCUMENT, CODE_DOCUMENT } from './fixtures/documents.js';
```

## Test Conventions

### Naming

- Test files: `*.test.ts`
- Describe blocks: Class/function name
- It blocks: "should [expected behavior]"

### Assertions

```typescript
// Prefer specific assertions
expect(result).toBe(expected);
expect(array).toHaveLength(3);
expect(object).toHaveProperty('key', 'value');

// Use matchers for flexibility
expect(score).toBeGreaterThan(0);
expect(score).toBeLessThanOrEqual(1);
expect(text).toMatch(/pattern/);
expect(text).toContain('substring');

// For floating point
expect(score).toBeCloseTo(0.5, 2);
```

### Async Tests

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Error Testing

```typescript
it('should throw on invalid input', async () => {
  await expect(asyncFn()).rejects.toThrow('error message');
});

it('should throw on invalid input (sync)', () => {
  expect(() => syncFn()).toThrow('error message');
});
```

## Coverage

Coverage is configured in `vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  reportsDirectory: './coverage',
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.d.ts', 'src/**/index.ts', 'src/cli/**'],
  thresholds: {
    statements: 70,
    branches: 70,
    functions: 70,
    lines: 70,
  },
}
```

Generate coverage report:

```bash
npm run test:coverage
```

View HTML report:

```bash
open coverage/index.html
```

## Test Categories Summary

| Category | Location | Count | Purpose |
|----------|----------|-------|---------|
| Unit - Types | `tests/unit/types/` | 87 | Type definitions and utilities |
| Unit - Services | `tests/unit/services/` | 123 | Core service logic |
| Unit - Adapters | `tests/unit/adapters/` | 25 | Adapter implementations |
| Integration - Vector/Metadata | `tests/integration/` | 30 | Store integrations |
| Integration - Knowledge | `tests/integration/` | 19 | Knowledge pipeline |
| Integration - CLI | `tests/integration/cli/` | 19 | CLI commands |
| Integration - MCP | `tests/integration/mcp/` | 22 | MCP tools |
| E2E - Dashboard UI | `tests/e2e/dashboard/` | 18 | Dashboard interface tests |
| E2E - User Flows | `tests/e2e/flows/` | 30 | Complete user workflows |

**Total**: 350+ tests

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch

CI configuration expects:
- All tests to pass
- Coverage thresholds met
- No TypeScript errors

## E2E Testing with Playwright

### Configuration

E2E tests are configured in `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 12'] } },
  ],
  webServer: {
    command: 'npm run build && node dist/cli/index.js dashboard --port 3333',
    url: 'http://localhost:3333',
  },
});
```

### Running E2E Tests

```bash
# Run all E2E tests (starts dashboard automatically)
npm run test:e2e

# Interactive UI mode for debugging
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Run specific test file
npx playwright test tests/e2e/dashboard/dashboard-ui.test.ts

# Run tests matching pattern
npx playwright test --grep "Dashboard Loading"
```

### E2E Test Patterns

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should perform action', async ({ page }) => {
    await page.goto('/');
    await page.click('#nav-search');
    await expect(page.locator('#tab-search')).toBeVisible();
  });
});
```

### Debugging E2E Tests

```bash
# Run with debug mode
npx playwright test --debug

# View test report
npm run test:e2e:report

# View trace files
npx playwright show-trace test-results/*/trace.zip
```

## Troubleshooting

### SQLite Tests Failing

If tests involving SQLite fail with locking errors:

```bash
# Clean up any stale databases
rm -rf /tmp/test-*
```

### Memory Issues

For large test suites:

```bash
# Run with increased memory
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

### Isolation Issues

If tests affect each other:

```typescript
// Ensure cleanup in afterEach
afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});
```

### E2E Tests Failing

**Dashboard not starting:**
```bash
# Build the project first
npm run build

# Start dashboard manually to debug
node dist/cli/index.js dashboard --port 3333
```

**Browser not launching:**
```bash
# Reinstall Playwright browsers
npx playwright install chromium
```

**Port already in use:**
```bash
# Kill process on port 3333
lsof -ti:3333 | xargs kill -9

# Or use a different port in tests
PLAYWRIGHT_BASE_URL=http://localhost:3334 npm run test:e2e
```

**Tests timing out:**
- Increase timeout in `playwright.config.ts`
- Check if dashboard is responding: `curl http://localhost:3333/api/health`
- Run with `--headed` to see what's happening
