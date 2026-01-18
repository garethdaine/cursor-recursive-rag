# Contributing to cursor-recursive-rag

Thank you for your interest in contributing to cursor-recursive-rag! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Please:

- Be respectful and considerate in all interactions
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Accept responsibility for mistakes and learn from them

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** or **pnpm**
- **Git**
- **TypeScript** knowledge

### Optional (for full feature testing)

- **Docker** (for Qdrant local testing)
- **Firecrawl API key** (for web crawling)
- **OpenAI API key** (for OpenAI embeddings)
- **Ollama** (for local embeddings)
- **MCP Gateway** (for gateway integration testing)

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone git@github.com:YOUR_USERNAME/cursor-recursive-rag.git
cd cursor-recursive-rag
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Project

```bash
npm run build
```

### 4. Link for Local Development

```bash
npm link
```

Now you can use `cursor-rag` commands globally during development.

### 5. Run in Development Mode

```bash
npm run dev
```

This watches for file changes and rebuilds automatically.

### 6. Set Up Test Configuration

```bash
cursor-rag setup
```

Choose local options (ChromaDB + Xenova) for development without external dependencies.

## Project Structure

```
cursor-recursive-rag/
├── bin/                    # CLI entry point
│   └── cursor-rag.js
├── src/
│   ├── adapters/           # Pluggable backends
│   │   ├── embeddings/     # Embedding model adapters
│   │   │   ├── index.ts    # Factory function
│   │   │   ├── xenova.ts   # Local transformers.js
│   │   │   ├── openai.ts   # OpenAI API
│   │   │   └── ollama.ts   # Ollama local
│   │   └── vector/         # Vector store adapters
│   │       ├── index.ts    # Factory function
│   │       ├── chroma.ts   # ChromaDB
│   │       ├── qdrant.ts   # Qdrant
│   │       └── vectorize.ts # Cloudflare (placeholder)
│   ├── cli/                # CLI implementation
│   │   ├── index.ts        # Main CLI entry
│   │   └── commands/       # Individual commands
│   │       ├── setup.ts    # Interactive setup
│   │       ├── ingest.ts   # Document ingestion
│   │       ├── search.ts   # Search testing
│   │       ├── status.ts   # Configuration status
│   │       └── dashboard.ts # Web dashboard
│   ├── dashboard/          # Web dashboard
│   │   ├── server.ts       # HTTP server
│   │   └── public/         # Static assets
│   │       └── index.html  # Dashboard UI
│   ├── integrations/       # External integrations
│   │   ├── index.ts
│   │   ├── mcp-gateway.ts  # MCP Gateway client
│   │   └── openskills.ts   # OpenSkills client
│   ├── proxy/              # Proxy support
│   │   └── index.ts        # Proxy manager
│   ├── server/             # MCP server
│   │   ├── index.ts        # Server entry
│   │   └── tools/          # MCP tools
│   │       ├── index.ts    # Tool registration
│   │       ├── recursive-query.ts
│   │       ├── search.ts
│   │       ├── ingest.ts
│   │       ├── crawl.ts
│   │       ├── list-sources.ts
│   │       ├── gateway.ts  # Gateway tools
│   │       └── skills.ts   # OpenSkills tools
│   ├── services/           # Core services
│   │   ├── config.ts       # Configuration management
│   │   ├── chunker.ts      # Document chunking
│   │   └── query-decomposer.ts # Query processing
│   └── types/              # TypeScript types
│       └── index.ts
├── dist/                   # Compiled output (git-ignored)
├── package.json
├── tsconfig.json
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

## Development Workflow

### Branch Naming

Use descriptive branch names:

- `feature/add-pinecone-adapter` - New features
- `fix/chunker-overlap-bug` - Bug fixes
- `docs/update-readme` - Documentation
- `refactor/simplify-config` - Code refactoring
- `chore/update-dependencies` - Maintenance

### Making Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards below

3. **Build and test** your changes:
   ```bash
   npm run build
   cursor-rag --version  # Verify it works
   ```

4. **Commit** following the commit guidelines

5. **Push** and create a pull request

## Coding Standards

### TypeScript Guidelines

- Use **TypeScript** for all new code
- Enable **strict mode** (already configured in tsconfig.json)
- Prefer **interfaces** over type aliases for object shapes
- Use **explicit return types** for public functions
- Avoid `any` - use `unknown` and type guards instead

### Code Style

- Use **2 spaces** for indentation
- Use **single quotes** for strings
- Add **trailing commas** in multi-line arrays/objects
- Keep lines under **100 characters** when practical
- Use **descriptive variable names**

### File Organization

- One primary export per file
- Group related functionality in directories
- Use `index.ts` files for public API exports
- Keep files focused and under 300 lines when possible

### Error Handling

- Use **custom error classes** for domain-specific errors
- Always provide **meaningful error messages**
- Log errors with context for debugging
- Handle errors gracefully in CLI commands

### Comments

- Write **self-documenting code** first
- Add comments for **non-obvious logic**
- Use **JSDoc** for public API functions
- Keep comments up-to-date with code changes

### Example Code Style

```typescript
import type { RAGConfig } from '../types/index.js';

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  respectBoundaries?: boolean;
}

/**
 * Chunks a document into smaller pieces for embedding.
 * 
 * @param text - The document text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks with metadata
 */
