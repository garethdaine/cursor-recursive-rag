import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../services/config.js';
import { createVectorStore } from '../../adapters/vector/index.js';
import { createEmbedder } from '../../adapters/embeddings/index.js';

export const searchCommand = new Command('search')
  .description('Test search from CLI')
  .argument('<query>', 'Search query')
  .option('--top-k <n>', 'Number of results', '5')
  .action(async (query, options) => {
    try {
      const config = loadConfig();
      const vectorStore = createVectorStore(config.vectorStore, config);
      const embedder = await createEmbedder(config.embeddings, config);

      console.log(chalk.bold(`\n🔍 Searching for: "${query}"\n`));

      const embedding = await embedder.embed(query);
      const results = await vectorStore.search(embedding, { 
        topK: parseInt(options.topK || '5', 10) 
      });

      if (results.length === 0) {
        console.log(chalk.yellow('No results found.'));
        console.log(chalk.gray('Try ingesting some documents first with: cursor-rag ingest <source>\n'));
        return;
      }

      results.forEach((result: any, index: number) => {
        console.log(chalk.bold(`\n${index + 1}. Score: ${result.score.toFixed(4)}`));
        if (result.metadata.source) {
          console.log(chalk.gray(`   Source: ${result.metadata.source}`));
        }
        console.log(chalk.white(result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '')));
      });

      console.log('');
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
