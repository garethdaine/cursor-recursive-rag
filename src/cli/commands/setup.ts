import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { writeConfig, registerWithCursor } from '../../services/config.js';
import type { RAGConfig } from '../../types/index.js';

export const setupCommand = new Command('setup')
  .description('Interactive setup wizard')
  .option('--vector-store <type>', 'Vector store: chroma, qdrant, vectorize')
  .option('--embeddings <type>', 'Embeddings: xenova, openai, ollama')
  .action(async (options) => {
    console.log(chalk.bold('\n🚀 Cursor Recursive RAG Setup\n'));

    // Step 1: Vector Store Selection
    const vectorStore = options.vectorStore || await promptVectorStore();

    // Step 2: Embedding Model Selection
    const embeddings = options.embeddings || await promptEmbeddings();

    // Step 3: API Keys (conditional)
    const apiKeys = await promptApiKeys(vectorStore, embeddings);

    // Step 4: Validate connections
    const spinner = ora('Validating configuration...').start();
    try {
      await validateConfig({ vectorStore, embeddings, apiKeys });
      spinner.succeed('Configuration validated');
    } catch (error) {
      spinner.fail(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(chalk.red('\nPlease check your configuration and try again.\n'));
      process.exit(1);
    }

    // Step 5: Write config
    const config: RAGConfig = {
      vectorStore: vectorStore as 'chroma' | 'qdrant' | 'vectorize',
      embeddings: embeddings as 'xenova' | 'openai' | 'ollama',
      apiKeys
    };
    writeConfig(config);

    // Step 6: Register with Cursor
    try {
      await registerWithCursor();
      console.log(chalk.green('✅ MCP server registered with Cursor'));
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Could not auto-register with Cursor: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.warn(chalk.yellow('   You may need to manually add the server to ~/.cursor/mcp.json'));
    }

    console.log(chalk.green('\n✅ Setup complete!\n'));
    console.log('Next steps:');
    console.log('  1. Restart Cursor IDE');
    console.log('  2. Use @recursive-rag in chat');
    console.log('  3. Run: cursor-rag ingest <url> to add docs\n');
  });

async function promptVectorStore(): Promise<string> {
  const { vectorStore } = await inquirer.prompt([{
    type: 'list',
    name: 'vectorStore',
    message: 'Select vector store:',
    choices: [
      { name: 'ChromaDB (local, zero setup)', value: 'chroma' },
      { name: 'Qdrant (local Docker or cloud)', value: 'qdrant' },
      { name: 'Cloudflare Vectorize (serverless)', value: 'vectorize' }
    ]
  }]);
  return vectorStore;
}

async function promptEmbeddings(): Promise<string> {
  const { embeddings } = await inquirer.prompt([{
    type: 'list',
    name: 'embeddings',
    message: 'Select embedding model:',
    choices: [
      { name: 'Local (Xenova/transformers.js) - Free, private', value: 'xenova' },
      { name: 'Ollama - Local, configurable models', value: 'ollama' },
      { name: 'OpenAI text-embedding-3-small - High quality', value: 'openai' }
    ]
  }]);
  return embeddings;
}

async function promptApiKeys(vectorStore: string, embeddings: string): Promise<RAGConfig['apiKeys']> {
  const apiKeys: RAGConfig['apiKeys'] = {};

  // OpenAI API key (for OpenAI embeddings or if needed)
  if (embeddings === 'openai') {
    const { openaiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'openaiKey',
      message: 'Enter OpenAI API key (starts with sk-):',
      validate: (input: string) => {
        if (!input || !input.startsWith('sk-')) {
          return 'OpenAI API key must start with sk-';
        }
        return true;
      }
    }]);
    apiKeys.openai = openaiKey;
  }

  // Firecrawl API key (optional but recommended)
  const { useFirecrawl } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useFirecrawl',
    message: 'Do you want to use Firecrawl for web crawling? (recommended)',
    default: true
  }]);

  if (useFirecrawl) {
    const { firecrawlKey } = await inquirer.prompt([{
      type: 'password',
      name: 'firecrawlKey',
      message: 'Enter Firecrawl API key (starts with fc-):',
      validate: (input: string) => {
        if (!input || !input.startsWith('fc-')) {
          return 'Firecrawl API key must start with fc-';
        }
        return true;
      }
    }]);
    apiKeys.firecrawl = firecrawlKey;
  }

  // Qdrant configuration (if using Qdrant)
  if (vectorStore === 'qdrant') {
    const { qdrantUrl } = await inquirer.prompt([{
      type: 'input',
      name: 'qdrantUrl',
      message: 'Qdrant URL (default: http://localhost:6333):',
      default: 'http://localhost:6333'
    }]);

    const { qdrantApiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'qdrantApiKey',
      message: 'Qdrant API key (optional, press Enter to skip):',
      default: ''
    }]);

    apiKeys.qdrant = {
      url: qdrantUrl,
      apiKey: qdrantApiKey || undefined
    };
  }

  // Ollama configuration (if using Ollama)
  if (embeddings === 'ollama') {
    const { ollamaUrl } = await inquirer.prompt([{
      type: 'input',
      name: 'ollamaUrl',
      message: 'Ollama base URL (default: http://localhost:11434):',
      default: 'http://localhost:11434'
    }]);

    const { ollamaModel } = await inquirer.prompt([{
      type: 'input',
      name: 'ollamaModel',
      message: 'Ollama embedding model (default: nomic-embed-text):',
      default: 'nomic-embed-text'
    }]);

    apiKeys.ollama = {
      baseUrl: ollamaUrl,
      model: ollamaModel
    };
  }

  return apiKeys;
}

async function validateConfig(config: RAGConfig): Promise<void> {
  // Basic validation - can be expanded later
  if (!config.vectorStore || !config.embeddings) {
    throw new Error('Vector store and embeddings must be specified');
  }

  if (config.embeddings === 'openai' && !config.apiKeys?.openai) {
    throw new Error('OpenAI API key is required for OpenAI embeddings');
  }

  // TODO: Add actual connection tests for vector stores and embeddings
  // For now, just validate that required fields are present
}
