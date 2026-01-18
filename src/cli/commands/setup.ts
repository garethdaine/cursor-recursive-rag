import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { writeConfig, registerWithCursor } from '../../services/config.js';
import type { RAGConfig, ProxyConfig, MCPGatewayConfig, OpenSkillsConfig } from '../../types/index.js';

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

    // Step 4: Proxy Configuration (optional)
    const proxy = await promptProxy();

    // Step 5: Integrations (optional)
    const { mcpGateway, openSkills } = await promptIntegrations();

    // Step 6: Validate connections
    const spinner = ora('Validating configuration...').start();
    try {
      await validateConfig({ vectorStore, embeddings, apiKeys, proxy, mcpGateway, openSkills });
      spinner.succeed('Configuration validated');
    } catch (error) {
      spinner.fail(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(chalk.red('\nPlease check your configuration and try again.\n'));
      process.exit(1);
    }

    // Step 7: Write config
    const config: RAGConfig = {
      vectorStore: vectorStore as 'chroma' | 'qdrant' | 'vectorize',
      embeddings: embeddings as 'xenova' | 'openai' | 'ollama',
      apiKeys,
      proxy,
      dashboard: {
        enabled: true,
        port: 3333
      },
      mcpGateway,
      openSkills
    };
    writeConfig(config);

    // Step 8: Register with Cursor
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
    console.log('  3. Run: cursor-rag ingest <url> to add docs');
    console.log('  4. Run: cursor-rag dashboard to view the web UI\n');
  });

async function promptVectorStore(): Promise<string> {
  const { vectorStore } = await inquirer.prompt([{
    type: 'list',
    name: 'vectorStore',
    message: 'Select vector store:',
    default: 'redis',
    choices: [
      { name: 'Redis Stack (recommended, persistent) - docker run -p 6379:6379 redis/redis-stack-server', value: 'redis' },
      { name: 'Qdrant (persistent, local Docker or cloud) - docker run -p 6333:6333 qdrant/qdrant', value: 'qdrant' },
      { name: 'Memory (in-process, non-persistent, testing only)', value: 'memory' },
      { name: 'ChromaDB (requires separate server) - docker run -p 8000:8000 chromadb/chroma', value: 'chroma' },
      { name: 'Cloudflare Vectorize (serverless, requires Cloudflare account)', value: 'vectorize' }
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

  // Redis configuration (if using Redis)
  if (vectorStore === 'redis') {
    const { redisUrl } = await inquirer.prompt([{
      type: 'input',
      name: 'redisUrl',
      message: 'Redis URL (default: redis://localhost:6379):',
      default: 'redis://localhost:6379'
    }]);

    apiKeys.redis = {
      url: redisUrl
    };
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

async function promptProxy(): Promise<ProxyConfig> {
  const { useProxy } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useProxy',
    message: 'Do you want to configure a rotating proxy for URL fetching?',
    default: false
  }]);

  if (!useProxy) {
    return { enabled: false, driver: 'none' };
  }

  const { driver } = await inquirer.prompt([{
    type: 'list',
    name: 'driver',
    message: 'Select proxy provider:',
    choices: [
      { name: 'PacketStream (residential proxies)', value: 'packetstream' },
      { name: 'SmartProxy', value: 'smartproxy' }
    ]
  }]);

  const defaults = driver === 'packetstream' 
    ? { host: 'proxy.packetstream.io', port: 31112 }
    : { host: 'gate.smartproxy.com', port: 7000 };

  const { host } = await inquirer.prompt([{
    type: 'input',
    name: 'host',
    message: `Proxy host (default: ${defaults.host}):`,
    default: defaults.host
  }]);

  const { port } = await inquirer.prompt([{
    type: 'input',
    name: 'port',
    message: `Proxy port (default: ${defaults.port}):`,
    default: defaults.port.toString()
  }]);

  const { username } = await inquirer.prompt([{
    type: 'input',
    name: 'username',
    message: 'Proxy username:',
    validate: (input: string) => input.trim() ? true : 'Username is required'
  }]);

  const { password } = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Proxy password:',
    validate: (input: string) => input.trim() ? true : 'Password is required'
  }]);

  return {
    enabled: true,
    driver: driver as 'packetstream' | 'smartproxy',
    host,
    port: parseInt(port, 10),
    username,
    password
  };
}

async function promptIntegrations(): Promise<{ mcpGateway: MCPGatewayConfig; openSkills: OpenSkillsConfig }> {
  console.log(chalk.cyan('\n📦 Optional Integrations\n'));

  // MCP Gateway
  const { useMcpGateway } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useMcpGateway',
    message: 'Enable MCP Gateway integration? (aggregates 87+ tools with token optimization)',
    default: false
  }]);

  let mcpGateway: MCPGatewayConfig = { enabled: false, url: 'http://localhost:3010' };

  if (useMcpGateway) {
    const { gatewayUrl } = await inquirer.prompt([{
      type: 'input',
      name: 'gatewayUrl',
      message: 'MCP Gateway URL:',
      default: 'http://localhost:3010'
    }]);

    const { gatewayApiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'gatewayApiKey',
      message: 'Gateway API key (optional, press Enter to skip):',
      default: ''
    }]);

    mcpGateway = {
      enabled: true,
      url: gatewayUrl,
      apiKey: gatewayApiKey || undefined
    };
  }

  // OpenSkills
  const { useOpenSkills } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useOpenSkills',
    message: 'Enable OpenSkills integration? (universal skills loader for AI agents)',
    default: false
  }]);

  let openSkills: OpenSkillsConfig = { enabled: false, autoIngestSkills: false };

  if (useOpenSkills) {
    const { autoIngest } = await inquirer.prompt([{
      type: 'confirm',
      name: 'autoIngest',
      message: 'Auto-ingest installed skills into RAG knowledge base?',
      default: true
    }]);

    openSkills = {
      enabled: true,
      autoIngestSkills: autoIngest
    };
  }

  return { mcpGateway, openSkills };
}

async function validateConfig(config: RAGConfig): Promise<void> {
  // Basic validation - can be expanded later
  if (!config.vectorStore || !config.embeddings) {
    throw new Error('Vector store and embeddings must be specified');
  }

  if (config.embeddings === 'openai' && !config.apiKeys?.openai) {
    throw new Error('OpenAI API key is required for OpenAI embeddings');
  }

  // Validate proxy config if enabled
  if (config.proxy?.enabled) {
    if (!config.proxy.username || !config.proxy.password) {
      throw new Error('Proxy username and password are required when proxy is enabled');
    }
  }

  // Validate MCP Gateway if enabled
  if (config.mcpGateway?.enabled) {
    if (!config.mcpGateway.url) {
      throw new Error('MCP Gateway URL is required when integration is enabled');
    }
  }

  // TODO: Add actual connection tests for vector stores and embeddings
  // For now, just validate that required fields are present
}
