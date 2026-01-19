import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  MaintenanceScheduler,
  getMaintenanceScheduler,
  type MaintenanceJobType,
  type MaintenanceJobResult,
} from '../../services/maintenanceScheduler.js';
import { getMemoryMetadataStore } from '../../services/memoryMetadataStore.js';
import { getRelationshipGraph } from '../../services/relationshipGraph.js';
import { getCategoryManager } from '../../services/categoryManager.js';

const maintenanceCommand = new Command('maintenance')
  .description('Memory system maintenance operations');

maintenanceCommand
  .command('run <job>')
  .description('Run a maintenance job manually')
  .addHelpText('after', `
Available jobs:
  decay       - Update decay scores for all chunks
  consolidate - Nightly consolidation (decay, duplicates, hot items)
  summarize   - Weekly category summarization
  reindex     - Monthly reindex (cleanup, optimization)
  cleanup     - Remove archived data (use with caution)`)
  .option('--dry-run', 'Show what would happen without making changes (cleanup only)')
  .action(async (job: string, options) => {
    const validJobs: MaintenanceJobType[] = ['decay', 'consolidate', 'summarize', 'reindex', 'cleanup'];
    
    if (!validJobs.includes(job as MaintenanceJobType)) {
      console.error(chalk.red(`Unknown job: ${job}`));
      console.log(chalk.gray(`Available jobs: ${validJobs.join(', ')}`));
      process.exit(1);
    }

    const spinner = ora(`Running ${job} maintenance...`).start();

    try {
      const scheduler = getMaintenanceScheduler();
      let result: MaintenanceJobResult;

      if (job === 'cleanup' && options.dryRun) {
        result = await scheduler.runCleanup(true);
      } else {
        result = await scheduler.runJob(job as MaintenanceJobType);
      }

      if (result.success) {
        spinner.succeed(`${job} maintenance completed`);
      } else {
        spinner.warn(`${job} maintenance completed with errors`);
      }

      console.log(chalk.cyan('\n📊 Results:\n'));
      console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
      
      for (const [metric, value] of Object.entries(result.metrics)) {
        const label = metric.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        console.log(`  ${label}: ${value}`);
      }

      if (result.errors.length > 0) {
        console.log(chalk.yellow('\n⚠️  Errors:'));
        for (const error of result.errors) {
          console.log(chalk.yellow(`  - ${error}`));
        }
      }

      console.log('');

    } catch (error) {
      spinner.fail(`${job} maintenance failed`);
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

maintenanceCommand
  .command('start')
  .description('Start the background maintenance scheduler')
  .action(async () => {
    console.log(chalk.cyan('\n🔧 Starting maintenance scheduler...\n'));

    try {
      const scheduler = getMaintenanceScheduler();
      scheduler.start();

      console.log(chalk.green('Scheduler is running.'));
      console.log(chalk.gray('\nScheduled jobs:'));
      console.log(chalk.gray('  - Hourly: Decay score updates'));
      console.log(chalk.gray('  - Daily (3 AM): Nightly consolidation'));
      console.log(chalk.gray('  - Weekly (Sunday 4 AM): Category summarization'));
      console.log(chalk.gray('  - Monthly (1st, 5 AM): Reindex and optimization'));
      console.log(chalk.gray('\nPress Ctrl+C to stop.\n'));

      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n👋 Stopping scheduler...'));
        scheduler.stop();
        console.log(chalk.green('Scheduler stopped gracefully.'));
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        scheduler.stop();
        process.exit(0);
      });

      // Keep the process alive
      await new Promise(() => {});

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

maintenanceCommand
  .command('stats')
  .description('Show memory system maintenance statistics')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const metadataStore = getMemoryMetadataStore();
      const relationshipGraph = getRelationshipGraph(metadataStore);
      const categoryManager = getCategoryManager(metadataStore);
      const scheduler = getMaintenanceScheduler(metadataStore);

      await categoryManager.initialize();

      const memoryStats = metadataStore.getMemoryStats();
      const graphStats = relationshipGraph.getStats();
      const schedulerStats = scheduler.getStats();
      const categoriesWithStats = categoryManager.getAllCategoriesWithStats();

      if (options.json) {
        console.log(JSON.stringify({
          memory: memoryStats,
          graph: graphStats,
          scheduler: schedulerStats,
          categories: categoriesWithStats,
        }, null, 2));
        return;
      }

      console.log(chalk.cyan('\n📊 Memory System Statistics\n'));

      console.log(chalk.bold('Chunk Storage:'));
      console.log(`  Total chunks: ${memoryStats.totalChunks}`);
      console.log(`  Active: ${memoryStats.activeChunks}`);
      console.log(`  Archived: ${memoryStats.archivedChunks}`);
      console.log(`  Avg decay score: ${memoryStats.avgDecayScore.toFixed(3)}`);
      console.log(`  Avg importance: ${memoryStats.avgImportance.toFixed(3)}`);
      console.log(`  Total accesses: ${memoryStats.totalAccesses}`);

      if (Object.keys(memoryStats.chunksByType).length > 0) {
        console.log(chalk.bold('\nChunks by Type:'));
        for (const [type, count] of Object.entries(memoryStats.chunksByType)) {
          console.log(`  ${type}: ${count}`);
        }
      }

      console.log(chalk.bold('\nRelationship Graph:'));
      console.log(`  Total relationships: ${graphStats.totalRelationships}`);
      console.log(`  Avg per chunk: ${graphStats.avgRelationshipsPerChunk.toFixed(2)}`);
      console.log(`  Max depth: ${graphStats.maxDepth}`);
      console.log(`  Isolated chunks: ${graphStats.isolatedChunks}`);

      if (Object.keys(graphStats.relationshipsByType).length > 0) {
        console.log(chalk.bold('\nRelationships by Type:'));
        for (const [type, count] of Object.entries(graphStats.relationshipsByType)) {
          if (count > 0) {
            console.log(`  ${type}: ${count}`);
          }
        }
      }

      console.log(chalk.bold('\nCategories:'));
      console.log(`  Total: ${memoryStats.categoryCount}`);
      for (const cat of categoriesWithStats) {
        if (cat.chunkCount > 0) {
          console.log(`  ${cat.name}: ${cat.chunkCount} items (avg relevance: ${cat.avgRelevanceScore.toFixed(2)})`);
        }
      }

      console.log(chalk.bold('\nMaintenance Scheduler:'));
      console.log(`  Jobs run: ${schedulerStats.totalJobsRun}`);
      console.log(`  Total errors: ${schedulerStats.totalErrors}`);
      console.log(`  Running: ${scheduler.isRunning() ? chalk.green('Yes') : chalk.gray('No')}`);
      
      if (schedulerStats.lastDecayUpdate) {
        console.log(`  Last decay update: ${schedulerStats.lastDecayUpdate.toLocaleString()}`);
      }
      if (schedulerStats.lastConsolidation) {
        console.log(`  Last consolidation: ${schedulerStats.lastConsolidation.toLocaleString()}`);
      }
      if (schedulerStats.lastSummarization) {
        console.log(`  Last summarization: ${schedulerStats.lastSummarization.toLocaleString()}`);
      }
      if (schedulerStats.lastReindex) {
        console.log(`  Last reindex: ${schedulerStats.lastReindex.toLocaleString()}`);
      }

      if (schedulerStats.jobHistory.length > 0) {
        console.log(chalk.bold('\nRecent Jobs:'));
        const recentJobs = schedulerStats.jobHistory.slice(-5);
        for (const job of recentJobs) {
          const status = job.success ? chalk.green('✓') : chalk.red('✗');
          const time = job.startTime.toLocaleTimeString();
          console.log(`  ${status} ${job.jobName} at ${time} (${(job.duration / 1000).toFixed(1)}s)`);
        }
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

maintenanceCommand
  .command('cleanup')
  .description('Clean up archived and stale data')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .option('--confirm', 'Confirm deletion (required without --dry-run)')
  .action(async (options) => {
    try {
      if (!options.dryRun && !options.confirm) {
        console.log(chalk.yellow('\n⚠️  This will permanently delete archived data.\n'));
        console.log('Options:');
        console.log('  --dry-run   Show what would be deleted without actually deleting');
        console.log('  --confirm   Proceed with deletion\n');
        console.log(chalk.gray('Run with --dry-run first to see what will be affected.\n'));
        return;
      }

      const spinner = ora(options.dryRun ? 'Analyzing data...' : 'Cleaning up data...').start();

      const scheduler = getMaintenanceScheduler();
      const result = await scheduler.runCleanup(options.dryRun);

      if (result.success) {
        spinner.succeed(options.dryRun ? 'Analysis complete' : 'Cleanup complete');
      } else {
        spinner.warn('Cleanup completed with errors');
      }

      console.log(chalk.cyan('\n📊 Results:\n'));

      if (options.dryRun) {
        console.log(chalk.yellow('  DRY RUN - No data was deleted\n'));
      }

      console.log(`  Archived chunks found: ${result.metrics.archivedChunksFound}`);
      console.log(`  Low decay score chunks: ${result.metrics.lowDecayChunksFound}`);
      
      if (options.dryRun) {
        console.log(`  Would delete: ${result.metrics.wouldDelete} chunks`);
      } else {
        console.log(`  Deleted: ${result.metrics.deleted} chunks`);
      }

      if (result.errors.length > 0) {
        console.log(chalk.yellow('\n⚠️  Errors:'));
        for (const error of result.errors) {
          console.log(chalk.yellow(`  - ${error}`));
        }
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

export { maintenanceCommand };
