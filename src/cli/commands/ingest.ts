import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { loadConfig } from '../../services/config.js';
import { createVectorStore } from '../../adapters/vector/index.js';
import { createEmbedder } from '../../adapters/embeddings/index.js';
import { crawlAndIngestTool } from '../../server/tools/crawl.js';
import { ingestDocumentTool } from '../../server/tools/ingest.js';

export const ingestCommand = new Command('ingest')
  .description('Ingest documents into knowledge base')
  .argument('<source>', 'URL, file path, or directory')
  .option('--crawl', 'Crawl website (for URLs)')
  .option('--max-pages <n>', 'Max pages to crawl', '100')
  .option('--max-depth <n>', 'Max crawl depth', '3')
  .action(async (source, options) => {
    const spinner = ora('Loading configuration...').start();
    
    try {
      const config = loadConfig();
      const vectorStore = createVectorStore(config.vectorStore, config);
      const embedder = await createEmbedder(config.embeddings, config);

      const deps = { vectorStore, embedder, config };

      spinner.succeed('Configuration loaded');

      if (source.startsWith('http') && options.crawl) {
        spinner.start('Crawling and ingesting...');
        const result = await crawlAndIngestTool({
          url: source,
          maxPages: parseInt(options.maxPages || '100', 10),
          maxDepth: parseInt(options.maxDepth || '3', 10)
        }, deps);
        
        spinner.stop();
        if (result.isError) {
          console.error(chalk.red(result.content[0].text));
          process.exit(1);
        } else {
          console.log(chalk.green(result.content[0].text));
        }
      } else if (source.startsWith('http')) {
        spinner.start('Fetching and ingesting single page...');
        try {
          const response = await fetch(source);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const text = await response.text();
          
          const result = await ingestDocumentTool({
            source: text,
            title: new URL(source).pathname.split('/').pop() || source,
            metadata: { source, url: source }
          }, deps);
          
          spinner.stop();
          if (result.isError) {
            console.error(chalk.red(result.content[0].text));
            process.exit(1);
          } else {
            console.log(chalk.green(result.content[0].text));
          }
        } catch (error) {
          spinner.fail('Failed to fetch URL');
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
          console.log(chalk.yellow('\nTip: Use --crawl flag for better web content extraction with Firecrawl'));
          process.exit(1);
        }
      } else {
        spinner.start('Ingesting local files...');
        try {
          const stats = statSync(source);
          if (stats.isDirectory()) {
            const files = readdirSync(source, { recursive: true })
              .map((f): string => join(source, typeof f === 'string' ? f : f.toString()))
              .filter(f => {
                const ext = extname(f).toLowerCase();
                return ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.html', '.css', '.xml', '.yaml', '.yml'].includes(ext);
              });
            
            let totalChunks = 0;
            for (const file of files) {
              try {
                const fileContent = readFileSync(file, 'utf-8') as string;
                const result = await ingestDocumentTool({
                  source: fileContent,
                  title: file,
                  metadata: { source: file, path: file }
                }, deps);
                
                if (!result.isError) {
                  const match = result.content[0].text.match(/(\d+)\s+chunks/);
                  if (match) totalChunks += parseInt(match[1], 10);
                }
              } catch (error) {
                console.warn(chalk.yellow(`Skipped ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`));
              }
            }
            
            spinner.succeed(`Ingested ${files.length} files (${totalChunks} total chunks)`);
          } else {
            const content = readFileSync(source, 'utf-8') as string;
            const result = await ingestDocumentTool({
              source: content,
              title: source,
              metadata: { source, path: source }
            }, deps);
            
            spinner.stop();
            if (result.isError) {
              console.error(chalk.red(result.content[0].text));
              process.exit(1);
            } else {
              console.log(chalk.green(result.content[0].text));
            }
          }
        } catch (error) {
          spinner.fail('Failed to read file');
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      }

      console.log(chalk.green('\n✅ Ingestion complete!\n'));
    } catch (error) {
      spinner.fail('Ingestion failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
