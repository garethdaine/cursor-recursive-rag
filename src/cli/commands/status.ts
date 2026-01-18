import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../services/config.js';
import { createVectorStore } from '../../adapters/vector/index.js';

export const statusCommand = new Command('status')
  .description('Show configuration and statistics')
  .action(async () => {
    try {
      const config = loadConfig();
      const vectorStore = createVectorStore(config.vectorStore, config);

      console.log(chalk.bold('\n📊 Configuration:'));
      console.log(`  Vector Store: ${chalk.cyan(config.vectorStore)}`);
      console.log(`  Embeddings: ${chalk.cyan(config.embeddings)}`);
      console.log(`  Config Path: ${chalk.gray('~/.cursor-rag/config.json')}`);

      console.log(chalk.bold('\n📚 Knowledge Base:'));
      try {
        const count = await vectorStore.count();
        console.log(`  Total chunks: ${chalk.cyan(count.toString())}`);

        // Try to list sources if supported
        if ('listSources' in vectorStore && typeof vectorStore.listSources === 'function') {
          const sources = await (vectorStore as any).listSources();
          console.log(`  Sources: ${chalk.cyan(sources.length.toString())}`);
          for (const source of sources.slice(0, 10)) {
            console.log(`    - ${source.name || source.id} (${source.chunks || '?'} chunks)`);
          }
        }
      } catch (error) {
        console.warn(chalk.yellow(`  Could not fetch statistics: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.error(chalk.yellow('Run "cursor-rag setup" to configure.'));
      process.exit(1);
    }
  });