export function chunkDocument(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const {
    chunkSize = 512,
    chunkOverlap = 50,
    respectBoundaries = true,
  } = options;

  // Implementation...
}
```

## Testing

### Manual Testing

Currently, the project relies on manual testing. When making changes:

1. **Build the project**: `npm run build`
2. **Test CLI commands**:
   ```bash
   cursor-rag setup
   cursor-rag status
   cursor-rag ingest ./README.md
   cursor-rag search "how to configure"
   cursor-rag dashboard
   ```
3. **Test MCP server**: Connect from Cursor IDE and verify tools work

### Adding Tests (Future)

We plan to add automated tests. If you'd like to contribute:

- Use **Vitest** for unit tests
- Use **Playwright** for E2E dashboard tests
- Place tests in `__tests__` directories or `.test.ts` files
- Aim for good coverage of critical paths

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (deps, build, etc.) |

### Scopes (optional)

- `cli` - CLI commands
- `server` - MCP server
- `dashboard` - Web dashboard
- `adapters` - Vector/embedding adapters
- `integrations` - External integrations
- `config` - Configuration

### Examples

```bash
feat(adapters): add Pinecone vector store adapter

fix(cli): handle missing config file gracefully

docs: update installation instructions

chore(deps): update @modelcontextprotocol/sdk to v1.1.0
```

### Breaking Changes

For breaking changes, add `!` after the type/scope and include `BREAKING CHANGE:` in the footer:

```
feat(config)!: change config file location

BREAKING CHANGE: Config now stored in ~/.cursor-rag/ instead of ~/.cursor/
```

## Pull Request Process

### Before Submitting

1. **Ensure your code builds**: `npm run build`
2. **Test your changes** manually
3. **Update documentation** if needed (README, CHANGELOG)
4. **Rebase on latest main** if needed

### PR Title

Use the same format as commit messages:

```
feat(adapters): add Pinecone vector store adapter
```

### PR Description Template

```markdown
## Summary

Brief description of the changes.

## Changes

- Added X
- Fixed Y
- Updated Z

## Testing

How did you test these changes?

## Checklist

- [ ] Code builds without errors
- [ ] Changes tested manually
- [ ] Documentation updated (if needed)
- [ ] CHANGELOG updated (for features/fixes)
```

### Review Process

1. **Automated checks** must pass (build, lint)
2. **At least one maintainer** reviews the PR
3. **Address feedback** through additional commits or amendments
4. **Squash and merge** when approved

## Release Process

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.2.0): New features (backward compatible)
- **PATCH** (0.2.1): Bug fixes (backward compatible)
- **Pre-release** (0.2.0-alpha.1): Development versions

### Releasing (Maintainers)

1. **Update version** in package.json
2. **Update CHANGELOG.md** with release notes
3. **Commit**: `chore: release v0.2.1`
4. **Tag**: `git tag v0.2.1`
5. **Push**: `git push && git push --tags`

Or use the release script:

```bash
npm version patch  # or minor, major
npm run release
```

## Reporting Issues

### Bug Reports

Please include:

1. **Description**: What happened?
2. **Expected behavior**: What should have happened?
3. **Reproduction steps**: How can we reproduce it?
4. **Environment**: OS, Node version, cursor-rag version
5. **Logs/errors**: Any error messages or logs

### Feature Requests

Please include:

1. **Use case**: What problem does this solve?
2. **Proposed solution**: How should it work?
3. **Alternatives**: Any other approaches considered?

### Questions

For questions about usage:

1. Check the [README](README.md) first
2. Search existing issues
3. Open a new issue with the "question" label

## Adding New Features

### Adding a Vector Store Adapter

1. Create `src/adapters/vector/yourstore.ts`:
   ```typescript
   import type { VectorStore, VectorDocument, SearchResult, SearchOptions } from './index.js';
   import type { RAGConfig } from '../../types/index.js';

   export class YourStoreAdapter implements VectorStore {
     async add(docs: VectorDocument[]): Promise<void> { /* ... */ }
     async search(embedding: number[], options: SearchOptions): Promise<SearchResult[]> { /* ... */ }
     async delete(ids: string[]): Promise<void> { /* ... */ }
     async count(): Promise<number> { /* ... */ }
   }
   ```

2. Register in `src/adapters/vector/index.ts`

3. Add to types in `src/types/index.ts`

4. Update setup wizard in `src/cli/commands/setup.ts`

5. Document in README

### Adding an Embedding Model

1. Create `src/adapters/embeddings/yourmodel.ts`:
   ```typescript
   import type { Embedder } from './types.js';

   export class YourModelEmbedder implements Embedder {
     async embed(text: string): Promise<number[]> { /* ... */ }
     async embedBatch(texts: string[]): Promise<number[][]> { /* ... */ }
   }
   ```

2. Register in `src/adapters/embeddings/index.ts`

3. Add to types and setup wizard

4. Document in README

### Adding an MCP Tool

1. Create handler in `src/server/tools/yourtool.ts`

2. Register in `src/server/tools/index.ts`:
   - Add to `ListToolsRequestSchema` handler
   - Add to `CallToolRequestSchema` switch statement

3. Document the tool's purpose and parameters

## Questions?

If you have questions about contributing, feel free to:

- Open an issue with the "question" label
- Reach out to the maintainers

Thank you for contributing! 🎉
