import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../services/config.js';
import { createVectorStore } from '../../adapters/vector/index.js';
import { createEmbedder } from '../../adapters/embeddings/index.js';
import { 
  CursorChatReader, 
  createCursorChatReader,
  type ConversationSummary 
} from '../../services/cursorChatReader.js';
import { 
  ConversationProcessor, 
  createConversationProcessor 
} from '../../services/conversationProcessor.js';
import { getMemoryMetadataStore } from '../../services/memoryMetadataStore.js';
import { createEnhancedVectorStore } from '../../services/enhancedVectorStore.js';

const chatCommand = new Command('chat')
  .description('Manage Cursor chat history integration');

chatCommand
  .command('list')
  .description('List available Cursor conversations')
  .option('-n, --limit <n>', 'Maximum conversations to show', '20')
  .option('--since <date>', 'Only show conversations since date (YYYY-MM-DD)')
  .option('--code-only', 'Only show conversations with code blocks')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const reader = createCursorChatReader();

      if (!reader.isDatabaseAvailable()) {
        console.error(chalk.red('Cursor database not found at: ' + reader.getDatabasePath()));
        console.log(chalk.yellow('\nMake sure Cursor is installed and has been used at least once.'));
        process.exit(1);
      }

      const filterOptions: any = {
        limit: parseInt(options.limit, 10),
      };

      if (options.since) {
        filterOptions.since = new Date(options.since);
      }

      if (options.codeOnly) {
        filterOptions.hasCode = true;
      }

      const conversations = reader.listConversations(filterOptions);

      if (options.json) {
        console.log(JSON.stringify(conversations, null, 2));
        return;
      }

      console.log(chalk.cyan(`\n📝 Found ${conversations.length} conversations\n`));

      if (conversations.length === 0) {
        console.log(chalk.yellow('No conversations found matching your criteria.'));
        return;
      }

      const metadataStore = getMemoryMetadataStore();

      for (const conv of conversations) {
        const isProcessed = metadataStore.isConversationProcessed(conv.id);
        const statusIcon = isProcessed ? chalk.green('✓') : chalk.gray('○');
        const dateStr = conv.updatedAt 
          ? conv.updatedAt.toLocaleDateString() + ' ' + conv.updatedAt.toLocaleTimeString()
          : 'Unknown date';

        console.log(`${statusIcon} ${chalk.bold(conv.id.substring(0, 8))}  ${chalk.gray(dateStr)}`);
        console.log(`   Messages: ${conv.messageCount}  ${conv.hasCodeBlocks ? chalk.blue('📦 Has code') : ''}`);
        
        if (conv.preview) {
          const preview = conv.preview.substring(0, 80).replace(/\n/g, ' ');
          console.log(`   ${chalk.gray(preview)}${conv.preview.length > 80 ? '...' : ''}`);
        }
        console.log('');
      }

      const processedCount = conversations.filter(c => 
        metadataStore.isConversationProcessed(c.id)
      ).length;

      console.log(chalk.gray(`\nProcessed: ${processedCount}/${conversations.length}`));
      console.log(chalk.gray(`Legend: ${chalk.green('✓')} processed  ${chalk.gray('○')} not processed`));

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

chatCommand
  .command('ingest')
  .description('Ingest Cursor chat history into RAG knowledge base')
  .option('-n, --limit <n>', 'Maximum conversations to process')
  .option('--since <date>', 'Only process conversations since date (YYYY-MM-DD)')
  .option('--code-only', 'Only process conversations with code blocks')
  .option('--force', 'Re-process already processed conversations')
  .option('--dry-run', 'Show what would be processed without actually doing it')
  .action(async (options) => {
    const spinner = ora('Loading configuration...').start();

    try {
      const config = loadConfig();
      const vectorStore = createVectorStore(config.vectorStore, config);
      const embedder = await createEmbedder(config.embeddings, config);
      const metadataStore = getMemoryMetadataStore();
      const enhancedStore = createEnhancedVectorStore(vectorStore);

      spinner.succeed('Configuration loaded');

      const reader = createCursorChatReader();

      if (!reader.isDatabaseAvailable()) {
        console.error(chalk.red('Cursor database not found at: ' + reader.getDatabasePath()));
        console.log(chalk.yellow('\nMake sure Cursor is installed and has been used at least once.'));
        process.exit(1);
      }

      spinner.start('Scanning conversations...');

      const filterOptions: any = {};

      if (options.limit) {
        filterOptions.limit = parseInt(options.limit, 10);
      }

      if (options.since) {
        filterOptions.since = new Date(options.since);
      }

      if (options.codeOnly) {
        filterOptions.hasCode = true;
      }

      const conversations = reader.listConversations(filterOptions);

      const toProcess = options.force 
        ? conversations 
        : conversations.filter(c => !metadataStore.isConversationProcessed(c.id));

      spinner.succeed(`Found ${conversations.length} conversations, ${toProcess.length} to process`);

      if (toProcess.length === 0) {
        console.log(chalk.yellow('\nNo new conversations to process.'));
        console.log(chalk.gray('Use --force to re-process already processed conversations.'));
        return;
      }

      if (options.dryRun) {
        console.log(chalk.cyan('\n📋 Dry run - would process:\n'));
        for (const conv of toProcess) {
          console.log(`  ${conv.id.substring(0, 8)} - ${conv.messageCount} messages`);
        }
        return;
      }

      const processor = createConversationProcessor({
        includeCodeChunks: true,
        minExchangeLength: 50,
        maxChunkSize: 2000,
        extractEntities: true,
      });

      let totalChunks = 0;
      let processedCount = 0;

      console.log(chalk.cyan('\n🔄 Processing conversations...\n'));

      for (const summary of toProcess) {
        const convSpinner = ora(`Processing ${summary.id.substring(0, 8)}...`).start();

        try {
          const conversation = reader.getConversation(summary.id);
          if (!conversation) {
            convSpinner.warn(`Skipped ${summary.id.substring(0, 8)}: Could not read conversation`);
            continue;
          }

          const result = processor.processConversation(conversation);

          if (result.chunks.length === 0) {
            convSpinner.info(`Skipped ${summary.id.substring(0, 8)}: No meaningful content`);
            continue;
          }

          const documents = await Promise.all(
            result.chunks.map(async (chunk) => {
              const embedding = await embedder.embed(chunk.content);
              return {
                id: chunk.id,
                content: chunk.content,
                embedding,
                metadata: {
                  ...chunk.metadata,
                  source: chunk.source,
                  chunkType: chunk.chunkType,
                  importance: chunk.importance,
                  sourceConversationId: chunk.sourceConversationId,
                  sourceMessageIndex: chunk.sourceMessageIndex,
                },
              };
            })
          );

          await enhancedStore.add(documents);

          metadataStore.markConversationProcessed(
            summary.id,
            summary.messageCount,
            result.chunks.length,
            0
          );

          totalChunks += result.chunks.length;
          processedCount++;

          convSpinner.succeed(
            `Processed ${summary.id.substring(0, 8)}: ` +
            `${result.chunks.length} chunks, ` +
            `${result.metadata.codeBlockCount} code blocks`
          );

        } catch (error) {
          convSpinner.fail(
            `Failed ${summary.id.substring(0, 8)}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      console.log(chalk.green(`\n✅ Ingestion complete!`));
      console.log(chalk.cyan(`   Conversations processed: ${processedCount}`));
      console.log(chalk.cyan(`   Total chunks created: ${totalChunks}`));

    } catch (error) {
      spinner.fail('Ingestion failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

chatCommand
  .command('watch')
  .description('Watch for new Cursor conversations and ingest automatically')
  .option('--interval <seconds>', 'Check interval in seconds', '60')
  .option('--code-only', 'Only process conversations with code blocks')
  .action(async (options) => {
    console.log(chalk.cyan('\n👀 Watching for new Cursor conversations...\n'));
    console.log(chalk.gray(`Check interval: ${options.interval} seconds`));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    const config = loadConfig();
    const vectorStore = createVectorStore(config.vectorStore, config);
    const embedder = await createEmbedder(config.embeddings, config);
    const metadataStore = getMemoryMetadataStore();
    const enhancedStore = createEnhancedVectorStore(vectorStore);
    const reader = createCursorChatReader();
    const processor = createConversationProcessor();

    if (!reader.isDatabaseAvailable()) {
      console.error(chalk.red('Cursor database not found at: ' + reader.getDatabasePath()));
      process.exit(1);
    }

    let lastCheck = new Date();
    let totalIngested = 0;

    const checkForNewConversations = async () => {
      try {
        const filterOptions: any = {
          since: lastCheck,
        };

        if (options.codeOnly) {
          filterOptions.hasCode = true;
        }

        const conversations = reader.listConversations(filterOptions);

        const newConversations = conversations.filter(
          c => !metadataStore.isConversationProcessed(c.id)
        );

        if (newConversations.length > 0) {
          console.log(chalk.cyan(`\n📥 Found ${newConversations.length} new conversation(s)`));

          for (const summary of newConversations) {
            const conversation = reader.getConversation(summary.id);
            if (!conversation) continue;

            const result = processor.processConversation(conversation);
            if (result.chunks.length === 0) continue;

            const documents = await Promise.all(
              result.chunks.map(async (chunk) => {
                const embedding = await embedder.embed(chunk.content);
                return {
                  id: chunk.id,
                  content: chunk.content,
                  embedding,
                  metadata: {
                    ...chunk.metadata,
                    source: chunk.source,
                    chunkType: chunk.chunkType,
                    importance: chunk.importance,
                    sourceConversationId: chunk.sourceConversationId,
                  },
                };
              })
            );

            await enhancedStore.add(documents);

            metadataStore.markConversationProcessed(
              summary.id,
              summary.messageCount,
              result.chunks.length,
              0
            );

            totalIngested++;
            console.log(
              chalk.green(`  ✓ Ingested ${summary.id.substring(0, 8)}: ${result.chunks.length} chunks`)
            );
          }
        }

        lastCheck = new Date();

      } catch (error) {
        console.error(chalk.red(`Watch error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    await checkForNewConversations();

    const intervalMs = parseInt(options.interval, 10) * 1000;
    const intervalId = setInterval(checkForNewConversations, intervalMs);

    process.on('SIGINT', () => {
      clearInterval(intervalId);
      console.log(chalk.yellow(`\n\n👋 Stopped watching. Total ingested: ${totalIngested} conversations`));
      process.exit(0);
    });
  });

chatCommand
  .command('stats')
  .description('Show chat history ingestion statistics')
  .action(async () => {
    try {
      const reader = createCursorChatReader();
      const metadataStore = getMemoryMetadataStore();

      if (!reader.isDatabaseAvailable()) {
        console.error(chalk.red('Cursor database not found.'));
        process.exit(1);
      }

      const totalConversations = reader.getConversationCount();
      const allConversations = reader.listConversations({ limit: 10000 });
      
      let processedCount = 0;
      let totalMessages = 0;
      let conversationsWithCode = 0;

      for (const conv of allConversations) {
        if (metadataStore.isConversationProcessed(conv.id)) {
          processedCount++;
        }
        totalMessages += conv.messageCount;
        if (conv.hasCodeBlocks) {
          conversationsWithCode++;
        }
      }

      const memoryStats = metadataStore.getMemoryStats();

      console.log(chalk.cyan('\n📊 Chat History Statistics\n'));
      
      console.log(chalk.bold('Cursor Database:'));
      console.log(`  Total conversations: ${totalConversations}`);
      console.log(`  Total messages: ${totalMessages}`);
      console.log(`  Conversations with code: ${conversationsWithCode}`);
      
      console.log(chalk.bold('\nIngestion Status:'));
      console.log(`  Processed: ${processedCount}/${totalConversations} (${Math.round(processedCount/totalConversations*100)}%)`);
      console.log(`  Pending: ${totalConversations - processedCount}`);
      
      console.log(chalk.bold('\nMemory Store:'));
      console.log(`  Total chunks: ${memoryStats.totalChunks}`);
      console.log(`  Active chunks: ${memoryStats.activeChunks}`);
      console.log(`  Archived chunks: ${memoryStats.archivedChunks}`);
      console.log(`  Avg decay score: ${memoryStats.avgDecayScore.toFixed(3)}`);
      
      if (Object.keys(memoryStats.chunksByType).length > 0) {
        console.log(chalk.bold('\nChunks by Type:'));
        for (const [type, count] of Object.entries(memoryStats.chunksByType)) {
          console.log(`  ${type}: ${count}`);
        }
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

chatCommand
  .command('reset')
  .description('Reset chat history processing status (does not delete ingested data)')
  .option('--confirm', 'Confirm reset operation')
  .action(async (options) => {
    if (!options.confirm) {
      console.log(chalk.yellow('\n⚠️  This will reset the processing status for all conversations.'));
      console.log(chalk.yellow('   Ingested data will NOT be deleted, but conversations will be'));
      console.log(chalk.yellow('   marked as unprocessed and can be re-ingested.\n'));
      console.log(chalk.gray('Run with --confirm to proceed.\n'));
      return;
    }

    const spinner = ora('Resetting processing status...').start();

    try {
      const metadataStore = getMemoryMetadataStore();
      
      const db = (metadataStore as any).db;
      db.prepare('DELETE FROM processed_conversations').run();

      spinner.succeed('Processing status reset');
      console.log(chalk.green('\nAll conversations marked as unprocessed.'));
      console.log(chalk.gray('Run `cursor-rag chat ingest` to re-process them.\n'));

    } catch (error) {
      spinner.fail('Reset failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

export { chatCommand };
